# Status of documents (admin-dashboard)

**Check this file before trusting anything else in `docs/` or the root
`README.md`.** Same conventions as `preorder-service/docs/DOCS_STATUS.md`:
a row marked **Not yet re-verified** is not an endorsement; prefer the code,
the live Supabase schema, and Railway settings.

For anything about the **request module** (requests, notes, blacklist, the
storefront request form), the authoritative doc is
**`request-service/docs/DOCS_STATUS.md`**, which holds the verified dependency
map across both repos.

Last updated: 2026-09-28 (backend renamed + custom domain; frontend env pairs; server.js)

| Document | Status |
|---|---|
| `docs/DOCS_STATUS.md` (this file) | **Authoritative** for document status only. |
| `CLAUDE.md` | **Current** for branch/deploy conventions (`main` is live and auto-deploys). |
| `docs/branches-and-deploys.md` | **Current.** Same content as `CLAUDE.md`. |
| `docs/Infrastructure.md` | **UNTRUSTED — no longer relevant. Do not use.** Known errors: it says the backend uses Supabase `evzradwmnzcuwzckgtmv` (it uses the `request-service` project, `xcendrvhgwifobauuiar`, which holds `request_notes` and the `reports` schema); it lists the retired `SHOPIFY_ACCESS_TOKEN` as required; it has no account of the request module being split across two backends. Kept only for history. |
| `docs/SHOPIFY_API_VERSIONING.md` | **Partly stale.** Its version-bump procedure is reasonable, but it assumes the static-token auth model and does not know the proxy it flags is dead code. The org-wide version sweep lives in `preorder-service/docs/DOCS_STATUS.md` (Landmine 16). |
| `docs/reports_walkthrough.md` | **Not yet re-verified.** |
| `docs/policies/*`, `docs/services/*`, `docs/webhooks/*` | **Not yet re-verified.** |
| root `README.md` (47 KB) | **Not yet re-verified — do not trust its env, deployment, or request-service sections.** It mixes request-service history into this repo and mentions the retired `development` branch. |

---

## What this repo deploys (verified 2026-09-28)

