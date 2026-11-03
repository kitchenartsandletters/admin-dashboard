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

## Prices (supply chain)
- **KAL does not track cost.** The only price is the publisher's MSRP. Never read, store or display discount, net or "cost" figures, and show an unknown price as "—", never 0.
- `purchase_order_lines.unit_cost` is a deprecated misnomer for MSRP, mid-rename to `unit_price`. Authoritative: `supply-chain-service/docs/PRICING_FIELDS.md`. Read it before touching any price field or label.

## Supplier parties (supply chain)
- **Before touching `supplier_parties`, `parent_id` or `is_returnable` — including the party editor UI — read `supply-chain-service/docs/ORDERING_VS_RETURNS.md`.**
- Who we order from and where returns go are different questions; neither implies the other. `parent_id` currently carries both, so an ordering edit can silently break returns.
- Do not change Chesapeake & Hudson's `is_returnable` or `roles` until that doc's §5 is answered; doing it alone strands its titles.

## Modals
- **New modals use `components/ModalShell.tsx`; never cap a panel with `vh`** — it clips the footer on phones. Layers come from `lib/zIndex.ts`.
- A slide-over with its own Escape handler must check `isModalOpen()` before closing, or Escape in a modal it opened closes both.
- Which modals are migrated, which are unconfirmed, and what is still open: `docs/MODAL_SHELL.md`.

## PO line quantities (supply chain)
- Edits go through `PATCH /api/purchase-orders/lines/{id}`, which enforces a floor and returns a 409 with `minimum_quantity_ordered`. Clamp on that number, not the message. No line deletes on submitted POs.
- Where quantities are edited, the floor, attribution headers, and a pending smoke test: `docs/PO_LINE_EDITING.md`.
- Questions waiting on the backend chat, and their answers: `docs/BACKEND_ASKS.md`.
