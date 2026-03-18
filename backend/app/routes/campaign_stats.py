from fastapi import APIRouter, Request, HTTPException
from app.supabase_client import supabase
from typing import Dict, Any
import time
import os

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
    totals_query = supabase.rpc("campaign_totals").execute()

    totals_data = totals_query.data[0] if totals_query.data else {
        "total": 0,
        "sent": 0,
        "remaining": 0
    }

    total_recipients = totals_data["total"]
    total_sent = totals_data["sent"]
    total_remaining = totals_data["remaining"]

    # --- 2. DELIVERY ---
    delivery_query = supabase.rpc("campaign_delivery_stats").execute()

    delivery_data = delivery_query.data[0] if delivery_query.data else {
        "sent": 0,
        "failed": 0
    }

    sent_count = delivery_data["sent"]
    failed_count = delivery_data["failed"]

    # --- 3. RESPONSES ---
    responses_query = supabase.rpc("campaign_response_totals").execute()

    total_responses = responses_query.data[0]["total"] if responses_query.data else 0

    response_rate = (
        total_responses / total_sent if total_sent > 0 else 0
    )

    # --- 4. BREAKDOWN ---
    breakdown_query = supabase.rpc("campaign_response_breakdown").execute()

    breakdown_map = {
        "yes": 0,
        "no": 0,
        "maybe": 0,
        "no_response": 0
    }

    if breakdown_query.data:
        for row in breakdown_query.data:
            r_type = row["response_type"]
            breakdown_map[r_type] = row["count"]

    # --- 5. NO RESPONSE ---
    no_response_query = supabase.rpc("campaign_no_response_count").execute()

    no_response_count = (
        no_response_query.data[0]["count"]
        if no_response_query.data else 0
    )

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