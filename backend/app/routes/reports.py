from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.supabase_client import supabase
import os
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/reports", tags=["reports"])

VALID_REPORT_IDS = {"daily_sales", "weekly_maintenance", "lop_unfulfilled"}


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
    override_type: str   # 'holiday_closure' | 'special_open_sunday'
    label:         Optional[str] = None


# ─── Auth ─────────────────────────────────────────────────────────────────────

def validate_admin_token(request: Request):
    header = request.headers.get("Authorization", "")
    token  = None
    if header.lower().startswith("bearer "):
        token = header.split(" ", 1)[1].strip()
    expected = os.getenv("VITE_DBS_ADMIN_TOKEN") or os.getenv("VITE_ADMIN_TOKEN")
    if not expected or token != expected:
        raise HTTPException(status_code=403, detail="Unauthorized")


# ─── Report job routes ────────────────────────────────────────────────────────

@router.post("/run")
def run_report(payload: RunReportRequest, request: Request):
    validate_admin_token(request)

    if payload.report_id not in VALID_REPORT_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown report_id '{payload.report_id}'. "
                   f"Valid values: {sorted(VALID_REPORT_IDS)}",
        )

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
    validate_admin_token(request)

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
    validate_admin_token(request)

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
    """
    Return the active (unconsumed) schedule override for a given report + date,
    or null if none exists.
    """
    validate_admin_token(request)

    try:
        resp = (
            supabase
            .table("report_schedule_overrides")
            .select("*")
            .eq("report_id", report_id)
            .eq("scheduled_date", scheduled_date)
            .is_("used_at", "null")   # only unconsumed overrides
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
    """
    Create or update the window override for a scheduled run.
    Uses upsert on (report_id, scheduled_date).
    """
    validate_admin_token(request)

    if payload.report_id not in VALID_REPORT_IDS:
        raise HTTPException(status_code=422, detail=f"Unknown report_id '{payload.report_id}'")
    if payload.start_date > payload.end_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")

    try:
        table = supabase.table("report_schedule_overrides")

        # Check if a row already exists for this report + scheduled_date
        existing = (
            table
            .select("id")
            .eq("report_id", payload.report_id)
            .eq("scheduled_date", payload.scheduled_date)
            .limit(1)
            .execute()
        )

        if existing.data:
            # Update existing row
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
            # Insert new row
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
    """Delete a schedule override by its UUID."""
    validate_admin_token(request)

    try:
        supabase \
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
def list_calendar_overrides(request: Request, year: Optional[int] = None):
    """
    Return all calendar overrides, optionally filtered by year.
    Used by BusinessCalendarPage to hydrate the calendar.
    """
    validate_admin_token(request)

    try:
        q = (
            supabase
            .table("business_calendar_overrides")
            .select("id, date, year, override_type, label, created_at")
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
    """
    Add or update a calendar override (holiday closure or special open Sunday).
    Upserts on (date, override_type).
    """
    validate_admin_token(request)

    if payload.override_type not in ("holiday_closure", "special_open_sunday"):
        raise HTTPException(status_code=422, detail="override_type must be 'holiday_closure' or 'special_open_sunday'")

    try:
        table = supabase.table("business_calendar_overrides")

        # Check if a row already exists for this date + override_type
        existing = (
            table
            .select("id")
            .eq("date", payload.date)
            .eq("override_type", payload.override_type)
            .limit(1)
            .execute()
        )

        if existing.data:
            # Update label on existing row
            row_id = existing.data[0]["id"]
            resp = (
                table
                .update({"label": payload.label})
                .eq("id", row_id)
                .execute()
            )
        else:
            # Insert new override row
            resp = (
                table
                .insert({
                    "date":          payload.date,
                    "override_type": payload.override_type,
                    "label":         payload.label,
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
):
    """Remove a calendar override by date + type."""
    validate_admin_token(request)

    try:
        supabase \
            .table("business_calendar_overrides") \
            .delete() \
            .eq("date", date) \
            .eq("override_type", override_type) \
            .execute()
        return {"success": True}
    except Exception as e:
        logger.exception(f"Failed to delete calendar override {date}/{override_type}: {e}")
        raise HTTPException(status_code=500, detail=str(e))