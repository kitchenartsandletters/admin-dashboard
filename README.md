# 🛎️ Admin Dashboard (fka Out-of-stock Notify)

This project formerly enabled customers to express interest in out-of-stock products, and gives admins a secure dashboard to view and manage those interest requests. It has since expanded to a full Admin Dashboard UI with what we call the 'Request Service' now serving a modular component of the dashboard.

## 🗂️ Service Modules

The Admin Dashboard is designed to support modular services. Each service is rendered via a dedicated route and contributes distinct functionality to the overall dashboard. Current modules:

- [Request Service](#request-service) - currently bundled into #admin-dashboard
- [Damaged Books Service](#damaged-books-service)

---

**Stack**

* **Frontend:** Vite + React + TypeScript
* **Backend:** FastAPI
* **Database:** Supabase (PostgreSQL)
* **Hosting:** Railway (frontend + backend)
* **Email:** Mailtrap (not deployed)

---

## 🔐 Authentication & Access Control  
### Phase 1A — Supabase Auth Integration (Completed)

> **Phase Status:** ✅ Phase 1 complete (Auth, Access Control, Identity v1)

The Admin Dashboard has transitioned from a single shared Basic Auth gate to a **role-aware, user-based authentication model** built on **Supabase Auth**.

A **dedicated Supabase project** (`kal-admin-dashboard`) is now the canonical source of truth for:
- authentication
- user identity
- role assignment
- session lifecycle

This establishes a secure foundation for fine-grained access control across all Admin Dashboard modules.

---

### 🎯 Design Goals

- Eliminate shared credentials
- Support multiple admins concurrently
- Enable role-based access (admin / editor / user)
- Distinguish **authentication** from **authorization**
- Allow local development without Railway dependency
- Keep Phase 1A focused on correctness, not polish

---

## 🧩 Auth Model Overview

### Supported Login Methods
- **Primary:** Email + password
- **Secondary:** Email magic link
- **Not supported:** Public signups, OAuth providers (for now)

All users are **invited explicitly** by an Admin via the Supabase UI.  
There are **no public signups** for the Admin Dashboard.

---

### User Lifecycle States

The system intentionally distinguishes between three states:

1. **Unauthenticated**
   - No Supabase session
   - Redirected to `/login`

2. **Authenticated but Unprovisioned**
   - Supabase `auth.users` row exists
   - No matching row in `public.profiles`
   - User is blocked with an explicit message:
     > “Account not fully provisioned. Please contact an administrator.”

3. **Authenticated + Provisioned**
   - Supabase auth session
   - `profiles` row exists
   - Role resolved
   - Dashboard access granted

This separation prevents partially onboarded users from accessing any Admin UI.

---

## 🗄️ Database Model (Auth)

### `profiles` table

- Primary key: `id` (UUID)
- Foreign key: `auth.users.id`
- Roles stored as string enum:
  - `admin`
  - `editor`
  - `user`

```
profiles
──────────────
id (uuid, pk)
email (text)
display_name (text)
role (text)
is_active (bool)
notes (text)
created_at
updated_at
```

> **Phase 1A note:**  
> No Row-Level Security (RLS) policies are enforced yet.  
> This will be revisited once UI-level role enforcement is complete.

---

## 🔄 Auth Flow Summary

1. User visits `/login`
2. User signs in via:
   - email + password **or**
   - magic link
3. Supabase session is established
4. `AuthProvider` hydrates session on load
5. App fetches `profiles` row
6. One of three outcomes:
   - Redirect to dashboard (success)
   - “Account not fully provisioned” screen
   - Redirect back to `/login` (unauthenticated)

### Logout
- Implemented via `supabase.auth.signOut()`
- Clears session
- User is returned to `/login`

---

## 🧪 Local Development (Auth)

Auth can be fully tested **locally**, without Railway.

### Required Frontend Env Vars

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<public anon key>
```

- Env file may be `.env` or `.env.local`
- Must live in `frontend/`
- Vite requires restart after env changes

### Known Setup Issues (Resolved)

- Missing named exports from `supabase.ts`
- Env var typos (`VITE_SUPABASE_ANON_KEY`)
- Duplicate Supabase client instances
- Login page not redirecting after successful auth
- Blank page caused by missing `/` route
- Auth state updating correctly but UI not navigating

---

## 🧱 Architecture Snapshot (Current)

As of this snapshot:

- **Frontend**
  - Vite + React + TypeScript
  - Tailwind CSS (dark mode supported)
  - Supabase Auth integration complete
  - Protected routing in place
  - Logout implemented

- **Backend**
  - FastAPI services unchanged
  - Still token-protected internally
  - Access now gated by authenticated UI

- **Database**
  - Supabase Postgres
  - `profiles` table live
  - No RLS yet (intentional)

- **UI State**
  - Sidebar and routes mounted
  - Role-based sidebar filtering enforced (admin / editor / user)
  - Logout available globally in header
  - Account management intentionally deferred
  - `/welcome` is now the neutral default landing page for `user` role accounts.
  - `/requests` is restricted to `admin` and `editor` roles via route-level enforcement.
  - Direct URL access is now authoritatively blocked by role
  - Sidebar and router-level enforcement are fully consistent

---

## ✅ Phase 1 Completion Snapshot (Locked)

Phase 1 establishes a **production‑grade authentication and authorization foundation** for the Admin Dashboard.

**What Phase 1 definitively delivers:**

- Supabase Auth fully integrated (password + magic link)
- No public signups; invite‑only access
- Canonical `profiles` table keyed to `auth.users`
- Clear separation of:
  - authentication
  - provisioning
  - authorization
- Role model locked: `admin`, `editor`, `user`
- Route‑level role enforcement (authoritative)
- Sidebar visibility aligned with router enforcement
- Neutral `/welcome` entry point for limited users
- `/requests` no longer acts as an implicit gateway
- `/account` page for identity + preferences (non‑privileged)
- Password self‑service via Supabase Auth
- Logout globally available
- Auth hydration hardened (no unauthorized flashes)
- Shared `AuthLoading` gating for consistent UX
- Stable Fast Refresh / DX (no HMR invalidation warnings)

> ⚠️ Phase 1 is **feature‑complete and locked**.  
> Future work must not weaken or bypass these guarantees.

---

## 🛣️ Roadmap

### Phase 1A (Completed)
- Supabase Auth integration
- Password + magic link login
- No public signups
- Profile + role model
- Missing-profile enforcement
- Logout

---

### Phase 1A.3 (Completed)
- Sidebar filtering by role
- Editor access limited to Requests, Damaged Books, Blacklist
- User access no longer includes Requests; users land on `/welcome`
- Sidebar filtering and route-level enforcement are now aligned
- Global logout button added to header

---

### Phase 1B (Completed)

Phase 1B is split into the following ordered sub-phases:

- **Phase 1B.1 — Route-level role enforcement** (**Completed**)
- **Phase 1B.2 — Role-aware default landing** (**Completed**)
- **Phase 1B.2b — Welcome page (neutral dashboard entry)** (**Completed**)
- **Phase 1B.2c — Requests lockdown** (**Completed**)
- **Phase 1B.3 — `/account` page (identity & preferences)**
- **Phase 1B.4 — Auth UX polish**

#### Phase 1B.1 — Route-level role enforcement (**Completed**)
- Sidebar filtering is not authoritative: users can still access restricted routes directly via URL.
- Direct URL navigation must be blocked based on user role.
- Introduce `requiredRoles` prop on `ProtectedRoute` components to enforce access control at the route level.
- **Note:** `user` role is now blocked from `/requests`, `/damaged`, and `/status` at the router level (manual URL access returns Unauthorized).

#### Phase 1B.2 — Role-aware default landing (**Completed**)
- Default route resolution now lands on `/requests` for admin/editor, `/welcome` for user.
- Routing is resolved centrally; LoginPage no longer performs hard redirects.
- Admin/editor default → `/requests`
- User default → `/welcome`

#### Phase 1B.2b — Welcome page (neutral dashboard entry) (**Completed**)
- Introduced a role-agnostic Welcome page inside the Admin Dashboard.
- Welcome page now acts as the primary dashboard surface for `user` role accounts.
- Contains no operational modules; safe landing for limited-access users.
- Decouples dashboard entry from the Request Service.
- Contains no permissions logic and no operational functionality.

### Phase 1B.2c — Requests lockdown (**Completed**)
- `/requests` is no longer accessible to `user`
- Sidebar visibility and router enforcement are fully consistent
- Removes implicit 'gateway' behavior from Requests

#### Phase 1B.3 — `/account` page (identity & preferences)

The `/account` page is a self-service identity and preferences surface for authenticated users.  
It does **not** participate in routing, permissions, onboarding, or access recovery.

**Non-goals**
- No role or permission management
- No routing or landing logic
- No admin user management
- No access request or escalation workflows

Authorization remains exclusively enforced at the router level via `ProtectedRoute`.

##### Phase 1B.3a — Route + shell
- Introduce `/account` route wrapped in `ProtectedRoute`
- Accessible to all authenticated roles (`admin`, `editor`, `user`)
- Render basic page layout with empty sections
- No Supabase writes
- No redirects or mutations

_Status: 🧱 Scaffold_

##### Phase 1B.3b — Read-only identity panel
- Display authenticated user identity:
  - Email (from Supabase session)
  - Role (from `profiles`)
  - Account status
- Role displayed as read-only with copy clarifying admin-managed access
- No mutation actions

_Status: ⚠️ Beta (read-only)_

##### Phase 1B.3c — Preferences (Dark Mode relocation)
- Move `DarkModeToggle` from global header into `/account`
- Persist existing behavior (localStorage + `html.dark`)
- Header remains limited to navigation + logout

_Status: ✅ Production-ready_

##### Phase 1B.3d — Password management (**Completed**)
- Users can change their password via Supabase Auth
- Inline form with validation (password match required)
- Success and error feedback surfaced directly from Supabase
- No routing changes, no forced logout
- Session remains active after password change

_Status: ✅ Production‑ready (v1)_

##### Phase 1B.3e — Email change (deferred / future)
- Allow users to initiate email address changes
- Requires Supabase email confirmation flow
- Must clearly indicate pending / unverified state
- Needs careful UX to avoid account lockout

_Status: 💤 Deferred (not implemented in Phase 1B)_

> **Phase 1B Status:** ✅ Complete  
> Access control, routing, identity, and preferences are stable and production‑ready.

---

### Phase 1C — Auth Hardening & DX (Completed)

Phase 1C focused on correctness, stability, and developer experience.

**Delivered:**
- Tightened auth hydration lifecycle
- Eliminated “account not provisioned” flash during navigation
- Centralized auth loading states
- Removed redirect logic from LoginPage
- Centralized default landing via router
- Stable `AuthProvider` exports (Fast Refresh safe)
- Consistent auth gating across:
  - `ProtectedRoute`
  - `DefaultRedirect`
  - `/welcome`
  - `/account`

> **Phase 1C Status:** ✅ Complete

---

## 🚫 Explicit Non‑Goals of Phase 1

The following are **intentionally not part of Phase 1**:

- Admin UI for managing users or roles
- Invite flows outside Supabase UI
- Email address change (deferred)
- MFA
- Audit log UI
- Row‑level security (RLS)
- Fine‑grained permission matrices
- Self‑service role escalation
- Public authentication or OAuth providers

These will be evaluated in **Phase 2+** only after Phase 1 stability is preserved in production.

---

### Phase 2+
- MFA
- Admin user management UI
- Invite management flows
- Audit & activity logs
- Optional RLS enforcement
- Permission matrices (if needed)

---

## 🔒 Legacy Auth (Deprecated)

The original env-based Basic Auth gate is now considered **deprecated** and will be fully removed once Phase 1A.3 is complete and deployed.

---

## 🌗 Dark Mode Support

The admin dashboard supports dark mode via Tailwind CSS and a custom toggle component.

### ✅ Installation Lessons Learned

* Tailwind CSS setup must match the correct syntax and module format for your environment (e.g., use `.cjs` extensions for `tailwind.config.cjs` and `postcss.config.cjs` when using CommonJS).
* Always wrap Tailwind install commands in quotes when using Zsh to avoid shell expansion errors:

  ```sh
  npm install -D "tailwindcss@^3.4" "postcss@^8.4" "autoprefixer@^10.4"
  ```
* If `npx tailwindcss` fails with "could not determine executable to run", prefer cleaning the project and reinstalling:

  ```sh
  rm -rf node_modules package-lock.json dist .vite
  npm cache clean --force
  npm install
  ```

### ✅ How Dark Mode Toggle Works

* `DarkModeToggle.tsx` toggles the `dark` class on the `html` element to trigger Tailwind’s dark styles.
* Theme-based classes are applied directly via Tailwind (e.g., `bg-white dark:bg-gray-900`).
* No additional frameworks — just Tailwind for theming.

---

## ✅ Request Service

**Users**

* Submit interest in out-of-stock products (email, product ID, product title, ISBN)

**Admins**

* View the 100 most recent interest submissions
* Sort requests by phase order (New → In Progress → Request Filed → Complete)
* Change request status via dropdown selector (with Tailwind dark mode styling applied)
* Immediate frontend sort re-application on status change (optimistic UI)
* Debug logging of payloads and Supabase RPC responses

## 📦 Damaged Books Service

Phase 1 of the Damaged Books Service (DBS) integration is now live in the Admin Dashboard.

**Features**
- Fetches from `/admin/damaged-inventory` on DBS (token-protected)
- Renders a table with condition, stock, and Shopify links
- Drawer UI shows full product data, related logs, and document links
- Docs tab pulls from `/admin/docs`
- Logs tab links to the log UI with a pre-filtered query on handle
- Reconcile Now button (optional Phase 1 feature)

**DBS Environment Variables (Frontend)**
```env
VITE_DBS_BASE_URL=https://used-books-service-production.up.railway.app
VITE_DBS_ADMIN_TOKEN=your_token_here
```

**Expected DBS Response**
```json
{
  "data": [
    {
      "inventory_item_id": 123,
      "product_id": 456,
      "variant_id": 789,
      "handle": "sample-title",
      "condition": "moderate",
      "available": 1,
      "last_shopify_sync_at": "...",
      "last_webhook_at": "...",
      "stock_status": "in_stock",
      "title": "Sample Title"
    }
  ],
  "meta": { "count": 1 }
}
```

**Setup Notes**
- Token must be passed as `X-Admin-Token` in request headers
- `import.meta.env.VITE_DBS_*` values must be defined at build time
- DBS must allow CORS from the Admin Dashboard origin
- The sidebar now includes a “Damaged Books” tab if the route is mounted

## 📡 System Status Module

The System Status Dashboard provides real-time visibility into the health of all critical services.

**Overview**
- Each service cluster includes multiple endpoints (e.g., public, internal, worker).
- The dashboard fetches each endpoint and classifies its health as `Healthy`, `Degraded`, `Offline`, or `Partial`.
- A top-level summary indicator reflects the worst-case status across all services.
- The dashboard auto-refreshes every 30 minutes.

**Tracked Services**
- Admin Dashboard (Frontend): `admin.kitchenartsandletters.com` + Railway URL
- Admin Dashboard (Backend): `outofstock-notify-frontend-production.up.railway.app:8000`
- Request Service: `api.kitchenartsandletters.com` + Railway URL
- Damaged Books Service: `used-books-service-production.up.railway.app:3000` + DBS cron
- Webhook Gateway: Main + Retry cron worker endpoints

**Environment Variables Required**
```env
VITE_ADMIN_DASHBOARD_FE=https://admin.kitchenartsandletters.com
VITE_ADMIN_DASHBOARD_FE_RAILWAY=https://hearty-respect-production.up.railway.app:8080
VITE_ADMIN_BACKEND=https://outofstock-notify-frontend-production.up.railway.app:8000
VITE_REQ_PUBLIC=https://api.kitchenartsandletters.com
VITE_REQ_RAILWAY=https://outofstock-notify-public-production.up.railway.app:8080
VITE_DBS_URL=https://used-books-service-production.up.railway.app:3000
VITE_DBS_CRON=https://airy-friendship-production.up.railway.app:3000
VITE_WEBHOOK_URL=https://webhook-gateway-production.up.railway.app:3000
VITE_WEBHOOK_CRON=https://cron-retry-worker-production.up.railway.app:3000
VITE_DBS_ADMIN_TOKEN=your_token_here
VITE_ADMIN_TOKEN=your_token_here
```

**Optional**
```env
VITE_HEALTH_TIMEOUT_MS=4000
```

Each route in the dashboard uses `SystemStatusService.ts` to call and evaluate the endpoints. Results are cached in state and refreshed automatically every 30 minutes.

---

## ⚙️ Environment Variables

### Frontend `.env`

```env
ADMIN_PASS="1435lex"
ADMIN_USER="admin"
VITE_ADMIN_TOKEN="devtesttoken123"
VITE_API_BASE_URL="https://outofstock-notify-frontend-production.up.railway.app"
```

### Backend (Railway ENV)

```env
BACKEND_URL="outofstock-notify-frontend-production.up.railway.app"
SUPABASE_KEY=service_role_key
SUPABASE_URL=supabase_project_url
VITE_ADMIN_TOKEN="devtesttoken123"
VITE_API_BASE_URL="outofstock-notify-frontend-production.up.railway.app"
VITE_DBS_ADMIN_TOKEN="devtesttoken123"
VITE_DBS_BASE_URL="https://used-books-service-production.up.railway.app"
```

---

## 🔁 API Endpoint Summary

**POST** `/api/interest`
Submits an interest request.

```json
{
  "email": "user@example.com",
  "product_id": 123,
  "product_title": "Example Title",
  "isbn": "9781234567890"
}
```

**GET** `/api/interest?token=VITE_ADMIN_TOKEN`
Returns a list of recent interest submissions.
Protected by `VITE_ADMIN_TOKEN`.

**POST** `/api/update_status?token=VITE_ADMIN_TOKEN`
Updates a request’s status in Supabase.
Logs both the incoming payload and Supabase RPC response for debugging.

---

## 🔍 Shopify Theme Snippet

*`main-product.liquid` snippet* (placed around line 514):

<div id="notify-form-wrapper" class="product-form__line-item-field" style="margin-top: 1rem;">
  <label id="notify-label" for="notify-email" class="product-form__line-item-text-label">
    Want to be added to our request list?
  </label>
  <input
    id="notify-email"
    class="product-form__line-item-text-input"
    type="email"
    name="notify-email"
    placeholder="Enter your email"
    required
    style="margin-bottom: 0.5rem; width: 100%;"
  />
  <button
    type="button"
    id="notify-submit"
    class="c-btn c-btn--primary"
    style="margin-top: 0.25rem;"
  >
    Notify Me
  </button>
  <p id="notify-status" style="margin-top: 0.5rem; font-size: 0.9em;" aria-live="polite"></p>

  <!-- Hidden span for barcode injection -->
  <span id="shopify-barcode" style="display:none;">
    {{ product.variants.first.barcode | default: 'NO_BARCODE' }}
  </span>
</div>

<script>
  document.addEventListener('DOMContentLoaded', function () {
    const submitBtn = document.getElementById('notify-submit');
    const emailInput = document.getElementById('notify-email');
    const statusEl = document.getElementById('notify-status');
    const labelEl = document.getElementById('notify-label');
    const barcode = document.getElementById('shopify-barcode')?.textContent?.trim() || 'NO_BARCODE';

    {% if customer %}
      if (emailInput) emailInput.value = "{{ customer.email }}";
    {% endif %}

    const handleSubmit = async () => {
      const email = emailInput.value.trim();
      if (!email || !email.includes('@')) {
        statusEl.textContent = 'Please enter a valid email.';
        statusEl.style.color = 'red';
        return;
      }

      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Sending...';

      const data = {
        product_id: {{ product.id }},
        product_title: "{{ product.title | escape }}",
        isbn: barcode,
        email: email
      };

      console.log("Notify form submission payload:", data);

      try {
        const res = await fetch("https://api.kitchenartsandletters.com/api/interest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(data)
        });

        if (res.ok) {
          statusEl.textContent = 'Thank you! We’ll notify you when this title is available.';
          statusEl.style.color = 'green';
          emailInput.style.display = 'none';
          submitBtn.style.display = 'none';
          labelEl.style.display = 'none';
        } else {
          statusEl.textContent = 'There was an issue submitting your request.';
          statusEl.style.color = 'red';
        }
      } catch (err) {
        statusEl.textContent = 'Network error. Please try again later.';
        statusEl.style.color = 'red';
      }

      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    };

    submitBtn?.addEventListener('click', handleSubmit);

    emailInput?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    });
  });
</script>

---

## ⚠️ Key Debugging Fixes

* ✅ Ensure `VITE_API_BASE_URL` is fully qualified (https\://…)
* ✅ Fixed fetch URLs to remove stray `=` in query params
* ✅ Added FastAPI CORS middleware to allow frontend requests
* ✅ Mounted all backend routes under `/api`
* ✅ Unified `InterestEntry` type into `src/types.ts` to prevent TS conflicts
* ✅ Updated dropdown `onChange` to use `entry.id` (UUID from DB) instead of `cr_id`
* ✅ Backend now logs:

  * Incoming `/api/update_status` payloads
  * Raw Supabase RPC responses before returning to the frontend

---

## 🎨 UI Enhancements

* **Dark mode dropdown styling** — In dark mode, dropdowns have a dark background with readable text
* **Status phase sorting** — Sorting by status now respects the defined phase order, not alphabetical
* **Future consideration:** Replace native `<select>` with a custom Listbox to allow **per-option colorization** while dropdown is open

---

## 🚀 Deployment Instructions

1. Frontend Deployment (Railway)

Initial Setup
	•	Connect Railway frontend project to your GitHub repo (ensure Root Directory set to frontend/)
	•	In Settings > Environment, add:

VITE_API_BASE_URL=https://outofstock-notify-frontend-production.up.railway.app
VITE_ADMIN_TOKEN=your_admin_token_here


Build & Publish
	•	Railway auto-builds from the root of the frontend folder
	•	Make sure vite.config.ts is properly configured for production builds
	•	On successful deploy, Railway assigns a production URL (e.g. https://admin.kitchenartsandletters.com)

⸻

2. Backend Deployment (Railway)

Initial Setup
	•	Connect backend folder as a separate service in Railway (backend/)
	•	Entry point must be app.main:app (FastAPI)
	•	Add this to Settings > Environment:

VITE_ADMIN_TOKEN=your_admin_token_here

Enable CORS (in main.py)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://admin.kitchenartsandletters.com",
                   "https://www.kitchenartsandletters.com"
                   ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Deploy
	•	On git push, Railway will auto-build and restart the backend container
	•	The backend will be available at a subdomain like:
https://outofstock-notify-frontend-production.up.railway.app

⸻

3. Local Development

Backend (FastAPI)

cd backend
uvicorn app.main:app --reload

Frontend (Vite)

cd frontend
npm run dev

Make sure .env contains the correct local VITE_API_BASE_URL, e.g.:

VITE_API_BASE_URL=http://localhost:8000

---

## 🧩 Next Steps

### Phase 2 — Admin & Governance (Upcoming)

- Admin user management UI (invites, roles)
- Audit & activity logs
- Optional RLS enforcement
- MFA (selective, admin‑first)
- Permission matrices (only if proven necessary)

-✅ Recently Completed
- Added Shopify frontend **customer name** field alongside email; payload now includes `customer_name`.
- Backend updated to accept and store `customer_name`; UI shows a **Customer** column with sorting/search support.
- Implemented **Status** column with 6-phase dropdown; sorts by phase order (not alphabetically) and re-sorts optimistically on change.
- Atomic status updates via Supabase RPC `update_status_with_log`; de-duped logging; added debug logging in routes and client.
- Enriched inserts with Shopify **collection handles/titles** and **tags**; implemented **Out-of-Print** vs **Not OP** backend filter.
- `GET /api/interest` now supports `collection_filter`, pagination (`page`, `limit`); frontend dropdown added for collection filter.
- Backfill scripts for tags/collections/handles improved with **retry + rate limiting** mitigation and handling of **null/empty arrays**.
- Implemented **pagination** (`page`, `limit`) in backend + UI; page summary (`X–Y of Z`) now displays; dropdown filter integrates with pagination.
- Added a **pagination selector** (20/50/100) and persist selected page size + collection filter via localStorage.
- Advanced filtering: OOP definition in sync (tags `op`/`pastop`, OOP collections, or title starting with "OP: ").
- Statuses changed to New → In Progress → Request Filed → Complete
- Added full-featured **Blacklist Manager**:
  - Allows admin to search Shopify for a product by barcode or ID, preview results, and add to a server-side blacklist table.
  - Exporting the blacklist generates a Liquid snippet used by the Online Store to conditionally suppress the request form on select product pages.
  - Snippet injection now writes directly to the live theme's `main-product.liquid`, replacing or inserting the assignment logic.
  - Fixed search and filter so they now apply across the entire dataset, not just the current page.
- Replaced barcode-based blacklist logic with product ID-first logic across all layers:
  - Backend routes (`/blacklist/add`, `/blacklist/remove`, `/blacklist/export_snippet`) now use `product_id` as the primary identifier.
  - Supabase schema updated to enforce uniqueness on `product_id`, with `barcode` downgraded to secondary/indexed field.
  - Snippet generation (`export_blacklist_snippet`) now emits product IDs into `product_ids` instead of `barcodes`.
  - Shopify theme snippet updated to suppress notify form via product ID matching.
- Added safeguard to ignore empty barcodes during blacklist insert.
- Fixed long-standing 408/499 timeout issue with Railway-hosted frontend:
  - Root cause was invalid or missing `VITE_API_BASE_URL`.
  - Hardened `server.js` logic to validate and log missing or malformed `.env` values.
  - Proxy path rewriting and error handling improved.
  - Deployment restored and verified after rollback and redeploy using SHA: `d6cf520ee3201281a0791ed0d8ce3200cf662eb9`.
- Backend `/api/interest` updated with server-side filtering and pagination aware of filters.
- Frontend now wires filters and search directly into backend fetch; local-only filtering removed.
- Page reset on filter change now ensures dataset view is correct (always snaps to valid page).

📌 Next Steps
- UI polish: scale down table font size, explore per-option color cues for the status dropdown.
- Consider full per-option colorization using a custom Listbox component (only if users request it).
- Extend logging to track admin interactions by specific user for auditing (replace hard-coded "admin" - add users).
- Handle **page reset on filter change** (snap to last valid page if current page exceeds dataset).
- Row actions: add **archive** / **delete** functionality.
- Add a **request history log** in the dashboard (status change trail).
- Modals for manual **create/edit**; support **bulk editing** abilities.
- Notifications: Slack/email on new submissions and/or status changes.
- Validation: tighten whitespace-only name handling in Shopify UI and optionally enforce server-side sanitization.
- Data retention & privacy: implement automatic archiving/deletion (e.g., delete open requests after 12 months; archive after fulfillment) and update Privacy Policy accordingly.

## #damaged-books-service

### Phase 2 Planning

* Remove ": Damaged" from table book titles
✅ Recently Completed
- Variant-level management now operational, and stable
- Added manual “Reconcile Now” button at table-level (visible to admins)

📌 Next Steps
* Add inline override controls:
  * PATCH /admin/damaged-inventory/:variant_id/override
  * Body includes: `publish: boolean`, optional `redirect_target`, and `notes`
  * UI control: dropdown or toggle with conditionally rendered inputs for redirect + notes
* Build reconciliation status badge or column per row (e.g., last_sync status)
* Add inline notes editor with audit logging?
* Filter/search controls by:
  * Condition (dropdown)
  * Stock status ✅
  * Author (SKU)
  * Barcode
  * Handle
  * Product/Variant ID
* Add pagination or virtual scroll to support >2,000 rows
* Enable markdown rendering inside the Docs tab instead of link-only view (this is good to go just need to expose in AD)
* Add bulk actions (need to plan/ideate what would be useful)
* Create server-side audit log (damaged.changelog) with Supabase triggers
* RightSideBar
  - Relocate "Live" url link
  - Add:
    - product.id
    - product.handle
    - variant.id

---

## 🎨 Tailwind Style Guide

All services and shared components should conform to the following Tailwind conventions:

- **Dark Mode:** Use `dark:` variants on all backgrounds, borders, and text
- **Tables:** Always apply `text-sm`, striped row alternation via `border-t`, and dark mode borders
- **Typography:** 
  - Headings: `text-xl font-semibold` (subheaders), `text-3xl font-semibold` (section headers)
  - Paragraphs and UI text: `text-sm` or `text-xs` depending on density
- **Buttons:** Rounded, padded (`px-4 py-2`), `hover:` variants, consistent color roles (`bg-blue-500`, `bg-gray-600`, etc.)
- **Sidebar Navigation:** Highlight active route with `font-semibold bg-gray-200 dark:bg-gray-700`
- **Responsiveness:** Use `sm:`, `md:` utilities to support sidebar collapse and mobile layouts
- **Sidebar Drawer Animation:** Apply `transition-transform duration-300 ease-in-out` for smooth slide-in/out effects. Use `translate-x-0` when visible and `translate-x-full` when hidden.
- **Backdrop Blur & Darken:** Apply a fixed full-screen `div` with `backdrop-blur-sm bg-black/40` behind modals or drawers to create a darkened, blurred background effect.
- **Table Row Styling:**
  - Use `border-t border-gray-200 dark:border-gray-700` on rows to visually separate them.
  - Apply `even:bg-gray-50 dark:even:bg-gray-800` to alternate row backgrounds for readability.
  - Use `border` or `border-r` on `<td>` elements for vertical column delineation.
## 🔒 Phase 1 Lock

This README reflects the **final locked state of Phase 1**.

Any future changes to authentication, routing, or access control must:
1. Preserve all Phase 1 guarantees
2. Be explicitly documented as Phase 2+ work
3. Avoid regressions in role enforcement or auth hydration

_Last updated: Phase 1 complete_

---