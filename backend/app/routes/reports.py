from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import date
from app.supabase_client import supabase
from app.auth import validate_admin_token
import os
import logging

logger = logging.getLogger("uvicorn.error")

# Auth runs as a router dependency, before request-body validation, so an
# unauthenticated call gets 403 rather than a 422 that describes the schema.
router = APIRouter(prefix="/reports", tags=["reports"], dependencies=[Depends(validate_admin_token)])

VALID_REPORT_IDS = {
    "daily_sales_kal",
    "weekly_maintenance",
    "lop_unfulfilled",
}

# A report window runs from start_date at opening (10:00 AM ET) up to end_date at
# 9:59 AM ET, so end_date must be strictly after start_date. Equal dates produce an
# empty window (on 2026-10-21 three such runs reported success and emailed nothing).
WINDOW_RULE = (
    "end_date must be after start_date. A report covers start_date from 10:00 AM ET "
    "up to 9:59 AM ET on end_date, so the same date twice covers nothing. "
    "For one day's sales, set end_date to the next day."
)


def _validate_window(start_s: Optional[str], end_s: Optional[str]) -> None:
    if not start_s and not end_s:
        return
    if not (start_s and end_s):
        raise HTTPException(status_code=422, detail="Provide both start_date and end_date, or neither.")
    try:
        start_d = date.fromisoformat(str(start_s)[:10])
        end_d   = date.fromisoformat(str(end_s)[:10])
    except ValueError:
        raise HTTPException(status_code=422, detail="start_date and end_date must be YYYY-MM-DD.")
    if end_d <= start_d:
        raise HTTPException(status_code=422, detail=WINDOW_RULE)


VALID_OVERRIDE_TYPES = {
    "holiday_closure",
    "special_open_sunday",
    "open_override",
}


# ─── Pydantic models ──────────────────────────────────────────────────────────

class RunReportRequest(BaseModel):
    report_id:  str
    parameters: Optional[Dict[str, Any]] = None

class ScheduleOverrideRequest(BaseModel):
    report_id:      str
    scheduled_date: str   # YYYY-MM-DD
    start_date:     str   # YYYY-MM-DD
    end_date:       str   # YYYY-MM-DD
    label:          Optional[str] = None

class CalendarOverrideRequest(BaseModel):
    date:          str   # YYYY-MM-DD
    override_type: str   # 'holiday_closure' | 'special_open_sunday' | 'open_override'
    label:         Optional[str] = None
    location_id:   str = "kal"


# ─── Auth ─────────────────────────────────────────────────────────────────────

# ─── Report job routes ────────────────────────────────────────────────────────