| Piece | Domain | Notes |
|---|---|---|
| Frontend (`frontend/`) | `admin.kitchenartsandletters.com` | Railway start command **`node server.js`**: serves `dist/` with a client-side-routing fallback (no proxy since #91). Calls each module's backend directly from the browser. |
| Backend (`backend/`) | **`dashboard-api.kitchenartsandletters.com`** (the legacy `outofstock-notify-frontend-production.up.railway.app` is still attached but unused by the dashboard) | Railway service **`admin-dashboard-backend`** (renamed 2026-09-28 from `outofstock-notify-frontend`). Uses the `request-service` Supabase project. |

### Frontend → backend configuration

Each backend is reached through one base-URL + token pair (Vite bakes these in
at build time, so set them **before** merging a change that reads them):

| Frontend vars | Backend | Read in |
|---|---|---|
| `VITE_DASHBOARD_BASE_URL` + `VITE_DASHBOARD_ADMIN_TOKEN` | this repo's backend | `src/services/dashboard/dashboardApi.ts` |
| `VITE_REQUEST_BASE_URL` + `VITE_REQUEST_ADMIN_TOKEN` | request-service (`api.kitchenartsandletters.com`) | `src/services/requests/requestApi.ts` |
| `VITE_SC_BASE_URL` + `VITE_SC_ADMIN_TOKEN` | supply-chain-service | `src/api/*` (not re-verified here) |
| `VITE_BACKORDER_*`, `VITE_PREORDER_*`, `VITE_DBS_*` | their own services | not re-verified here |

**Retired (do not reintroduce):** `VITE_API_BASE_URL`, `VITE_ADMIN_BACKEND`,
the frontend's `VITE_ADMIN_TOKEN` (#91), `VITE_BLACKLIST_URL`,
`VITE_REQUEST_URL` (decoupling step 2). None remain in the frontend's Railway
variables (last removed 2026-09-28).

The backend serves **only** reports, calendar/schedule overrides, exclusions,
and an unauthenticated `GET /api/health`. Admin auth is `Authorization: Bearer`;
the backend reads `VITE_ADMIN_TOKEN` (the frontend sends the same value as
`VITE_DASHBOARD_ADMIN_TOKEN`). No `?token=`. It no longer talks to
Shopify. The whole request module (list, status, archive, notes, blacklist,
storefront ingest) runs in `request-service` since decoupling steps 1–3.

---

## Live code landmines (backend)

### Landmine 1: dead duplicate request routes, including an unauthenticated Shopify proxy — RESOLVED by decoupling step 3 (routes, `routes.py`, proxy and retired-token code deleted)

`backend/app/routes/interest.py` is mounted and contains `POST /interest`,
`/blacklist*`, and `POST /shopify/graphql`. **No frontend code calls them**
(the dashboard sends these to `api.kitchenartsandletters.com`). They are stale
copies of request-service code. The proxy is **publicly reachable with no
auth** and forwards any GraphQL body; it is inert only because it reads the
retired `SHOPIFY_ACCESS_TOKEN`. `backend/app/routes.py` is a second, unmounted
copy.
**Needs:** delete the unused routes and `routes.py` (decoupling phase, or
sooner as a standalone PR).

### Landmine 2: `validate_admin_token` prefers the damaged-books token — RESOLVED by decoupling step 3 (one `app/auth.py`, `VITE_ADMIN_TOKEN` only, applied as a router dependency so auth runs before body validation)

In `routes/reports.py` (and the helpers in `interest.py` / `routes.py`),
`expected = VITE_DBS_ADMIN_TOKEN or VITE_ADMIN_TOKEN`. Reports and campaign
routes use it. The frontend sends `VITE_ADMIN_TOKEN`. This works only if the
DBS token is unset on this service or equal to the admin token.
`VITE_DBS_ADMIN_TOKEN` belongs to damaged-books-service and should not appear
here. **Needs:** one token owned by this backend.

### Landmine 3: retired Shopify token in `reports.py` — RESOLVED by decoupling step 3 (lookup removed; staff type the optional title)

The exclusions route reads `SHOPIFY_ACCESS_TOKEN` to look up a product title.
It fails gracefully (title stays empty), and also reads
`SHOPIFY_API_VERSION` with its own default. **Needs:** client credentials, or
drop the lookup and take the title from the caller.

### Landmine 4: frontend cross-wiring — RESOLVED by decoupling step 2

- `RequestService.tsx` / `RequestTable.tsx` sent `VITE_DBS_ADMIN_TOKEN` to
  request-service. Fixed in Phase 0 (PR #86).
- Request code used three base-URL vars (`VITE_API_BASE_URL`,
  `VITE_BLACKLIST_URL`, `VITE_REQUEST_URL`) for two hosts and put the token in
  `?token=` query strings. **Step 2:** every request call now goes through
  `src/services/requests/requestApi.ts` — one `VITE_REQUEST_BASE_URL`, one
  `VITE_REQUEST_ADMIN_TOKEN`, sent as `X-Admin-Token`. This backend's own
  routes use the matching pair `VITE_DASHBOARD_BASE_URL` /
  `VITE_DASHBOARD_ADMIN_TOKEN` since #91.
- Step 3: `SystemStatusService.ts` checks `GET /api/health` on both backends
  (no token, no data) instead of `/api/interest?token=`. Since #91 it uses
  `VITE_DASHBOARD_BASE_URL` (the duplicate `VITE_ADMIN_BACKEND` is retired).

### Landmine 5: `.gitignore` ignored every `tests/` directory — FIXED for `backend/tests/` in step 3

A blanket `tests/` rule meant new test files were silently never committed
(the same trap preorder-service hit). Step 3 adds `!backend/tests/`. If you add
tests elsewhere, check `git check-ignore -v <file>` first.

### Landmine 6: `server.js` exited at startup without `VITE_API_BASE_URL` — RESOLVED #91

The frontend service runs `node server.js` (not `npm start`). It refused to
start unless `VITE_API_BASE_URL` was set, only to configure an `/api` proxy
that nothing used (every screen calls its backend by absolute URL). Deleting
that variable would have taken the whole dashboard down. #91 removed the proxy
and the check; static serving and the routing fallback are unchanged
(verified locally with the variable unset). Leftover: `http-proxy-middleware`
is still listed in `frontend/package.json` but unused.

Note: `server.js` also contains a **commented-out HTTP basic-auth gate**. With
it disabled, the dashboard's JavaScript bundle (including every `VITE_*` token)
is served to anyone who loads the site. See request-service `DOCS_STATUS.md`
Remaining: *session-based admin auth*.

### Retired: signed-copy campaign screens (2026-09-26)

The `/campaigns` page (sidebar link, Welcome tile), `services/campaigns/*`,
`types/campaign.ts`, and the backend `campaign_stats.py` /
`campaign_responses.py` routes were removed. They read the campaign tables
directly from request-service's database. Everything is archived verbatim in
the private repo `kitchenartsandletters/signed-copy-campaign`; the data is in
an offline vault. See `request-service/docs/DOCS_STATUS.md` Landmine 4.
With them went this backend's `?token=` support (they were its only users);
`tests/test_backend_auth.py` asserts both.

---

## How to use / extend this file

Find a doc's row before trusting it. Record errata here rather than editing
large docs inline. When a landmine is fixed, mark it resolved with the PR
instead of deleting it.
