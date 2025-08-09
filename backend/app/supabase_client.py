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

def update_status(request_id: str, new_status: str):
    response = supabase.table("product_interest_requests") \
        .update({"status": new_status}) \
        .eq("id", request_id) \
        .execute()
    if not response.data:
        raise Exception("Status update failed or returned no data.")
    return response.data