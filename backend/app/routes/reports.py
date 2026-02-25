from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.supabase_client import supabase
import os

router = APIRouter(prefix="/reports", tags=["reports"])


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

    resp = (
        supabase
        .schema("reports")
        .table("report_jobs")
        .insert({
            "report_id": payload.report_id,
            "parameters": payload.parameters or {},
            "status": "queued",
        })
        .execute()
    )

    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create report job")

    return resp.data[0]


@router.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request):
    validate_admin_token(request)

    resp = (
        supabase
        .schema("reports")
        .table("report_jobs")
        .select("*")
        .eq("id", job_id)
        .single()
        .execute()
    )

    if not resp.data:
        raise HTTPException(status_code=404, detail="Job not found")

    return resp.data

@router.get("/jobs")
def list_jobs(report_id: str, request: Request):
    validate_admin_token(request)

    resp = (
        supabase
        .schema("reports")
        .table("report_jobs")
        .select("*")
        .eq("report_id", report_id)
        .order("created_at", desc=True)
        .limit(5)
        .execute()
    )

    return resp.data or []