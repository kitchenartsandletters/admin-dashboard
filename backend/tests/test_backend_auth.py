"""
Auth + scope guard for the admin-dashboard backend (decoupling step 3).

- Request-module routes must stay deleted (they live in request-service).
- GET /api/health is the only public route and returns no data.
- EVERY other mounted route rejects missing/wrong/damaged-books tokens with 403.
- Adding a report exclusion makes no network call (no Shopify from this backend).

Supabase is faked in memory. Run from backend/:  pip install pytest && python -m pytest tests/
"""
import os, sys, types
os.environ.update({"SUPABASE_URL":"x","SUPABASE_KEY":"x","VITE_ADMIN_TOKEN":"admintok","VITE_DBS_ADMIN_TOKEN":"dbstok"})
os.environ.pop("SHOPIFY_ACCESS_TOKEN", None)
INSERTS=[]
class Q:
    def __getattr__(s,n):
        def f(*a,**k):
            if n=="insert": INSERTS.append(a[0])
            return s
        return f
    def execute(s): return types.SimpleNamespace(data=[{"id":"x1"}], count=0)
class C:
    def table(s,*a): return Q()
    def schema(s,*a): return s
    def rpc(s,*a,**k): return Q()
sup=types.ModuleType("supabase"); sup.Client=C; sup.create_client=lambda *a: C(); sys.modules["supabase"]=sup
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from fastapi.routing import APIRoute
from app.main import app
c=TestClient(app)
ROUTES={(m,r.path) for r in app.routes if isinstance(r,APIRoute) for m in r.methods}

def test_request_routes_are_gone():
    for p in ["/api/interest","/api/update_status","/api/archive","/api/archive/bulk","/api/notes","/api/notes/add",
              "/api/blacklist","/api/blacklist/add","/api/blacklist/remove","/api/blacklist/export_snippet","/api/shopify/graphql"]:
        assert not any(path==p for _,path in ROUTES), p
        assert c.post(p+"?token=admintok", json={}).status_code in (404,405)

def test_health_is_public_and_returns_no_data():
    r=c.get("/api/health"); assert r.status_code==200 and r.json()=={"status":"ok","service":"admin-dashboard-backend"}

def test_every_other_route_requires_this_backends_token_only():
    n=0
    for m,p in ROUTES:
        if p=="/api/health" or m in ("OPTIONS","HEAD"): continue
        path=p.replace("{","").replace("}","")
        # ?token= with the CORRECT token must also fail: query-param auth was removed with the campaign.
        for kw in [{}, {"headers":{"Authorization":"Bearer dbstok"}}, {"params":{"token":"admintok"}}, {"headers":{"Authorization":"Bearer nope"}}]:
            r=c.request(m, path, json={}, **kw); assert r.status_code==403, (m,p,kw,r.status_code)
        n+=1
    assert n>=12, n

def test_valid_bearer_token_passes_auth():
    assert c.get("/api/reports/exclusions", headers={"Authorization":"Bearer admintok"}).status_code!=403

def test_signed_copy_campaign_routes_are_retired():
    # Archived in kitchenartsandletters/signed-copy-campaign; data vaulted offline 2026-09-26.
    assert not any("campaign" in p for _, p in ROUTES)
    for p in ["/api/campaign-stats", "/api/campaign-responses"]:
        assert c.get(p, headers={"Authorization":"Bearer admintok"}).status_code == 404

def test_exclusion_title_is_taken_from_caller_no_shopify():
    INSERTS.clear()
    import requests  # any network call would be a bug now
    orig=requests.post; requests.post=lambda *a,**k: (_ for _ in ()).throw(AssertionError("network call"))
    try:
        H={"Authorization":"Bearer admintok"}
        assert c.post("/api/reports/exclusions", headers=H, json={"product_id":"123","product_title":"  Gift Card ","reason":"x"}).status_code==200
        assert c.post("/api/reports/exclusions", headers=H, json={"product_id":"gid://shopify/Product/456","product_title":"   "}).status_code==200
    finally: requests.post=orig
    assert INSERTS[0]["product_title"]=="Gift Card" and INSERTS[0]["product_id"]=="gid://shopify/Product/123"
    assert INSERTS[1]["product_title"] is None and INSERTS[1]["product_id"]=="gid://shopify/Product/456"
