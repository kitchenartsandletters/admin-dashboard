

# ============================================================
# REPORT JOBS (Async Reporting Framework)
# ============================================================

from datetime import datetime, timezone

def enqueue_report_job(report_id: str, requested_by: str | None = None, parameters: dict | None = None):
    """
    Insert a new report job into reports.report_jobs.
    """
    parameters = parameters or {}

    payload = {
        "report_id": report_id,
        "status": "queued",
        "requested_by": requested_by,
        "parameters": parameters,
    }

    resp = supabase.schema("reports") \
        .table("report_jobs") \
        .insert(payload) \
        .execute()

    if not resp.data:
        raise Exception("Failed to enqueue report job.")

    return resp.data[0]


def claim_next_report_job():
    """
    Atomically claim the next queued job using the
    reports.reports_claim_next_job RPC.
    """
    resp = supabase.rpc("reports_claim_next_job").execute()

    if resp.data:
        return resp.data[0]

    return None


def update_report_job_status(
    job_id: str,
    *,
    status: str,
    result: dict | None = None,
    error: str | None = None,
):
    """
    Update job status + metadata.
    """

    update_payload = {
        "status": status,
    }

    now_utc = datetime.now(timezone.utc).isoformat()

    if status == "running":
        update_payload["started_at"] = now_utc

    if status in ("success", "failed", "cancelled"):
        update_payload["completed_at"] = now_utc

    if result is not None:
        update_payload["result"] = result

    if error is not None:
        update_payload["error"] = error

    resp = supabase.schema("reports") \
        .table("report_jobs") \
        .update(update_payload) \
        .eq("id", job_id) \
        .execute()

    if getattr(resp, "error", None):
        raise Exception(f"Failed to update report job: {resp.error}")

    return {"success": True}


def fetch_report_job(job_id: str):
    """
    Retrieve a single report job record.
    """
    resp = supabase.schema("reports") \
        .table("report_jobs") \
        .select("*") \
        .eq("id", job_id) \
        .single() \
        .execute()

    return resp.data