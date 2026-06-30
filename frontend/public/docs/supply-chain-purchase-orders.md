# Purchase Orders

This is where you create and track orders to publishers and distributors. A purchase order (PO) is the record of what you ordered, from whom, and how much of it has arrived.

Think of this page as the master list of every order in flight. You don't receive books here — you create orders and watch their progress. The actual receiving happens in the Receiving section.

---

## The status tabs

Across the top you'll see tabs that filter the list. The number next to each is a live count.

- **All** — every order that isn't archived.
- **Open** — anything still in progress (not yet fully received and not cancelled). This is your day-to-day working view.
- **Draft** — started but not yet submitted to the supplier. Drafts can still be edited or deleted.
- **Submitted** — sent to the supplier, nothing received yet.
- **Partial** — some books have arrived, but not the full order.
- **Received** — the whole order has arrived. Done.
- **Cancelled** — orders that were called off.
- **Test** — practice orders. These don't affect real inventory. Safe to create while learning.

Your tab choice is remembered. If you leave on "Open," it'll still be on "Open" next time you come back.

---

## Finding an order

Use the search box to filter by PO number, supplier, the informal reference, or anything in the notes. It searches as you type.

---

## Creating an order

You have two ways to start a new PO, both in the top-right:

### + New PO
Opens the PO builder, where you add a supplier, then search for titles by ISBN or name and set quantities. Use this for orders you're placing by hand.

### ↑ Import from CSV
Opens the CSV importer. Use this when you already have an order in a spreadsheet — most often a Stocky export. The importer reads the file, matches each line to a book by ISBN, lets you review and adjust, then creates the whole PO at once. See the import walkthrough below.

---

## Opening an order

Click any row to open its detail panel on the right. There you'll see every line, how much has been received, and the order's history.

When an order is ready to receive against, the detail panel has a **Receive** action that takes you straight into the receiving wizard for that PO.

### Marking a supply issue on a line

If a publisher tells you a title is delayed or unavailable — by email, by phone, or on a slip — you can record it right here without starting a receiving session. On any line that hasn't fully arrived, use the **"supply issue?"** link to mark it **Backordered**, **Out of stock**, or **Out of print**, with an optional note. Backordered and out-of-stock lines stay open and keep waiting for stock; out-of-print closes the line. Tap an existing marker to change or clear it later. See the **Receiving — Intake** guide for the full explanation.

---

## Importing from a CSV (Stocky and others)

The importer walks through four steps:

1. **Upload** — drop in or select your CSV file.
2. **Preview** — every line is shown with its ISBN match status and an editable quantity. Lines that matched a known book are ready; lines that didn't are flagged so you can decide what to do.
3. **Confirm** — choose the supplier account, the location, and the order date, and add a reference if you like. Order date defaults to today; adjust it if the order was placed earlier.
4. **Creating** — the PO and all its lines are written. You'll land on the new order when it's done.

A few things worth knowing about Stocky exports specifically:

- The **Barcode** column is used as the ISBN — that's the key we match on.
- **Qty Ordered** becomes the quantity (note: that's "Qty Ordered," not "Qty (packs) Ordered").
- The **Purchase Order** column auto-fills the reference field.
- Any rows already marked "received" in the export come in pre-marked as received here too.

---

## Cleaning up test orders

If you've been practicing, switch to the **Test** tab and you'll see an **Archive Test POs** button. It hides all your test orders from every view in one go. This keeps your real order list clean once you're past the learning stage.

---

## Do's & Don'ts

**Do**
- Use **Test** orders freely while you're getting comfortable — they don't touch real inventory.
- Add an informal reference or a note so orders are easy to find later.
- Check the Preview step carefully on a CSV import before confirming.
- Mark a supply issue on a line as soon as a publisher tells you about a delay — it keeps the order honest about what's still coming.

**Don't**
- Don't worry about deleting a draft you started by mistake — drafts can be deleted cleanly from the list.
- Don't try to record received books here. That's what Receiving is for.

---

## Quick reference

- **PO** — a purchase order; the record of one order to one supplier.
- **Draft** — not yet submitted; still editable.
- **Partial** — some but not all of the order has arrived.
- **Informal reference** — a free-text label you can attach to a PO to make it easy to recognize.
- **Supply issue** — a marker on a line that didn't ship: backordered, out of stock, or out of print.
- **Test PO** — a practice order with no effect on real inventory.
