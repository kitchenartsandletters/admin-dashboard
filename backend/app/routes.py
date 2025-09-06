import os
import requests
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from fastapi.responses import Response
from app.supabase_client import insert_interest, supabase, update_status, SHOP_URL, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION


router = APIRouter()

OOP_HANDLES = ["out-of-print-offers", "out-of-print-offers-1"]

class InterestRequest(BaseModel):
    email: str
    product_id: int
    product_title: str
    isbn: str | None = None
    customer_name: str | None = None

class StatusUpdateRequest(BaseModel):
    request_id: str
    new_status: str
    changed_by: str | None = None

class ArchiveOne(BaseModel):
    id: str
    reason: str | None = None

class ArchiveBulk(BaseModel):
    ids: list[str]
    reason: str | None = None

class BlacklistEntry(BaseModel):
    barcode: str
    title: str
    handle: str
    author: str
    product_id: int

class RemoveEntry(BaseModel):
    barcode: str

def validate_admin_token(request: Request, token: str = "") -> str:
    """Validate admin token from Authorization header or `token` query param.

    Accepts either:
    - Authorization: Bearer <VITE_DBS_ADMIN_TOKEN>
    - `token` query param equal to VITE_DBS_ADMIN_TOKEN (or fallback VITE_ADMIN_TOKEN)
    """
    header = request.headers.get("Authorization", "")
    provided = token
    if header.lower().startswith("bearer "):
        provided = header.split(" ", 1)[1].strip()

    expected = os.getenv("VITE_DBS_ADMIN_TOKEN") or os.getenv("VITE_ADMIN_TOKEN")
    if not expected or provided != expected:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return provided

@router.api_route("/interest", methods=["POST", "OPTIONS"])
async def create_interest(req: Request):
    try:
        body = await req.json()
        request = InterestRequest(**body)
        result = insert_interest(
            email=request.email,
            product_id=request.product_id,
            product_title=request.product_title,
            isbn=request.isbn,
            customer_name=request.customer_name
        )
        return {"success": True, "data": result}
    except Exception as e:
        print("Error inserting interest:", e)
        raise HTTPException(status_code=500, detail="Failed to record interest.")

@router.get("/interest")
async def get_interest_entries(
    token: str = "",
    collection_filter: str | None = None,
    archived: str | None = None,
    page: int = 1,
    limit: int = 100,
):
    if token != os.getenv("VITE_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid token")

    # Clamp and compute pagination
    try:
        page = int(page) if page is not None else 1
    except Exception:
        page = 1
    try:
        limit = int(limit) if limit is not None else 100
    except Exception:
        limit = 100
    if page < 1:
        page = 1
    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200
    offset = (page - 1) * limit
    range_to = offset + limit - 1

    try:
        # Build base query (apply filters first; order & range last)
        q = supabase.table("product_interest_requests").select(
            "id, product_id, product_title, email, customer_name, isbn, cr_id, status, cr_seq, archived, archived_at, created_at, shopify_collection_handles, product_tags, shopify_collections"
        )

        # Archived mode: exclude (default), include, only
        archived_mode = (archived or "exclude").strip().lower()
        if archived_mode not in {"exclude", "include", "only"}:
            archived_mode = "exclude"
        if archived_mode == "exclude":
            q = q.eq("archived", False)
        elif archived_mode == "only":
            q = q.eq("archived", True)

        # Normalize: accept "All", "OP"/"Out-of-Print" variants, and "Not OP"
        raw_cf = (collection_filter or "All").strip().lower()
        norm = raw_cf.replace(" ", "-")  # normalize spaces -> hyphen
        if norm in {"op", "out-of-print", "out_of_print"}:
            cf = "op"
        elif norm in {"notop", "not-op", "not_out_of_print"}:
            cf = "notop"
        else:
            cf = "all"

        if cf == "op":
            # Out-of-Print definition
            q = q.or_(
                "shopify_collection_handles.ov.{out-of-print-offers,out-of-print-offers-1},shopify_collections.ov.{Out-of-Print Offers,Past Out-of-Print Offers},product_tags.ov.{op,pastop},product_title.ilike.OP:%"
            )
        elif cf == "notop":
            # Not-OP definition (title not OP and tags don't contain OP markers, accounting for null/empty)
            q = q.or_(
                "and(product_title.not.ilike.OP:%,product_tags.not.ov.{op,pastop}),and(product_title.not.ilike.OP:%,or(product_tags.is.null,product_tags.eq.{}))"
            )
        # else: "all" -> no additional filter

        # Finally, apply ordering and range (after all filters)
        q = q.order("created_at", desc=True).range(offset, range_to)

        result = q.execute()
        return {"success": True, "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update_status")
