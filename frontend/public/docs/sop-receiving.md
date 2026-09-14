# SOP — Receiving Stock

**Owner:** Gil · **Report to:** `#receiving-issues` · **Last reviewed:** 2026-09-14

> This is the procedure — what to do, in what order, and what to report.
> For what a screen, badge, or field *means*, open the **View Help Guide** button
> on that screen.

---

## Purpose

Bring a shipment into inventory accurately, so Shopify stock matches the shelf
and anything unusual is visible to someone who can act on it.

## When to use this

Every carton that arrives — with or without a packing slip, with or without a
known PO.

## Before you start

- One carton at a time. Don't open a second box mid-session.
- Packing slip in hand, plus a phone with a **document scan** feature (Notes or
  Files — not a plain camera photo).
- Know which location you're receiving into. It defaults to the PO's destination.

---

## Steps

### 1. Open a session

**Receiving** → **+ New Receipt**.

If you already know the PO, you can also open it from the **Awaiting receipt**
pane on the Receiving screen and hit **Receive →**.

### 2. Scan the packing slip

Tap **Add page 1**. Multi-page slips (RDH slips are routinely two pages) get one
photo per page — add each separately, then tap **Process**.

Lay the slip flat, phone directly above in portrait, all four edges in frame, no
glare across the text.

### 3. Fix what the scan read — before going further

Check every ISBN, title, and quantity against the slip. Lines flagged for review
are the system saying it isn't sure. Correct them here.

A misread ISBN that gets through becomes a much bigger problem downstream than a
few seconds spent now.

### 4. Confirm where it's going

The system proposes an order — matched either by a PO reference on the slip or by
comparing ISBNs against open orders. Confirm it, or override it.

- **One PO** → continue to reconciliation.
- **Several POs on one slip** → receive each from the shared session dashboard.
- **No match** → use ad hoc receiving. The system creates the PO. Don't abandon
  the box.

Never accept a match you don't believe.

### 5. Reconcile slip against order

Review the side-by-side:

- **Matched** — on both the slip and the PO. Check the delta badge.
- **On slip only** (amber) — arrived but isn't on this PO. Possible mis-ship, or
  a title to add.
- **On PO only** (gray) — still outstanding, not arriving today.

### 6. Count and enter quantities

Every line starts at **0**. Enter what you physically counted.

- **Qty received** means **undamaged copies only**. This is what goes to Shopify.
- On a multi-line PO, **Receive all** fills in the full outstanding quantity —
  use it only when the shipment is genuinely complete. **Clear all** resets.
- Scanning the slip inside the wizard auto-fills quantities. Anything not on the
  slip is set to 0 and badged **Not on slip** — verify before submitting.

### 7. Record damage

Tap **+ Damage** on the line. Then:

1. **Total arrived (incl. damaged)** — everything in the box for that line.
2. **Qty damaged** — how many of those were bad.

Received is calculated for you: arrived minus damaged. Never do that subtraction
yourself, and never enter damaged copies as received.

Then set two things:

| Control | Options |
|---|---|
| **Disposal of damaged copies** | Donate / destroy · Return (call tag) |
| **Publisher response** | Credit (line closes) · Replacement incoming (same PO#, line stays open) |

Credit means you're square on money. Replacement incoming means you're square on
books. If the publisher hasn't said yet, **leave Publisher response unselected** —
it can be recorded later, and the line shows up under **Needs attention** until
it is.

### 8. Act on the two in-line warnings

Neither blocks receiving, but both need action:

- **Price mismatch** — Shopify's price differs from the publisher's list price.
  Fix the product in Shopify **before the book goes on the shelf**.
- **Units committed to unfulfilled orders** — copies are already here and
  customers are waiting. Check whether they should have shipped already.

### 9. Mark anything that didn't ship

If the slip or the publisher says a title is **Backordered**, **Out of stock**, or
**Out of print**, mark it on the line. The first two keep the line open; out of
print closes it. This can also be done later from the PO detail panel.

### 10. Review and confirm

Check the confirm summary — especially the damaged lines and the unit count in
the button. Then confirm. Don't close the page while it's applying.

If the PO is flagged **Test**, Shopify will not be updated. That's expected on a
test PO and not a failure.

### 11. Save the record and report

- **Download the receipt PDF** from the result screen. That is the record.
- Post in `#receiving-issues` using the pinned template.

Report even when everything went fine. The post is how anyone else knows the
carton was handled.

---

## Clearing "Needs attention"

The **Awaiting receipt** pane on the Receiving screen has a **Needs attention**
tab. It holds lines that were received but left a loose end. Work it down — these
don't clear themselves.

- **Damage unresolved** — damaged copies were recorded but no publisher response
  was ever set. Resolve it here: **Credited** or **Replacement coming**.
- **Over-accounted** — more units are accounted for on the line than were
  ordered. **Not resolvable here on purpose.** A replacement copy and an
  over-shipment look identical in the data, so use **Find in POs →** and check
  the order. Don't paper over a counting error with a credit.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| **Receipt comes back Failed** | You may receive against the PO again. **Reporting it is mandatory either way** — post the PO number and a screenshot in `#receiving-issues`, whether or not the retry worked. |
| **Partial receipt — some lines failed** | Same as above: retry is allowed, the report is not optional. |
| Scan won't read the slip | Rescan using document-scan mode. Still failing — use the manual PO search and enter lines by hand. |
| No PO number anywhere on the slip | Ad hoc receiving. The system creates the PO for you. |
| A book isn't found in search | Catalog gap — go to **Catalog coverage**, register it by ISBN, then come back. |
| Confirmation screen names the wrong order | Override it. |
| Counted quantity disagrees with the slip | Enter what you counted, put the discrepancy in **Notes**, and report it. |
| Same PO shows several attempts | Normal. Open the row on the Receiving screen to see each attempt and what it did. |

## What to report

Post in `#receiving-issues` with:

- PO number and supplier
- What you received (units) and anything outstanding
- Anything you overrode, corrected, or weren't sure about
- Any failed or retried receipt, with a screenshot

---

## Related guides

- **Receiving** — statuses, the four stat cards, the failed-receipt block
- **Receiving — Intake** — scanning, matching, ad hoc, supply status
- **Receiving — Counting Books In** — the wizard, damage fields, worked example
