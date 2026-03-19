from fastapi import APIRouter, Request, HTTPException
from app.supabase_client import supabase
from typing import Dict, Any, List
import os
import time
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter()

# --- RESPONSE LABEL MAP (UI-FRIENDLY) ---
RESPONSE_LABELS = {
    "keep_order": "Confirm Order",
    "unsigned_copy": "Send Unsigned",
    "cancel_order": "Cancel Order",
}


def validate_admin_token(request: Request, token: str = ""):
    """Accept token via query param OR Authorization header"""
    header = request.headers.get("Authorization", "")
    provided = token

    if header.lower().startswith("bearer "):
        provided = header.split(" ", 1)[1].strip()

    expected = os.getenv("VITE_ADMIN_TOKEN")
    if not expected or provided != expected:
        raise HTTPException(status_code=403, detail="Unauthorized")


@router.get("/campaign-responses")
async def get_campaign_responses(
    request: Request,
    campaign: str = "noma-signed-copy-decision",
    token: str = "",
    limit: int = 200,
    offset: int = 0,
) -> Dict[str, Any]:

    validate_admin_token(request, token)

    try:
        query = (
            supabase.table("signed_copy_responses")
            .select(
                """
                id,
                email,
                response,
                product_title,
                order_id,
                order_name,
                customer_first_name,
                customer_last_name,
                recorded_at,
                status
                """,
                count="exact"
            )
            .order("recorded_at", desc=True)
            .range(offset, offset + limit - 1)
        )

        # Optional: filter by campaign if present
        if campaign:
            query = query.eq("campaign_key", campaign)

        result = query.execute()

        print("RESULT DATA:", result.data)
        print("RESULT COUNT:", result.count)

        rows: List[Dict[str, Any]] = []

        for r in result.data or []:
            rows.append({
                "id": r.get("id"),
                "email": r.get("email"),
                "response": r.get("response"),
                "response_label": RESPONSE_LABELS.get(
                    r.get("response"), r.get("response")
                ),
                "product_title": r.get("product_title"),
                "order_id": r.get("order_id"),
                "order_name": r.get("order_name"),
                "customer_name": f"{r.get('customer_first_name') or ''} {r.get('customer_last_name') or ''}".strip(),
                "recorded_at": r.get("recorded_at"),
                "status": r.get("status"),
            })

        return {
            "rows": rows,
            "meta": {
                "count": result.count or 0,
                "limit": limit,
                "offset": offset,
                "generated_at": int(time.time()),
                "campaign": campaign,
            },
        }

    except Exception as e:
        logger.error(f"campaign responses query failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch campaign responses")