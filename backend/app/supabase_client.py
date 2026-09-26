import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Supabase client for this backend's own routes (reports, calendar, exclusions).
# Request-module helpers moved to request-service in decoupling step 3; the
# signed-copy campaign routes were retired 2026-09-26. No Shopify calls here.

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
