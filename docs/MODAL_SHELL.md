# Modals: ModalShell, the z-index scale, and migration status

Status as of 2026-11-03. Update the tables when a modal moves or a question is answered.

## Why

Modals used to be hand-built as `fixed inset-0` + padding + a panel capped at
`max-h-[90vh]` / `max-h-[92vh]`. `vh` is the *large* viewport (browser chrome
hidden), so on a phone with the address bar showing, the panel ran past the
screen and its footer — usually the submit button — was clipped or unreachable.
This was hit daily when receiving on mobile.

`frontend/src/components/ModalShell.tsx` caps the panel against `svh` (small
viewport), pins the footer, portals to `document.body`, and picks its layer
from `frontend/src/lib/zIndex.ts`. Not `dvh`: it resizes as chrome hides and
makes the modal jump.

**New modals use ModalShell.** Do not reintroduce a `vh`-capped panel.

## Stacking and Escape

`lib/zIndex.ts` is the scale: dropdowns `z-10`, sticky `z-30`, sidebars
`z-40/50`, modals `z-60/70` then `z-80/90` and `z-100/110` for nested modals,
toasts `z-[200]`. ModalShell chooses its level from context: a modal rendered
inside another modal's children lands one layer up. A modal opened from a
slide-over sidebar (not a ModalShell) takes level 0, which is already above the
sidebar.

Escape closes only the topmost modal. Two things sit outside that:

- `RightSidebar` opened inside a modal takes the next modal layer (via
  `useModalLevel()`) and claims Escape first in the capture phase, with
  `preventDefault`, so one press closes one layer.
- A non-modal surface with its own Escape handler must check
  **`isModalOpen()`** (exported by ModalShell) before acting. `PODetailSidebar`
  listens in the capture phase, so it hears Escape before any modal does;
  without the check, Escape in its quantity modal closed the whole sidebar
  (admin-dashboard#110). Any new slide-over that opens a modal needs the same
  check.

## Shared modals

| File | What | Used by |
|---|---|---|
| `supply-chain/purchase-orders/LineEntryModal.tsx` | Quantity entry for one PO line: empty-safe text field, select-all on focus, large − / +. Optional `minimum`, `busy`, `error`, `reason`. | `POBuilder` (draft lines), `PODetailSidebar` (submitted lines). admin-dashboard#110. See `docs/PO_LINE_EDITING.md`. |

## Migration status

| File | Status | Notes |
|---|---|---|
| `supply-chain/purchase-orders/PODocumentImport.tsx` | **Done** | admin-dashboard#104. Tested on phone. |
| `supply-chain/receiving/ReceivingWizard.tsx` | **Done** | admin-dashboard#105. Tested on phone. Discard prompt via `onBeforeClose`. |
| `supply-chain/purchase-orders/POBuilder.tsx` | **Done** | admin-dashboard#106. Its line-entry modal moved to `LineEntryModal.tsx` in #110. |
| `supply-chain/purchase-orders/LineEntryModal.tsx` | **Done** | Built on ModalShell (#110). |
| `components/RightSidebar.tsx` | **Done** (not a modal) | `h-svh`; modal-aware layer. |
| `supply-chain/purchase-orders/PODetailSidebar.tsx` | **Done** (not a modal) | Slide-over at `z-40/50`. Defers Escape to `isModalOpen()` (#110). |
| `supply-chain/receiving/AwaitingReceipt.tsx` — "Show all" | Pending | Read 2026-11-03: hand-built, `max-h-[80vh]`, `z-50`, backdrop click closes. Same `vh` bug, and `z-50` ties the sidebar panel. |
| `supply-chain/receiving/ReceivingDashboard.tsx` — "Show all" | Pending | Read 2026-11-03: same shape as the one above, deliberately ("same shape as the Awaiting receipt modal"). Migrate the two together. |
| `supply-chain/suppliers/SupplierForm.tsx` | Pending | Confirmed `max-h-[90vh]`. Not urgent; adopt when next touched. |
| `supply-chain/purchase-orders/POCSVImport.tsx` | **Unconfirmed** | Listed in an earlier handoff as needing the fix but never read. Not reported on a phone. Read and check when next touched. |
| `components/ConfirmModal.tsx` | **Unconfirmed** | Never read. |
| `supply-chain/receiving/ReceivingEntryFlow.tsx` | **Ruled out** | A normal page, no modal. An earlier handoff listed it in error; do not rewrite it for this. |

Other `fixed inset-0` modals may exist. GitHub code search is unreliable on
this repo, so the list above is only what has been read.

## Resolved

- **`HISTORY_LIMIT` / `PAGE`** live in `supply-chain/receiving/ReceivingDashboard.tsx`.
  Raised on 2026-11-03: `HISTORY_LIMIT` 120 → 200 (the `/history` server
  maximum; its `.in_()` lists are chunked since supply-chain-service#109), and
  the submitted-dates `PAGE` 25 → 100 (`po_routes` chunks since
  supply-chain-service#97). `PAGE` stopped at 100 because that is the limit
  `fetchPurchaseOrders` already sends by default; the endpoint's upper bound
  has not been checked.
