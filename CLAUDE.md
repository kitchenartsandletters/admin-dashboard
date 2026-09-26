# CLAUDE.md — admin-dashboard

Conventions for AI assistants (Claude Code and chat) working in this repo. Keep it short and current.

**Read `docs/DOCS_STATUS.md` first.** `docs/Infrastructure.md` is untrusted and no longer relevant. For the request module, `request-service/docs/DOCS_STATUS.md` is authoritative.

## Branches & deploys
- **`main` is the live branch.** Frontend and backend both deploy automatically from `main` on Railway; the branch Railway builds is configured in the Railway dashboard, not in this repo.
- **Open every PR against `main`.**
- The **`development` branch is retired** — it fell dozens of commits behind `main` and is not deployed. Do not branch from it, target it, or treat it as live. Some older notes (including a "Git state" line in README.md) still mention `development`; those are stale and wrong.

## Stack (orientation)
- Vite + React 18 + TypeScript, React Router v7, Tailwind 3, lucide-react. Plain `fetch` + hooks; Supabase auth.
- The preorder shipping-profiles screen is `frontend/src/components/preorder/ShippingProfiles.tsx`. It renders read-model data from the external `preorder-service` backend (deployed from *that* repo's `main`) under `/admin/preorders/shipping/profiles`; the dashboard does not compute preorder logic itself.
