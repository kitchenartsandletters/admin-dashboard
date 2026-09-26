from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.reports import router as reports_router
from app.routes.campaign_stats import router as campaign_stats_router
from app.routes.campaign_responses import router as campaign_responses_router

# Request-module routes (interest, status, archive, notes, blacklist, Shopify proxy)
# moved to request-service (api.kitchenartsandletters.com) — decoupling steps 1-3.
# See request-service/docs/DOCS_STATUS.md.

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://admin.kitchenartsandletters.com",
                   "https://www.kitchenartsandletters.com",
                   "http://localhost:5173"
                   ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    """Unauthenticated liveness check for the dashboard's System Status page. Returns no data."""
    return {"status": "ok", "service": "admin-dashboard-backend"}


app.include_router(reports_router, prefix="/api")
app.include_router(campaign_stats_router, prefix="/api")
app.include_router(campaign_responses_router, prefix="/api")
