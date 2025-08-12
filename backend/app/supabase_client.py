import os
from supabase import create_client, Client
from dotenv import load_dotenv
import uuid

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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

    response = supabase.table("product_interest_requests").insert({
        "email": email,
        "product_id": product_id,
        "product_title": product_title,
        "isbn": isbn,
        "cr_id": cr_id,
        "customer_name": customer_name
    }).execute()

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