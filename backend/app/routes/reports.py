from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.supabase_client import supabase
import os
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/reports", tags=["reports"])

VALID_REPORT_IDS = {"daily_sales", "weekly_maintenance", "lop_unfulfilled"}


class RunReportRequest(BaseModel):
    report_id: str
    parameters: Optional[Dict[str, Any]] = None


def validate_admin_token(request: Request):
    header = request.headers.get("Authorization", "")
    token = None

    if header.lower().startswith("bearer "):
        token = header.split(" ", 1)[1].strip()

    expected = os.getenv("VITE_DBS_ADMIN_TOKEN") or os.getenv("VITE_ADMIN_TOKEN")

    if not expected or token != expected:
        raise HTTPException(status_code=403, detail="Unauthorized")


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
            .select("id, report_id, status, parameters, result, error, requested_by, created_at, started_at, completed_at")
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