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

### 2. Always look for the PO first

Before anything else, search **POs awaiting receipt** — type the PO number,
supplier, or reference.

Do this even when you intend to scan. Receiving against the real order is what
closes the line, updates the outstanding quantity, and keeps the supplier's
account straight. An ad hoc receipt for a shipment that *did* have a PO leaves
the original order sitting open forever, and someone eventually reorders books
that are already on the shelf.

Only when nothing matches do you take **No PO number — create ad hoc receipt**.

### 3. Choose the path: manual or scan

Both paths end in the same wizard. Pick on the shape of the job in front of you.

| Use **manual entry** when | Use **document scan** when |
|---|---|
| You already know the PO, or the slip shows a clear PO number | The slip has no usable PO reference — ISBN matching can still find the order |
| The shipment is short — a handful of lines | The list is long. Typing thirty ISBNs by hand is where errors come from |
| No slip in the box, or it's damaged, creased, or illegible | You're creating an **ad hoc** receipt and need the line list built for you |
| The scan has already failed twice | One slip covers several POs — scanning routes them into a shared session |

**Ad hoc receiving is the case that most rewards scanning.** With no PO to work
from, every line has to be created from scratch; the scan builds that list for
you instead of you typing it.

Falling back to manual mid-session is always fine. If the scan misreads badly,
hide the scanner and search for the PO instead.

### 4. If scanning: capture the slip

Tap **📷 Scan packing slip**, then **Add page 1**. Multi-page slips (RDH slips
are routinely two pages) get one photo per page — add each separately, then tap
**Process**.

Lay the slip flat, phone directly above in portrait, all four edges in frame, no
glare across the text.

### 5. If scanning: fix what it read — before going further

Check every ISBN, title, and quantity against the slip. Lines flagged for review
are the system saying it isn't sure. Correct them here.

A misread ISBN that gets through becomes a much bigger problem downstream than a
few seconds spent now.

### 6. Confirm where it's going

The system proposes an order — matched either by a PO reference on the slip or by
comparing ISBNs against open orders. Confirm it, or override it.

- **One PO** → continue to reconciliation.
- **Several POs on one slip** → receive each from the shared session dashboard.
- **No match** → ad hoc receiving, having already searched in step 2.

Never accept a match you don't believe.

### 7. Reconcile slip against order

Review the side-by-side:

- **Matched** — on both the slip and the PO. Check the delta badge.
- **On slip only** (amber) — arrived but isn't on this PO. Possible mis-ship, or
  a title to add.
- **On PO only** (gray) — still outstanding, not arriving today.

### 8. Count the books and enter quantities

**Every line starts at 0, on every path.** Scanning at intake identifies the
order and builds the line list — it does not fill in counts. Nothing is received
until you put a number on it. This is deliberate: when lines were pre-filled with
the full outstanding quantity, a title that never shipped got received in full
because nobody corrected it down.

So you must do one of these, on purpose:

- **Receive all** — fills every line to its full outstanding quantity. Use it
  only when the shipment is genuinely complete, and check it afterwards.
  **Clear all** puts everything back to 0.
- **Enter lines selectively** — type the count on each line you actually counted.
  Lines left at 0 are treated as not received, not as an error.
- **📷 Scan slip** — the separate scan *inside* the wizard, which does fill
  quantities. Filled lines are badged **From scan**; lines the slip doesn't
  mention stay at 0 and are badged **Not on slip**.

A slip scan fills in what the slip *claims*, not what you counted. Check the
filled numbers against the box before submitting, and pay particular attention to
**Not on slip** lines — that badge means the paperwork and the carton disagree.

**Qty received means undamaged copies only.** That is the number that goes to
Shopify.

### 9. Record damage

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

### 10. Act on the two in-line warnings

Neither blocks receiving, but both need action:

- **Price mismatch** — Shopify's price differs from the publisher's list price.
  Fix the product in Shopify **before the book goes on the shelf**.
- **Units committed to unfulfilled orders** — copies are already here and
  customers are waiting. Check whether they should have shipped already.

### 11. Mark anything that didn't ship

If the slip or the publisher says a title is **Backordered**, **Out of stock**, or
**Out of print**, mark it on the line. The first two keep the line open; out of
print closes it. This can also be done later from the PO detail panel.

### 12. Review and confirm

Check the confirm summary — especially the damaged lines and the unit count in
the button. Then confirm. Don't close the page while it's applying.

If the PO is flagged **Test**, Shopify will not be updated. That's expected on a
test PO and not a failure.

### 13. Save the record and report

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
| Scan won't read the slip | Rescan using document-scan mode. Still failing — switch to manual: hide the scanner, search for the PO, enter lines by hand. |
| Scan finds no matching PO | Search manually before accepting ad hoc. The two matchers look at different things and a manual search can find what ISBN matching missed. |
| No PO number anywhere on the slip | Search by supplier and by anything on the carton first. Only then ad hoc. |
| A book isn't found in search | Catalog gap — go to **Catalog coverage**, register it by ISBN, then come back. |
| Confirmation screen names the wrong order | Override it. |
| Counted quantity disagrees with the slip | Enter what you counted, put the discrepancy in **Notes**, and report it. |
| Same PO shows several attempts | Normal. Open the row on the Receiving screen to see each attempt and what it did. |

## What to report

Post in `#receiving-issues` with:

- PO number and supplier
- What you received (units) and anything outstanding
- Anything you overrode, corrected, or weren't sure about
- Any ad hoc receipt you created, and what you searched before creating it
- Any failed or retried receipt, with a screenshot

---

## Related guides

- **Receiving** — statuses, the four stat cards, the failed-receipt block
- **Receiving — Intake** — scanning, matching, ad hoc, supply status
- **Receiving — Counting Books In** — the wizard, damage fields, worked example
