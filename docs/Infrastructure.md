# Infrastructure & Service Architecture

> **Status:** Current as of April 2026. Reflects known inconsistencies flagged for future cleanup.

---

## Overview

The admin dashboard is served by a single Railway project that consolidates multiple logical services. These services were built incrementally and connect to **different Supabase projects** and use **different authentication patterns**. This document records what exists, where inconsistencies lie, and what a future cleanup should address.

---

## Railway Services

### 1. `admin-dashboard` (Frontend)
- **Type:** Static Vite/React app
- **Repo:** `admin-dashboard` (`development` branch)
- **URL:** `https://admin.kitchenartsandletters.com`
- **Auth:** Supabase Auth (email/password + magic link)
- **Notes:** Serves the UI. All API calls go to the backend service or directly to external service APIs via env vars.

---

### 2. `admin-dashboard` (Backend — FastAPI)
- **Type:** Python FastAPI service
- **Repo:** `admin-dashboard` (`development` branch)
- **Entry:** `uvicorn app.main:app`
- **URL:** `https://outofstock-notify-frontend-production.up.railway.app`
- **Supabase project:** `evzradwmnzcuwzckgtmv` (KAL primary)
- **Auth token:** `VITE_DBS_ADMIN_TOKEN` or `VITE_ADMIN_TOKEN` (Bearer token in Authorization header)
- **Supabase client:** `app/supabase_client.py` — uses `SUPABASE_URL` + `SUPABASE_KEY` (service role)
- **Router prefix:** All routes mounted at `/api`

**Handles:**
- `/api/interest` — product interest requests
- `/api/reports/*` — report job enqueueing, job status, schedule overrides, calendar overrides
- `/api/blacklist/*` — blacklisted barcodes
- `/api/shopify/graphql` — Shopify GraphQL proxy
- `/api/campaign_stats`, `/api/campaign_responses` — campaign data

**Supabase schemas used:**
- `public` — product interest, blacklist, campaign tables
- `reports` — `report_jobs` (working)
- `public` — `business_calendar_overrides`, `report_schedule_overrides` (moved from `reports` schema due to PostgREST schema cache issue; see Known Issues)

---

### 3. `sr-ops-suite` (Report Job Worker)
- **Type:** Python async worker
- **Repo:** `sr-ops-suite` (`main` branch)
- **Entry:** `python -m services.report_job_worker` (via `cron/report_worker/Dockerfile`)
- **Supabase project:** `evzradwmnzcuwzckgtmv` (KAL primary — same as backend)
- **Auth:** Supabase service role key (`SUPABASE_URL` + `SUPABASE_KEY`)
- **Poll interval:** 5 seconds

**Handles:**
- Polls `reports.report_jobs` for queued jobs
- Executes `daily_sales`, `weekly_maintenance`, `lop_unfulfilled` reports
- Writes results back to `reports.report_jobs.result`
- Checks `public.report_schedule_overrides` for admin window overrides before running
- Checks `public.business_calendar_overrides` for calendar exceptions

**Key files:**
- `services/report_job_worker.py` — polling loop + job dispatcher
- `services/daily_sales_service.py` — daily sales execution + schedule override logic
- `scripts/business_calendar.py` — business day logic with DB override support
- `scripts/shopify_client.py` — shared sync Shopify GraphQL client
- `scripts/daily_sales_report.py` — core report logic (bare imports, requires `scripts/` on sys.path)

**Import note:** `scripts/` uses bare module imports (e.g. `from daily_sales_pdf import ...`). `daily_sales_service.py` manually adds `scripts/` to `sys.path` at import time to resolve this. See `services/daily_sales_service.py` lines 31–36.

---

### 4. Preorder Service (separate Railway service)
- **Type:** Python FastAPI service
- **Repo:** separate repo (not `admin-dashboard` or `sr-ops-suite`)
- **Base URL:** `VITE_PREORDER_BASE_URL` env var in the frontend
- **Auth:** `X-Admin-Token` header using `VITE_PREORDER_ADMIN_TOKEN`
- **Supabase project:** **Different Supabase account/project** from the primary KAL project
- **Supabase client:** Own internal client, separate credentials

**Handles:**
- `/admin/preorders/products`
- `/admin/preorders/release-queue`
- `/admin/preorders/metrics`
- `/admin/preorders/upcoming`
- `/admin/preorders/reportable`
- `/admin/preorders/mark-reported`
- `/admin/preorders/report/preview`
- `/admin/preorders/reclassify/:id`

**Frontend integration:** `preorderApi.ts` calls this service directly from the browser using `VITE_PREORDER_BASE_URL`. This is a **direct browser → service** call, not proxied through the admin-dashboard backend.

---

## Supabase Projects

| Project ref | Used by | Notes |
|---|---|---|
| `evzradwmnzcuwzckgtmv` | admin-dashboard backend, sr-ops-suite worker | KAL primary. Contains `reports`, `public` schemas used by both services. |
| _(separate account)_ | Preorder service | Entirely separate Supabase project with its own schema, auth, and credentials. Not accessible from the primary backend. |

---

## Authentication Patterns

