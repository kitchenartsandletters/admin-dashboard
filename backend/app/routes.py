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
        # Base query
        q = supabase.table("product_interest_requests") \
            .select("id, product_id, product_title, email, customer_name, isbn, cr_id, status, cr_seq, created_at, shopify_collection_handles, product_tags, shopify_collections") \
            .order("created_at", desc=True) \
            .range(offset, range_to)

        # Normalize: accept "All", "OOP"/"Out-of-Print" variants, and "Frontlist"
        raw_cf = (collection_filter or "All").strip().lower()
        cf = raw_cf.replace(" ", "-")  # spaces -> hyphen
        # Map common variants
        if cf in {"oop", "out-of-print", "out_of_print"}:
            cf = "oop"
        elif cf in {"frontlist"}:
            cf = "frontlist"
        else:
            cf = "all"

        if cf == "oop":
            # Out-of-Print if ANY of these is true:
            # 1) handles overlap OOP handles
            # 2) collection titles overlap OOP titles
            # 3) product_tags contain 'op' or 'pastop'
            # 4) product_title starts with "OP: "
            q = q.or_(
                "shopify_collection_handles.ov.{out-of-print-offers,out-of-print-offers-1},shopify_collections.ov.{Out-of-Print Offers,Past Out-of-Print Offers},product_tags.ov.{op,pastop},product_title.ilike.OP:%"
            )
        elif cf == "frontlist":
            # Frontlist if ALL of these are true:
            # (a) NOT in OOP handles AND NOT in OOP titled collections AND NOT tagged op/pastop AND NOT title starting with OP:
            #  OR
            # (b) arrays are null/empty and title does NOT start with OP:
            q = q.or_(
                "and(shopify_collection_handles.not.ov.{out-of-print-offers,out-of-print-offers-1},shopify_collections.not.ov.{Out-of-Print Offers,Past Out-of-Print Offers},product_tags.not.ov.{op,pastop},product_title.not.ilike.OP:%),and(or(shopify_collection_handles.is.null,shopify_collection_handles.eq.{}),or(shopify_collections.is.null,shopify_collections.eq.{}),or(product_tags.is.null,product_tags.eq.{}),product_title.not.ilike.OP:%)"
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