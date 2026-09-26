# Status of documents (admin-dashboard)

**Check this file before trusting anything else in `docs/` or the root
`README.md`.** Same conventions as `preorder-service/docs/DOCS_STATUS.md`:
a row marked **Not yet re-verified** is not an endorsement; prefer the code,
the live Supabase schema, and Railway settings.

For anything about the **request module** (requests, notes, blacklist, the
storefront request form), the authoritative doc is
**`request-service/docs/DOCS_STATUS.md`**, which holds the verified dependency
map across both repos.

Last updated: 2026-09-26

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

## What this repo deploys (verified 2026-09-26)

| Piece | Railway domain | Notes |
|---|---|---|
| Frontend | `admin.kitchenartsandletters.com` | Calls each module's backend directly from the browser. |
| Backend (`backend/`) | `outofstock-notify-frontend-production.up.railway.app` | **Misleading legacy name — this is the backend.** Frontend reaches it as `VITE_API_BASE_URL`. Uses the `request-service` Supabase project. |

The backend serves reports, calendar/schedule overrides, exclusions, campaign
stats, **and half of the request module** (list, status, archive, notes).
The other half runs in `request-service`. See the map there.

---

## Live code landmines (backend)

### Landmine 1: dead duplicate request routes, including an unauthenticated Shopify proxy

`backend/app/routes/interest.py` is mounted and contains `POST /interest`,
`/blacklist*`, and `POST /shopify/graphql`. **No frontend code calls them**
(the dashboard sends these to `api.kitchenartsandletters.com`). They are stale
copies of request-service code. The proxy is **publicly reachable with no
auth** and forwards any GraphQL body; it is inert only because it reads the
retired `SHOPIFY_ACCESS_TOKEN`. `backend/app/routes.py` is a second, unmounted
copy.
**Needs:** delete the unused routes and `routes.py` (decoupling phase, or
sooner as a standalone PR).

### Landmine 2: `validate_admin_token` prefers the damaged-books token

In `routes/reports.py` (and the helpers in `interest.py` / `routes.py`),
`expected = VITE_DBS_ADMIN_TOKEN or VITE_ADMIN_TOKEN`. Reports and campaign
routes use it. The frontend sends `VITE_ADMIN_TOKEN`. This works only if the
DBS token is unset on this service or equal to the admin token.
`VITE_DBS_ADMIN_TOKEN` belongs to damaged-books-service and should not appear
here. **Needs:** one token owned by this backend.

### Landmine 3: retired Shopify token in `reports.py`

The exclusions route reads `SHOPIFY_ACCESS_TOKEN` to look up a product title.
It fails gracefully (title stays empty), and also reads
`SHOPIFY_API_VERSION` with its own default. **Needs:** client credentials, or
drop the lookup and take the title from the caller.

### Landmine 4: frontend cross-wiring (partly fixed in Phase 0)

- `RequestService.tsx` / `RequestTable.tsx` sent `VITE_DBS_ADMIN_TOKEN` to
  request-service. **Fixed in Phase 0:** they send `VITE_ADMIN_TOKEN`.
- Request code uses three base-URL vars (`VITE_API_BASE_URL`,
  `VITE_BLACKLIST_URL`, `VITE_REQUEST_URL`) for two hosts. **Needs:** one
  `VITE_REQUEST_BASE_URL` after decoupling.

---

## How to use / extend this file

Find a doc's row before trusting it. Record errata here rather than editing
large docs inline. When a landmine is fixed, mark it resolved with the PR
instead of deleting it.