async def update_request_status(payload: StatusUpdateRequest, token: str = ""):
    if token != os.getenv("VITE_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid token")

    try:
        # Debug: incoming payload
        print("📥 Incoming status update payload:", payload.model_dump())

        # Default to "system" if no changed_by is provided
        actor = payload.changed_by if payload.changed_by else "system"

        # Call the RPC
        result = update_status(
            payload.request_id,
            payload.new_status,
            changed_by=actor,
            source="api",
            optimistic=False
        )

        # Debug: RPC call result
        print("✅ RPC result:", result)

        return {"success": True, "data": result}
    except Exception as e:
        print("❌ Error in update_request_status:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/archive")
async def archive_one(payload: ArchiveOne | None = None, id: str | None = None, token: str = ""):
    if token != os.getenv("VITE_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid token")
    try:
        # Prefer explicit query param id, otherwise fall back to JSON payload
        resolved_id = id or (payload.id if payload else None)
        reason = payload.reason if payload else None
        if not resolved_id:
            raise HTTPException(status_code=422, detail="Missing 'id' (provide as query param or JSON body)")

        resp = supabase.rpc("archive_mark", {"ids": [resolved_id], "reason": reason}).execute()
        # Derive a useful count if possible
        moved = None
        data = getattr(resp, "data", None)
        if isinstance(data, list):
            if data and isinstance(data[0], dict):
                moved = data[0].get("moved") or data[0].get("count") or len(data)
            else:
                moved = len(data)
        elif isinstance(data, dict):
            moved = data.get("moved") or data.get("count")
        elif isinstance(data, (int, float)):
            moved = int(data)
        return {"success": True, "moved": moved if moved is not None else 1, "rpc": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/archive/bulk")
async def archive_bulk(payload: ArchiveBulk, token: str = ""):
    if token != os.getenv("VITE_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid token")
    try:
        resp = supabase.rpc("archive_mark", {"ids": payload.ids, "reason": payload.reason}).execute()
        data = getattr(resp, "data", None)
        count = None
        if isinstance(data, list):
            if data and isinstance(data[0], dict):
                count = data[0].get("moved") or data[0].get("count") or len(data)
            else:
                count = len(data)
        elif isinstance(data, dict):
            count = data.get("moved") or data.get("count")
        elif isinstance(data, (int, float)):
            count = int(data)
        return {"success": True, "count": count if count is not None else len(payload.ids), "rpc": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/blacklist")
async def get_blacklist(token: str = ""):
    if token != os.getenv("VITE_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid token")
    res = supabase.table("blacklisted_barcodes").select("*").execute()
    return res.data

@router.post("/blacklist/add")
async def add_to_blacklist(entry: BlacklistEntry, token: str = ""):
    if token != os.getenv("VITE_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid token")
    supabase.table("blacklisted_barcodes").upsert(entry.model_dump()).execute()
    return {"success": True}

@router.post("/blacklist/remove")
async def remove_from_blacklist(entry: RemoveEntry, token: str = ""):
    if token != os.getenv("VITE_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid token")
    supabase.table("blacklisted_barcodes").delete().eq("barcode", entry.barcode).execute()
    return {"success": True}

@router.post("/blacklist/export_snippet")
async def export_blacklist_snippet(token: str = ""):
    if token != os.getenv("VITE_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid token")
    try:
        sb = supabase
        response = sb.table("blacklisted_barcodes").select("barcode").execute()
        barcodes = [row["barcode"] for row in response.data if row.get("barcode")]

        csv_string = ",".join(barcodes)
        snippet = f'{{% assign blacklisted_barcodes = "{csv_string}" | split: "," %}}'

        os.makedirs("snippets", exist_ok=True)
        with open("snippets/blacklisted-barcodes.liquid", "w") as f:
            f.write(snippet)

        sb.table("blacklist_snippet_logs").insert({
            "barcodes": barcodes,
            "exported_at": datetime.utcnow().isoformat()
        }).execute()

        return { "success": True }

    except Exception as e:
        print("Export failed:", e)
        return { "success": False, "error": str(e) }

@router.post("/shopify/graphql")
async def proxy_to_shopify(request: Request):
    try:
        shopify_token = os.getenv("SHOPIFY_ACCESS_TOKEN")
        if not shopify_token:
            raise HTTPException(status_code=500, detail="Shopify token missing")

        payload = await request.json()

        headers = {
            "X-Shopify-Access-Token": shopify_token,
            "Content-Type": "application/json"
        }   

        response = requests.post(
            f"https://{os.getenv('SHOP_URL')}/admin/api/2023-10/graphql.json",
            json=payload,
            headers=headers
        )

        # 🔍 Log Shopify response for debugging
        print("📡 Shopify GraphQL status:", response.status_code)
        print("📄 Shopify response body:", response.text)

        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type="application/json"
        )

    except Exception as e:
        print("❌ Shopify proxy error:", e)
        raise HTTPException(status_code=500, detail=str(e))