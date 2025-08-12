# 🛎️ Out-of-Stock Notify (Admin Dashboard)

This project enables customers to express interest in out-of-stock products, and gives admins a secure dashboard to view and manage those interest requests.

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

## ✅ Project Overview

**Stack**

* **Frontend:** Vite + React + TypeScript
* **Backend:** FastAPI
* **Database:** Supabase (PostgreSQL)
* **Hosting:** Railway (frontend + backend)
* **Email:** Mailtrap

---

## 🔧 Key Functionality

**Users**

* Submit interest in out-of-stock products (email, product ID, product title, ISBN)

**Admins**

* View the 100 most recent interest submissions
* Sort requests by phase order (New → In Review → Contacted → Waiting on Customer → Approved → Closed)
* Change request status via dropdown selector (with Tailwind dark mode styling applied)
* Immediate frontend sort re-application on status change (optimistic UI)
* Debug logging of payloads and Supabase RPC responses

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

* Gather user feedback on dropdown usability and possible color-coded status list
* Add full per-option colorization via custom Listbox component
* Extend logging to track admin interactions for auditing
* Add Shopify frontend UI customer name entry field (in conjunction with email collection)
* Refactor supabase ingress db to accept new payload (customer name and email)
* Refactor request table to display customer name in dedicated column
* Filter Controls: dropdown column editor, pagination, advanced filtering
* Add archiving and deleting ability per row
* Add history log in dashboard
* A modal to manually create entries, edit entries
* Bulk editing abilities
* Slack/email notifications
* Validate null or whitespace name entries?
* Setup data rentention policy, regulatory policies, and performance needs -- what regulations do we need to adhere to? how should our policies be updated to include this type of data collection?