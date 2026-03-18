from fastapi import APIRouter, Request, HTTPException
from app.supabase_client import supabase
from typing import Dict, Any
import time
import os
import logging
logger = logging.getLogger("uvicorn.error")

def validate_admin_token(request: Request, token: str = ""):
    """Accept token via query param OR Authorization header"""
    header = request.headers.get("Authorization", "")
    provided = token

    if header.lower().startswith("bearer "):
        provided = header.split(" ", 1)[1].strip()

    expected = os.getenv("VITE_ADMIN_TOKEN")
    if not expected or provided != expected:
        raise HTTPException(status_code=403, detail="Unauthorized")

router = APIRouter()

@router.get("/campaign-stats")
async def get_campaign_stats(
    request: Request,
    campaign: str = "ngtbf",
    token: str = ""
) -> Dict[str, Any]:

    validate_admin_token(request, token)

    # --- 1. TOTALS (recipients) ---
    try:
        total_q = supabase.table("signed_copy_campaign_recipients").select("id", count="exact").execute()
        sent_q = supabase.table("signed_copy_campaign_recipients").select("id", count="exact").eq("email_sent", True).execute()

        total_recipients = total_q.count or 0
        total_sent = sent_q.count or 0
        total_remaining = total_recipients - total_sent
    except Exception as e:
        logger.error(f"totals query failed: {e}")
        total_recipients = 0
        total_sent = 0
        total_remaining = 0

    # --- 2. DELIVERY ---
    try:
        sent_q = supabase.table("email_log").select("id", count="exact").eq("status", "sent").execute()
        failed_q = supabase.table("email_log").select("id", count="exact").eq("status", "failed").execute()

        sent_count = sent_q.count or 0
        failed_count = failed_q.count or 0
    except Exception as e:
        logger.error(f"delivery query failed: {e}")
        sent_count = 0
        failed_count = 0

    # --- 3. RESPONSES ---
    try:
        responses_q = supabase.table("signed_copy_responses").select("id", count="exact").execute()
        total_responses = responses_q.count or 0
    except Exception as e:
        logger.error(f"responses query failed: {e}")
        total_responses = 0

    response_rate = (
        total_responses / total_sent if total_sent > 0 else 0
    )

    # --- 4. BREAKDOWN ---
    breakdown_map = {
        "keep_order": 0,
        "unsigned_copy": 0,
        "cancel_order": 0,
        "no_response": 0
    }

    try:
        resp_rows = supabase.table("signed_copy_responses").select("response").execute()
        if resp_rows.data:
            for row in resp_rows.data:
                r_type = row.get("response") or ""
                if r_type in breakdown_map:
                    breakdown_map[r_type] += 1
    except Exception as e:
        logger.error(f"breakdown query failed: {e}")

    # --- 5. NO RESPONSE ---
    try:
        # fallback: no_response = sent - responses
        no_response_count = max(total_sent - total_responses, 0)
    except Exception as e:
        logger.error(f"no response calc failed: {e}")
        no_response_count = 0

    breakdown_map["no_response"] = no_response_count

    return {
        "totals": {
            "recipients": total_recipients,
            "sent": total_sent,
            "remaining": total_remaining
        },
        "delivery": {
            "sent": sent_count,
            "failed": failed_count
        },
        "responses": {
            "total": total_responses,
            "rate": round(response_rate, 4)
        },
        "breakdown": breakdown_map,
        "meta": {
            "generated_at": int(time.time()),
            "campaign": campaign
        }
    }