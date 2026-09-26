import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Supabase client for this backend's own routes (reports, calendar, exclusions,
# campaign stats). Request-module helpers moved to request-service in decoupling
# step 3. This backend no longer talks to Shopify.

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
