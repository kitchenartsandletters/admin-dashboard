import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def insert_interest(email: str, product_id: int, product_title: str):
    response = supabase.table("product_interest_requests").insert({
        "email": email,
        "product_id": product_id,
        "product_title": product_title
    }).execute()

    if not response.data:
        raise Exception("Insert failed or returned no data.")
    
    return response.data

def fetch_all_interest():
    response = supabase.table("product_interest_requests") \
        .select("id, product_id, product_title, email, isbn, cr_id, status, cr_seq, created_at") \
        .execute()
    if not response.data:
        return []
    return response.data

def update_status(request_id: str, new_status: str, changed_by: str = "system", source: str = "api", optimistic: bool = False):
    """
    Atomically update the status in product_interest_requests and log the change
    in status_change_log via the update_status_with_log RPC function.
    """
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

    if getattr(resp, "error", None):
        raise Exception(f"Status update failed: {resp.error}")
    
    return {"success": True}
