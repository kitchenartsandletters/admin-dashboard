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

## Notes for the backend chat (no action needed)

- **No receiving-exceptions card on `/welcome`.** The vendor-setup brief said the
  new card sits "next to the stock-waiting and receiving-exceptions cards". The
  welcome page (`pages/WelcomePage.tsx`) has no receiving-exceptions card;
  `api/attentionApi.ts` has `fetchReceivingExceptions`, but the welcome page
  never calls it. **Backend, 2026-11-13:** a mistake in the brief; no card was
  intended. Don't add one as part of the vendor-setup work.
- **Count drift.** `VENDOR_MANAGEMENT.md` §4.3 says 222 open; the live list said
  221 on 2026-11-13 before any card use, 220 after Montgomery Press. **Backend:**
  222 → 221 was Elliott's (resolved by API test), 221 → 220 Montgomery Press.
- **Suggestions today.** All open requests returned had a suggestion with
  `has_active_account: false`, so the card defaults to "Set up" everywhere. The
  "did you mean → attach" default has no live example yet. **Backend:**
  expected; the 279 easy cases were closed by hand in the triage.
- **Frontend transport.** `api/attentionApi.ts` has its own copy of the request
  helper with no actor headers and no structured errors. The vendor-setup calls
  live in `api/supplyChainApi.ts` for that reason. Folding attentionApi into
  supplyChainApi is a frontend follow-up. **Backend:** our call; vendor setup
  living in supplyChainApi.ts is fine.

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
role `user` session with a PIN-picked staff member). Attach needs a vendor that
genuinely belongs to an existing supplier; none of the current suggestions is
one, so it waits for a real case. Gil picks.

## Answered

Vendor-setup asks 5–8 were answered on 2026-11-13. The fixes shipped in
supply-chain-service#122 (merged), with migration 068 live. The contract is
`docs/VENDOR_MANAGEMENT.md` §4.3, "Changes after the first live use". The
dashboard follow-up is admin-dashboard `feat/vendor-setup-followups-nov13`.

### 5. Preview blockers carried no `message` — fixed (#122)

Every preview blocker now has `message`, the same wording resolve refuses
with; an unknown future code gets its code as the message. The dashboard shows
it and keeps its own wording (`blockerText`) only as a fallback for a response
from before #122.

### 6. Preview of a closed request returned 200 with blockers — fixed (#122)

Preview of a request that is no longer open is now **409**
`{error: "request_not_open", message, status}`, identical to resolve, with no
moves list. The dashboard already treated a preview 409 like a resolve 409
(message plus "Refresh the list"); a test now covers it.

### 7. Damaged-copy SKUs counted as titles — intended to move; count split (068)

They are catalogue items under the vendor and must follow it, or they would be
stranded on the dead record. Preview and resolve now return
`titles_to_move` (the total, unchanged meaning), `titles_with_isbn`
(ISBN-10/13) and `items_without_isbn`. Montgomery Press: 9 = 4 + 5. The
dashboard shows "9 items (4 titles + 5 other items) will move", with a line
explaining the other items.

### 8. `wholesaler` rejected by vendor setup — by design, no change

"Wholesaler" is a property of an *account* (`is_wholesaler`, a catch-all
ordering lane such as Ingram Content Group), not of a supplier role. A vendor on
the setup card is never that. The card keeps offering only the seven accepted
roles.

### 9. (Raised by the backend) resolve's `destination.new` / `code_added` over-reported — fixed (068)

`destination.new` and `code_added` were true for every create, including a
revive; Elliott's and Montgomery Press would now read `new: false,
revived: true`. Now `new` is true only when a supplier was inserted, a new
`destination.revived` marks a revive, and `code_added` is true only when the
code actually went onto the supplier. The dashboard's success line said "set up
as" for both cases; it now says "Revived <name>" when `revived` is true and
"Set up <name>" otherwise. It deliberately never reads `new`, because a
pre-068 response says `new: true` for a revive.
