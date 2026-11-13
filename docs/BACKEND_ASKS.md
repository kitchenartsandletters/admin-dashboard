# Open questions for supply-chain-service

Frontend → backend relay list. Gil carries these to the backend chat. When one
is answered, move it to **Answered** with the answer and the PR or date, so it
stays findable.

## Open

### 1. KAL-10230 · Masa: no committed quantity shown while receiving (2026-11-03)

**Seen:** Receiving KAL-10230 in the wizard, the *Masa: Techniques, Recipes,
and Reflections on a Timeless Staple* line showed no committed quantity. Gil
expected some.

**Line:** PO `6f862e62-18ba-45a2-a3f2-96664b77b5e7` (submitted, destination
`gid://shopify/Location/40052293765`), line `2d254054-3285-4fd9-bc5d-925ecc3cd3c0`,
ordered 2, received 0, variant `gid://shopify/ProductVariant/39775209390213`,
item `gid://shopify/InventoryItem/41858726985861`, ISBN 9781797209920.

**What the frontend does with it.** `on_hand` / `committed` come from
`po_enrich.attach_stock_and_price` (supply-chain-service#61) on
`GET /api/purchase-orders/{id}`. The wizard shows `on_hand` as a number, but
shows `committed` **only** inside the red alert, and that alert is gated on
`stock_alert = on_hand > 0 AND committed > 0`. So the line shows no committed
figure at all when any of these hold:

- (a) `on_hand` is 0 or null. Committed units against a title with nothing on
  the shelf are hidden by design: that is a backorder, not the "on the shelf
  while customers wait" case the alert exists for.
- (b) `committed` is 0 at the PO's destination location, e.g. the waiting
  orders are assigned to a different fulfilment location.
- (c) `committed` is null: the variant was missing from the
  `get_variant_snapshots` response, or the snapshot call failed (it is caught
  and blanked; check the logs for `attach_stock_and_price: snapshot fetch failed`).

**Please check:** the raw `get_variant_snapshots` result for that variant at
that location (on_hand / committed / available), and which location the
Masa orders are actually committed at. Then tell us which of (a)–(c) it was.

**Frontend follow-up depends on the answer.** If it is (a), the receiving
redesign can show committed on every line, not only inside the alert. If it
is (b), the decision is whether "committed" should mean the destination
location or all locations.

### 2. Does `DELETE /api/purchase-orders/lines/{id}` refuse lines on submitted POs? (asked 2026-11-03)

The dashboard only offers delete on draft lines (Gil's decision). Is that also
enforced server-side, and should it be?

### 3. Does `GET /api/purchase-orders/{id}` return `quantity_replaced` on lines?

The PO detail sidebar computes the quantity floor client-side. Without
`quantity_replaced` it falls back to a minimum of 1 and relies on the 409 (see
`docs/PO_LINE_EDITING.md`). If the field is there, nothing to do. If not,
please add it to the line model.

### 4. What is the upper bound on `limit` for `GET /api/purchase-orders`?

`ReceivingDashboard.tsx` pages submitted dates at 100 because 100 is the only
value known to be accepted. If it allows 200, the page can go up.

### 5. Vendor setup: preview blockers carry no `message` (2026-11-13)

`POST /attention/vendor-setup/{id}/preview` returns blockers as `{error, ...details}`
with no `message`, while resolve's refusals carry `_MESSAGE` text. The dashboard
(`pages/VendorSetupModal.tsx`, `blockerText`) writes its own wording per code,
so two sets of wording can drift. Could `vendor_setup_apply`'s blockers (or the
route) include the same `message` as the refusal table? If so, the dashboard
will show it and keep its own text only as a fallback.

### 6. Vendor setup: preview of a closed request (2026-11-13)

Previewing `d4699fa1-3c93-43e2-84d9-6f6e85490e2f` (Elliott's, resolved) returns
**200** with blockers `request_not_open`, `name_exists` and `claimed_elsewhere`;
only resolve returns 409. The dashboard handles both. Two questions:

- Intended that preview reports `request_not_open` as a blocker rather than a 409?
- The same preview lists 4 `moves` from "Elliott's Main Account" (active), because
  a create has no destination account yet, so every active title of the vendor is
  counted. For a closed request that list is misleading. Should `moves` be empty,
  or the plan short-circuit, when the request isn't open?

### 7. Vendor setup: damaged-copy SKUs count as titles (2026-11-13)

Montgomery Press's 9 "titles to move" were 4 books plus 5 damaged-copy variants
(SKUs like `the_irish_bakery_light`, titles like "The Irish Bakery: Damaged").
They also appear in `sample_titles` with those SKUs in the `isbn` field. Intended?
If damaged variants should follow their book, fine; if they shouldn't count in
`active_titles` / `titles_to_move` or appear as samples, that is a backend change.

### 8. Vendor setup: `wholesaler` role (2026-11-13)

`NewSupplier.roles` accepts publisher, distributor, small_press, direct,
restaurant, author, other. The dashboard's `SupplierRole` (and supplier records)
also has `wholesaler`. The card offers only the seven accepted. Should
`wholesaler` be accepted when setting up from the card?

## Notes for the backend chat (no action needed)

- **No receiving-exceptions card on `/welcome`.** The vendor-setup brief said the
  new card sits "next to the stock-waiting and receiving-exceptions cards". The
  welcome page (`pages/WelcomePage.tsx`) has no receiving-exceptions card;
  `api/attentionApi.ts` has `fetchReceivingExceptions`, but the welcome page
  never calls it. If one was expected, that is frontend work still to do.
- **Count drift.** `VENDOR_MANAGEMENT.md` §4.3 says 222 open; the live list said
  221 on 2026-11-13 before any card use, 220 after Montgomery Press.
- **Suggestions today.** All open requests returned had a suggestion with
  `has_active_account: false`, so the card defaults to "Set up" everywhere. The
  "did you mean → attach" default has no live example yet.
- **Frontend transport.** `api/attentionApi.ts` has its own copy of the request
  helper with no actor headers and no structured errors. The vendor-setup calls
  live in `api/supplyChainApi.ts` for that reason. Folding attentionApi into
  supplyChainApi is a frontend follow-up.

## Verified

### Vendor-setup card, first live resolve (2026-11-13)

Montgomery Press (request `b9668b9b-348c-4a83-a1db-b624c07a54ea`, 774 units in
24 months) set up from the card as a Publisher by Gil. Checked in the database
afterwards:

- request `resolved` at 15:05:47 UTC, `asserted_actor_email`
  gil@kitchenartsandletters.com, role admin (no staff fields: admin session,
  as expected);
- the existing account-less "Montgomery Press" record was revived, not
  duplicated: active, roles `{publisher}`, code `Montgomery Press`;
- a new active primary account; the old inactive "Primary (seeded)" account
  left in place;
- 9 moves in `supplier_product_moves` (source `codes_apply`) with the actor;
  9 active titles now on the supplier;
- open requests 221 → 220.

Not yet exercised live: attach, ignore, and the staff headers (needs a
role `user` session with a PIN-picked staff member).

## Answered

_None yet._
