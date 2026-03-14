from fastapi import APIRouter
from app.supabase_client import supabase

router = APIRouter()

@router.get("/preorders")
def get_preorders():
    resp = supabase.table("vw_preorder_products").select("*").execute()
    return resp.data