@router.post("/run")
def run_report(payload: RunReportRequest, request: Request):

    if payload.report_id not in VALID_REPORT_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown report_id '{payload.report_id}'. "
                   f"Valid values: {sorted(VALID_REPORT_IDS)}",
        )

    params = payload.parameters or {}
    _validate_window(params.get("start_date"), params.get("end_date"))

    try:
        resp = (
            supabase
            .schema("reports")
            .table("report_jobs")
            .insert({
                "report_id":  payload.report_id,
                "parameters": payload.parameters or {},
                "status":     "queued",
            })
            .execute()
        )
        if not resp.data:
            raise Exception("Insert returned no data.")
        job = resp.data[0]
        return {"id": job["id"], "status": job["status"], "report_id": job["report_id"]}
    except Exception as e:
        logger.exception(f"Failed to enqueue report job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request):

    try:
        resp = (
            supabase
            .schema("reports")
            .table("report_jobs")
            .select("id, report_id, status, parameters, result, error, created_at, started_at, completed_at")
            .eq("id", job_id)
            .single()
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Job not found")
        return resp.data
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to fetch report job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs")
def list_jobs(request: Request, report_id: Optional[str] = None):

    try:
        q = (
            supabase
            .schema("reports")
            .table("report_jobs")
            .select("id, report_id, status, parameters, result, error, created_at, started_at, completed_at")
            .order("created_at", desc=True)
            .limit(20)
        )
        if report_id:
            q = q.eq("report_id", report_id)
        resp = q.execute()
        return resp.data or []
    except Exception as e:
        logger.exception(f"Failed to list report jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Schedule override routes ─────────────────────────────────────────────────

@router.get("/schedule-override")
def get_schedule_override(
    request: Request,
    report_id: str,
    scheduled_date: str,
):

    try:
        resp = (
            supabase
            .schema("reports")
            .table("report_schedule_overrides")
            .select("*")
            .eq("report_id", report_id)
            .eq("scheduled_date", scheduled_date)
            .is_("used_at", "null")
            .limit(1)
            .execute()
        )
        data = resp.data
        return data[0] if data else None
    except Exception as e:
        logger.exception(f"Failed to fetch schedule override: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule-override")
def upsert_schedule_override(payload: ScheduleOverrideRequest, request: Request):

    if payload.report_id not in VALID_REPORT_IDS:
        raise HTTPException(status_code=422, detail=f"Unknown report_id '{payload.report_id}'")
    _validate_window(payload.start_date, payload.end_date)

    try:
        table = supabase.schema("reports").table("report_schedule_overrides")

        existing = (
            table
            .select("id")
            .eq("report_id", payload.report_id)
            .eq("scheduled_date", payload.scheduled_date)
            .limit(1)
            .execute()
        )

        if existing.data:
            row_id = existing.data[0]["id"]
            resp = (
                table
                .update({
                    "start_date": payload.start_date,
                    "end_date":   payload.end_date,
                    "label":      payload.label,
                    "used_at":    None,
                })
                .eq("id", row_id)
                .execute()
            )
        else:
            resp = (
                table
                .insert({
                    "report_id":      payload.report_id,
                    "scheduled_date": payload.scheduled_date,
                    "start_date":     payload.start_date,
                    "end_date":       payload.end_date,
                    "label":          payload.label,
                })
                .execute()
            )

        if not resp.data:
            raise Exception("Operation returned no data.")
        return resp.data[0]
    except Exception as e:
        logger.exception(f"Failed to upsert schedule override: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/schedule-override/{override_id}")
def delete_schedule_override(override_id: str, request: Request):

    try:
        supabase \
            .schema("reports") \
            .table("report_schedule_overrides") \
            .delete() \
            .eq("id", override_id) \
            .execute()
        return {"success": True}
    except Exception as e:
        logger.exception(f"Failed to delete schedule override {override_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Calendar override routes ─────────────────────────────────────────────────

@router.get("/calendar-overrides")
def list_calendar_overrides(
    request: Request,
    year: Optional[int] = None,
    location_id: str = "kal",
):

    try:
        q = (
            supabase
            .schema("reports")
            .table("business_calendar_overrides")
            .select("id, date, year, override_type, label, created_at")
            .eq("location_id", location_id)
            .order("date", desc=False)
        )
        if year:
            q = q.eq("year", year)
        resp = q.execute()
        return resp.data or []
    except Exception as e:
        logger.exception(f"Failed to list calendar overrides: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calendar-overrides")
def upsert_calendar_override(payload: CalendarOverrideRequest, request: Request):

    if payload.override_type not in VALID_OVERRIDE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"override_type must be one of: {sorted(VALID_OVERRIDE_TYPES)}",
        )

    try:
        table = supabase.schema("reports").table("business_calendar_overrides")

        existing = (
            table
            .select("id")
            .eq("date", payload.date)
            .eq("override_type", payload.override_type)
            .eq("location_id", payload.location_id)
            .limit(1)
            .execute()
        )

        if existing.data:
            row_id = existing.data[0]["id"]
            resp = (
                table
                .update({"label": payload.label})
                .eq("id", row_id)
                .execute()
            )
        else:
            resp = (
                table
                .insert({
                    "date":          payload.date,
                    "override_type": payload.override_type,
                    "label":         payload.label,
                    "location_id":   payload.location_id,
                })
                .execute()
            )

        if not resp.data:
            raise Exception("Operation returned no data.")
        return resp.data[0]
    except Exception as e:
        logger.exception(f"Failed to upsert calendar override: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/calendar-overrides")
def delete_calendar_override(
    request: Request,
    date: str,
    override_type: str,
    location_id: str = "kal",
):

    try:
        supabase \
            .schema("reports") \
            .table("business_calendar_overrides") \
            .delete() \
            .eq("date", date) \
            .eq("override_type", override_type) \
            .eq("location_id", location_id) \
            .execute()
        return {"success": True}
    except Exception as e:
        logger.exception(f"Failed to delete calendar override {date}/{override_type}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Report product exclusion routes ─────────────────────────────────────────

class ExclusionRequest(BaseModel):
    product_id:    str
    product_title: Optional[str] = None
    reason:        Optional[str] = None


@router.get("/exclusions")
def list_exclusions(request: Request):
    try:
        resp = (
            supabase
            .schema("reports")
            .table("report_product_exclusions")
            .select("id, product_id, product_title, reason, created_at")
            .order("created_at", desc=True)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.exception(f"Failed to list exclusions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/exclusions")
def add_exclusion(payload: ExclusionRequest, request: Request):

    # Title comes from the caller (the form's optional field). This backend no
    # longer calls Shopify; the old lookup used the retired SHOPIFY_ACCESS_TOKEN
    # and had been failing silently. Blank titles are stored as NULL.
    product_title = (payload.product_title or "").strip() or None

    try:
        product_id = payload.product_id if payload.product_id.startswith("gid://") \
            else f"gid://shopify/Product/{payload.product_id}"

        resp = (
            supabase
            .schema("reports")
            .table("report_product_exclusions")
            .insert({
                "product_id":    product_id,
                "product_title": product_title,
                "reason":        payload.reason,
            })
            .execute()
        )
        if not resp.data:
            raise Exception("Insert returned no data.")
        return resp.data[0]
    except Exception as e:
        logger.exception(f"Failed to add exclusion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/exclusions/{exclusion_id}")
def remove_exclusion(exclusion_id: str, request: Request):
    try:
        supabase \
            .schema("reports") \
            .table("report_product_exclusions") \
            .delete() \
            .eq("id", exclusion_id) \
            .execute()
        return {"success": True}
    except Exception as e:
        logger.exception(f"Failed to remove exclusion {exclusion_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))