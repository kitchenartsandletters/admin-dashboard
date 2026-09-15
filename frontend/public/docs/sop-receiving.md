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
- The packing slip, if the carton has one. You can receive without it.

Everything below can be done by hand from the screen in front of you. Document
scanning is an optional shortcut, covered in step 3.

---

## Steps

### 1. Open a session

**Receiving** → **+ New Receipt**.

If you already know the PO, you can also open it from the **Awaiting receipt**
pane on the Receiving screen and hit **Receive →**.

### 2. Always look for the PO first

Search **POs awaiting receipt** — type the PO number, supplier, or reference.
Select the order and you go straight to counting.

Do this even when you intend to scan. Receiving against the real order is what
closes the line, updates the outstanding quantity, and keeps the supplier's
account straight. An ad hoc receipt for a shipment that *did* have a PO leaves
the original order sitting open forever, and someone eventually reorders books
that are already on the shelf.

If the order you pick has already been fully received, you'll get a warning
screen instead of the wizard. Don't push past it — check you have the right PO.

Only when nothing matches do you take **No PO number — create ad hoc receipt**,
and see **Ad hoc receipts** below.

### 3. Optional: scan the packing slip

**You don't need this.** Steps 1, 2, and 4 onward are the whole job, and they
need nothing but the screen in front of you. **If you're new to receiving, work
this way until it's second nature** — scanning hides steps rather than removing
them, and a bad scan is only catchable by someone who knows what a good session
looks like.

Reach for the document scan when the work is genuinely tedious or the order is
hard to find:

- **Long lists.** Typing thirty ISBNs by hand is where errors come from.
- **No usable PO reference on the slip.** ISBN matching can still find the order
  when a manual search can't.
- **Ad hoc receipts.** With no PO to work from, every line otherwise gets typed
  from scratch — this is the case scanning helps most.
- **One slip covering several POs.** Scanning routes them into a shared session.

