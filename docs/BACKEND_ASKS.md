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

## Answered

_None yet._
