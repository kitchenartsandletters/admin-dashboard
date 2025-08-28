import os
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from fastapi.responses import Response
from app.supabase_client import insert_interest, supabase, update_status


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
        q = supabase.table("product_interest_requests") \
            .select("id, product_id, product_title, email, customer_name, isbn, cr_id, status, cr_seq, archived, archived_at, created_at, shopify_collection_handles, product_tags, shopify_collections") \
            .order("created_at", desc=True) \
            .range(offset, range_to)

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
            # Out-of-Print if ANY of these is true:
            # 1) handles overlap OP handles
            # 2) collection titles overlap OP titles
            # 3) product_tags contain 'op' or 'pastop'
            # 4) product_title starts with "OP: "
            q = q.or_(
                "shopify_collection_handles.ov.{out-of-print-offers,out-of-print-offers-1},shopify_collections.ov.{Out-of-Print Offers,Past Out-of-Print Offers},product_tags.ov.{op,pastop},product_title.ilike.OP:%"
            )
        elif cf == "notop":
            # NOT OP criteria (minimal & robust):
            #   1) Title does NOT start with "OP: "
            #   2) Tags do NOT include 'op' or 'pastop' (including when tags are NULL or empty)
            # We express this as: (product_title NOT ILIKE 'OP:%') AND (product_tags is NULL OR product_tags = {} OR product_tags NOT OV {op,pastop})
            q = q.or_(
                "and(product_title.not.ilike.OP:%,product_tags.not.ov.{op,pastop}),and(product_title.not.ilike.OP:%,or(product_tags.is.null,product_tags.eq.{}))"
            )
        # else: "all" -> no additional filter

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
        print("📥 Incoming status update payload:", payload.dict())

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
async def archive_one(payload: ArchiveOne, token: str = ""):
    if token != os.getenv("VITE_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid token")
    try:
        resp = supabase.rpc("archive_mark", {"ids": [payload.id], "reason": payload.reason}).execute()
        return {"success": True, "moved": 1}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/archive/bulk")
async def archive_bulk(payload: ArchiveBulk, token: str = ""):
    if token != os.getenv("VITE_ADMIN_TOKEN"):
        raise HTTPException(status_code=403, detail="Invalid token")
    try:
        resp = supabase.rpc("archive_mark", {"ids": payload.ids, "reason": payload.reason}).execute()
        return {"success": True, "count": len(payload.ids)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))