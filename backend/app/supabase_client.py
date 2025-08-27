import os
from supabase import create_client, Client
from dotenv import load_dotenv
import uuid
import requests

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Shopify env
SHOP_URL = os.getenv("SHOP_URL")  # e.g. castironbooks.myshopify.com
SHOPIFY_ACCESS_TOKEN = os.getenv("SHOPIFY_ACCESS_TOKEN")
SHOPIFY_API_VERSION = os.getenv("SHOPIFY_API_VERSION", "2024-10")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def _normalize_tags(tag_str: str | None):
    if not tag_str:
        return None
    tags = [t.strip() for t in tag_str.split(",")]
    tags = [t for t in tags if t]
    return tags or None

def _enrich_from_shopify(product_id: int):
    """
    Best-effort fetch of tags + collections (titles + handles).
    Returns a dict suitable to merge into the insert payload.
    """
    if not SHOP_URL or not SHOPIFY_ACCESS_TOKEN:
        # Missing creds; skip enrichment
        return {}

    session = requests.Session()
    session.headers.update({"X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN})
    base = f"https://{SHOP_URL}/admin/api/{SHOPIFY_API_VERSION}"

    try:
        # Product (for tags)
        pr = session.get(f"{base}/products/{product_id}.json", timeout=12)
        pr.raise_for_status()
        product = pr.json().get("product", {})
        tags = _normalize_tags(product.get("tags"))

        # Collects (product -> collection ids)
        cr = session.get(f"{base}/collects.json",
                         params={"product_id": product_id, "limit": 250},
                         timeout=12)
        cr.raise_for_status()
        coll_ids = [c["collection_id"] for c in cr.json().get("collects", [])]

        titles: list[str] = []
        handles: list[str] = []
        for cid in coll_ids:
            # /collections/{id}.json returns { collection: { title, handle, ... } }
            r = session.get(f"{base}/collections/{cid}.json", timeout=10)
            if r.status_code == 200:
                coll = r.json().get("collection", {}) or {}
                title = coll.get("title")
                handle = coll.get("handle")
                if title:
                    titles.append(title)
                if handle:
                    handles.append(handle)

        out = {}
        if tags is not None:
            out["product_tags"] = tags
        if titles:
            out["shopify_collections"] = titles
        if handles:
            out["shopify_collection_handles"] = handles
        return out

    except Exception as e:
        print("Enrichment failed (non-fatal):", e)
        return {}

def insert_interest(email: str, product_id: int, product_title: str, isbn: str = None, customer_name: str = None):
    """
    Insert a new interest request into product_interest_requests.
    Automatically generates a CR ID and preserves ISBN if provided.
    """
    cr_id = f"CR{uuid.uuid4().hex[:8].upper()}"

    # Normalize blank or whitespace-only names to None
    if not customer_name or not customer_name.strip():
        customer_name = None
    else:
        customer_name = customer_name.strip()

    payload = {
        "email": email,
        "product_id": product_id,
        "product_title": product_title,
        "isbn": isbn,
        "cr_id": cr_id,
        "customer_name": customer_name
    }

    # Best-effort enrichment (tags + collections)
    enrich = _enrich_from_shopify(product_id)
    if enrich:
        payload.update(enrich)

    response = supabase.table("product_interest_requests").insert(payload).execute()

    if not response.data:
        raise Exception("Insert failed or returned no data.")
    
    return response.data

def fetch_all_interest():
    response = supabase.table("product_interest_requests") \
        .select("id, product_id, product_title, email, customer_name, isbn, cr_id, status, cr_seq, created_at") \
        .execute()
    if not response.data:
        return []
    return response.data

def update_status(request_id: str, new_status: str, changed_by: str = "system", source: str = "api", optimistic: bool = False):
    """
    Atomically update the status in product_interest_requests and log the change
    in status_change_log via the update_status_with_log RPC function.
    """
    print("📤 Calling RPC update_status_with_log with params:", {
        "req_id": request_id,
        "new_stat": new_status,
        "actor": changed_by,
        "src": source,
        "is_optimistic": optimistic
    })

    resp = supabase.rpc(
        "update_status_with_log",
        {
            "req_id": request_id,
            "new_stat": new_status,
            "actor": changed_by,
            "src": source,
            "is_optimistic": optimistic
        }
    ).execute()

    # Debug log raw response from Supabase
    print("📥 Raw Supabase RPC response:", resp)

    if getattr(resp, "error", None):
        print("❌ Supabase RPC error:", resp.error)
        raise Exception(f"Status update failed: {resp.error}")
    
    return {"success": True}