Scanning needs a phone with a document-scan feature (Notes or Files — a plain
camera photo won't do). Falling back is always fine: hide the scanner and search
for the PO instead.

Scanning inserts four screens before the wizard.

**Capture the slip.** Tap **📷 Scan packing slip**, then **Add page 1**.
Multi-page slips (RDH slips are routinely two pages) get one photo per page — add
each separately, then tap **Process**. Lay the slip flat, phone directly above in
portrait, all four edges in frame, no glare across the text.

**Check what it read, before going further.** Check every ISBN, title, and
quantity against the slip. Lines flagged for review are the system saying it
isn't sure. Correct them here. A misread ISBN that gets through becomes a much
bigger problem downstream than a few seconds spent now.

**Confirm where it's going.** The system proposes an order, matched either by a
PO reference on the slip or by comparing ISBNs against open orders. Confirm it,
or override it — never accept a match you don't believe. Several POs on one slip
routes into a shared session dashboard; no match at all sends you to ad hoc.

**Reconcile slip against order.** A side-by-side review. **Matched** lines are on
both — check the delta badge. **On slip only** (amber) arrived but isn't on this
PO: a possible mis-ship, or a title to add. **On PO only** (gray) is still
outstanding and not arriving today.

Confirm, and you land in the same wizard the manual path goes to. Continue below.

### 4. Count the books and enter quantities

**Every line starts at 0, on every path.** Scanning identifies the order and
builds the line list — it does not fill in counts. Nothing is received until you
put a number on it. This is deliberate: when lines were pre-filled with the full
outstanding quantity, a title that never shipped got received in full because
nobody corrected it down.

So you must do one of these, on purpose:

- **Receive all** — fills every line to its full outstanding quantity. Use it
  only when the shipment is genuinely complete, and check it afterwards.
  **Clear all** puts everything back to 0.
- **Enter lines selectively** — type the count on each line you actually counted.
  Lines left at 0 are treated as not received, not as an error.
- **📷 Scan slip** — a separate scan *inside* the wizard, which does fill
  quantities. Filled lines are badged **From scan**; lines the slip doesn't
  mention stay at 0 and are badged **Not on slip**.

A slip scan fills in what the slip *claims*, not what you counted. Check the
filled numbers against the box before submitting, and pay particular attention to
**Not on slip** lines — that badge means the paperwork and the carton disagree.

**Qty received means undamaged copies only.** That is the number that goes to
Shopify.

### 5. Record damage

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

### 6. Act on the two in-line warnings

Neither blocks receiving, but both need action:

- **Price mismatch** — Shopify's price differs from the publisher's list price.
  Fix the product in Shopify **before the book goes on the shelf**.
- **Units committed to unfulfilled orders** — copies are already here and
  customers are waiting. Check whether they should have shipped already.

### 7. Mark anything that didn't ship

If the slip or the publisher says a title is **Backordered**, **Out of stock**, or
**Out of print**, mark it on the line. The first two keep the line open; out of
print closes it. This can also be done later from the PO detail panel.

### 8. Review and confirm

Check the confirm summary — especially the damaged lines and the unit count in
the button. Then confirm. Don't close the page while it's applying.

If the PO is flagged **Test**, Shopify will not be updated. That's expected on a
test PO and not a failure.

### 9. Save the record and report

- **Download the receipt PDF** from the result screen. That is the record.
- Post in `#receiving-issues` using the pinned template.

Report even when everything went fine. The post is how anyone else knows the
carton was handled.

---

## Ad hoc receipts

You're here because step 2 found no PO. The system builds one from what's in the
carton, then hands you to the same wizard at step 4. Two screens have no
equivalent in the normal flow, and one control can quietly lose a book.

### Identify the publisher

Search by publisher or distributor name.

This is the choice worth slowing down for. The ad hoc PO is created against that
publisher's **primary active account**, and that account is where the cost and
the receiving history land. Check the carton and the slip letterhead before
picking — don't guess from the titles.

The slip reference, if a scan found one, is stored on the PO. That is how you'll
find this receipt again later, so don't clear it.

### Enter the lines

One row per ISBN with a quantity. Unit cost and the slip title are optional, but
enter the cost when the slip shows it — the ad hoc PO carries whatever you put
here, and nothing downstream will supply it later.

Each ISBN resolves to one of three states:

| Badge | Meaning | What to do |
|---|---|---|
| **✓ In catalog** | Matched an existing product | Nothing — just check the quantity. |
| **✓ New product** | Created during this session | Watch the summary for **⚠ Follow up in Shopify**. A product can be created with fields missing, and finishing it is yours. |
| **Not found** (amber) | No product for that ISBN | Decide: **+ Create new product**, or **Skip this line**. |

You can't reach the summary while any line is still unresolved, so every amber
line has to be dealt with one way or the other.

### What "Skip this line" actually does

**A skipped line is never created on the PO.** It isn't flagged, queued, or
recorded — it drops out of the session and nothing downstream knows the book was
ever there. The summary mentions it only as a small gray "1 line skipped", which
is easy to scroll past.

So:

- **Skip only when the book is not physically in the carton** — a slip line that
  didn't ship, or something that isn't ours.
- **If the book is in the box, create the product.** Skipping it puts stock on
  the shelf that the system has never heard of, and nothing will ever surface it.

Say in your `#receiving-issues` post what you skipped and why.

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
| The PO you picked is already fully received | Stop. You have the wrong order, or the carton was received already — check before doing anything else. |
| Scan won't read the slip | Rescan using document-scan mode. Still failing — switch to manual: hide the scanner and search for the PO. |
| Scan finds no matching PO | Search manually before accepting ad hoc. The two matchers look at different things and a manual search can find what ISBN matching missed. |
| No PO number anywhere on the slip | Search by supplier and by anything on the carton first. Only then ad hoc. |
| **"No supplier account available — cannot create PO"** | The publisher has no active account. Don't work around it by picking a different publisher — that files the books against the wrong account. Stop and report it. |
| You skipped a line that *is* in the carton | Go back and create the product before confirming. If the PO is already created, report it — those books are on the shelf and invisible to the system. |
| A book isn't found in search | Catalog gap — go to **Catalog coverage**, register it by ISBN, then come back. |
| Confirmation screen names the wrong order | Override it. |
| Counted quantity disagrees with the slip | Enter what you counted, put the discrepancy in **Notes**, and report it. |
| Same PO shows several attempts | Normal. Open the row on the Receiving screen to see each attempt and what it did. |

## What to report

Post in `#receiving-issues` with:

- PO number and supplier
- What you received (units) and anything outstanding
- Anything you overrode, corrected, or weren't sure about
- Any ad hoc receipt you created, what you searched before creating it, and any
  line you skipped
- Any new product you created with fields still to finish in Shopify
- Any failed or retried receipt, with a screenshot

---

## Related guides

- **Receiving** — statuses, the four stat cards, the failed-receipt block
- **Receiving — Intake** — scanning, matching, ad hoc, supply status
- **Receiving — Counting Books In** — the wizard, damage fields, worked example
