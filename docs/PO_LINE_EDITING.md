# Editing PO line quantities in the dashboard

Status as of 2026-11-03. Backend contract: `supply-chain-service/docs/PO_LINE_AUDIT.md`.

## Where quantities are edited

| Surface | Lines | Editor | Delete |
|---|---|---|---|
| `POBuilder` | Draft lines held in the browser | `LineEntryModal` | Yes |
| `PODetailSidebar`, draft PO | Saved draft lines | Inline number input (unchanged) | Yes |
| `PODetailSidebar`, submitted / confirmed / partial PO | Saved lines with status open, partial, backordered or out_of_stock | `LineEntryModal`, opened by the rcvd/ord number or its pencil | **No** — Gil, 2026-11-03 |

The sidebar is the same component on `/purchase-orders` and `/receiving`.

## The floor

The backend refuses `quantity_ordered` below
`received - replaced + damaged + cancelled`, except for an edit that shrinks a
shortfall the line already has. The sidebar's modal uses that as its
`minimum`: the floor, or ordered + 1 for a line already below it.

`quantity_replaced` is not on the frontend `PurchaseOrderLine` type. When the
detail payload doesn't carry it, the client minimum falls back to 1 rather
than overstate the floor, and the backend's 409 supplies the real one. **Not
yet checked whether the payload carries it** — the smoke test below answers it.

On a 409 the modal stays open and takes `minimum_quantity_ordered` from the
error as its minimum. The 409's `message` is not shown: it folds replacements
in ("incl. 2 replacements") and reads oddly to staff. Clamp on the number only.

## Reason

The modal offers an optional reason, sent as `reason` on
`PATCH /api/purchase-orders/lines/{id}` and stored on the change row. It is not
a column on the line.

## Attribution

`auth/ScActorSync.tsx` forwards, via `setScActor` in `api/supplyChainApi.ts`:

| Header | From | Notes |
|---|---|---|
| `X-Actor-Email` / `X-Actor-Role` | Supabase session (`useAuth`) | Always the session — `letters@` on a shared terminal. |
| `X-Actor-Staff-Id` | `useStaff().activeStaff.id` | Sent only if it matches a UUID: the backend 422s a malformed id, and a stale localStorage value must cost attribution, never the edit. |
| `X-Actor-Staff-Name` | `useStaff().activeStaff.name` | `encodeURIComponent`'d — `fetch` throws on non-Latin-1 header values such as "Zoë". |

Admin and editor sessions have no staff layer, so the staff headers are simply
absent. All four are client-asserted, not authenticated.

## Pending verification

admin-dashboard#110 deployed 2026-11-03 but was **not smoke-tested against real
data**: there was no change worth making on a live PO to exercise it. Do this
on the next real edit, or on a test PO:

1. On a submitted PO line, try to lower the ordered quantity below what is
   received. Expect "Minimum is N" and Save disabled.
2. Make a valid change with a reason.
3. Check the change row:

   ```sql
   select seq, new_value, reason, asserted_actor_email,
          asserted_staff_id, asserted_staff_name
   from purchase_order_line_changes
   where source = 'api:update_po_line'
   order by seq desc limit 5;
   ```

   `reason` should hold the text. The staff columns fill only when signed in
   on a shared terminal account (role `user`), not as `gil@`.

Also note whether the modal showed "Minimum is N" *before* saving (the payload
carries `quantity_replaced`) or only after the 409 (it doesn't). Record the
result here and delete this section.