| Service | Pattern | Token source |
|---|---|---|
| Admin dashboard backend | Bearer token in `Authorization` header | `VITE_DBS_ADMIN_TOKEN` or `VITE_ADMIN_TOKEN` env var |
| Preorder service | `X-Admin-Token` header | `VITE_PREORDER_ADMIN_TOKEN` env var |
| Supabase (both services) | Service role key | `SUPABASE_KEY` env var (service role, not anon) |
| Frontend auth | Supabase Auth JWT | Managed by `AuthProvider.tsx` via `@supabase/supabase-js` |

---

## Known Issues & Technical Debt

### 1. Split Supabase projects
The preorder service runs against a completely separate Supabase account. This means:
- No cross-schema queries between preorder data and reports data
- Separate credential management
- Any future integration between preorders and reports requires an API boundary or migration to a single project

**Future fix:** Migrate preorder service Supabase tables to the primary KAL project (`evzradwmnzcuwzckgtmv`) and consolidate credentials.

---

### 2. PostgREST schema cache — `reports` schema
Tables created in the `reports` schema after initial project setup have experienced persistent PostgREST schema cache issues where newly created tables are not recognized despite correct grants and `NOTIFY pgrst, 'reload schema'` commands.

**Workaround applied:** `business_calendar_overrides` and `report_schedule_overrides` were moved from the `reports` schema to `public` via `ALTER TABLE ... SET SCHEMA public`. All references in `reports.py` (backend) and `business_calendar.py` / `daily_sales_service.py` (worker) use `supabase.table(...)` without `.schema("reports")` for these two tables.

`report_jobs` remains in the `reports` schema and continues to work correctly as it was created before the cache issue manifested.

**Future fix:** Investigate why this Supabase project's PostgREST instance doesn't reload cleanly. Consider migrating `report_jobs` to `public` as well for consistency, or filing a support ticket with Supabase.

---

### 3. Inconsistent token naming
Two different env var names are used for the admin bearer token (`VITE_DBS_ADMIN_TOKEN` and `VITE_ADMIN_TOKEN`). The backend falls back between them. The frontend uses `VITE_ADMIN_TOKEN` in some places and `VITE_DBS_ADMIN_TOKEN` in others.

**Future fix:** Standardize on a single env var name across all services and the frontend.

---

### 4. `scripts/` bare imports in sr-ops-suite
Scripts in `sr-ops-suite/scripts/` use bare module imports (e.g. `from daily_sales_pdf import generate_daily_sales_pdf`) that only resolve when `scripts/` is the working directory or on `sys.path`. This works for cron Dockerfiles that `cd` into `scripts/` but breaks when scripts are imported as modules from `services/`.

**Workaround applied:** `daily_sales_service.py` manually inserts `scripts/` into `sys.path` at import time.

**Future fix:** Convert all scripts to use relative imports (`from .daily_sales_pdf import ...`) or restructure as a proper Python package with `__init__.py`.

---

### 5. `ShopifyClient` consolidation (partially complete)
`ShopifyClient` was extracted from `lop_unfulfilled_report.py` into `scripts/shopify_client.py`. Both `lop_unfulfilled_report.py` and `daily_sales_report.py` now import from `shopify_client`. `daily_sales_service.py` also imports from `shopify_client` via the `sys.path` workaround above.

**Status:** Complete for daily sales pipeline. Weekly maintenance and any future scripts should also import from `scripts/shopify_client.py`.

---

## Environment Variables Reference

### admin-dashboard backend (Railway)
| Var | Purpose |
|---|---|
| `SUPABASE_URL` | `https://evzradwmnzcuwzckgtmv.supabase.co` |
| `SUPABASE_KEY` | Service role key for primary KAL Supabase project |
| `VITE_DBS_ADMIN_TOKEN` | Primary bearer token for admin API auth |
| `VITE_ADMIN_TOKEN` | Fallback bearer token (legacy name) |
| `SHOP_URL` | Shopify store URL |
| `SHOPIFY_ACCESS_TOKEN` | Shopify Admin API token |
| `SHOPIFY_API_VERSION` | e.g. `2024-10` |

### sr-ops-suite worker (Railway)
| Var | Purpose |
|---|---|
| `SUPABASE_URL` | `https://evzradwmnzcuwzckgtmv.supabase.co` |
| `SUPABASE_KEY` | Service role key for primary KAL Supabase project |
| `SHOP_URL` | Shopify store URL |
| `SHOPIFY_ACCESS_TOKEN` | Shopify Admin API token |
| `SHOPIFY_API_VERSION` | e.g. `2025-01` |
| `MAILTRAP_API_TOKEN` | Mailtrap email delivery token |
| `EMAIL_SENDER` | From address for report emails |
| `EMAIL_RECIPIENTS` | Comma-separated default recipient list |
| `REPORT_WORKER_POLL_INTERVAL` | Seconds between job polls (default: 5) |

### admin-dashboard frontend (Railway / Vite)
| Var | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend service URL (no trailing `/api`) |
| `VITE_ADMIN_TOKEN` | Bearer token for backend API calls |
| `VITE_SUPABASE_URL` | Supabase URL for frontend auth |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key for frontend auth |
| `VITE_PREORDER_BASE_URL` | Preorder service base URL |
| `VITE_PREORDER_ADMIN_TOKEN` | Auth token for preorder service |