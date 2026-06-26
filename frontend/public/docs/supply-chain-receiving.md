# Receiving

This is your home base for bringing books into inventory. It shows what's arrived, what's still expected, and anything that needs attention.

Receiving is organized around purchase orders. A PO is the unit of work; each time you receive against it is an "attempt." One order might take a few attempts to complete if it arrives in more than one shipment.

---

## The numbers at the top

Four cards summarize the current picture:

- **Orders received** — how many orders have been fully received.
- **Units received** — the total number of books brought in (counts both fully and partially received orders).
- **Failed** — receipts that ran into a problem and need attention. When this is above zero it turns red — these are worth looking at first.
- **Pending** — orders that are expected but haven't been received yet.

---

## Reading the status

Each order shows a status badge. Important detail: the badge reflects the **order's** overall state, not the state of a single receiving attempt.

So a PO that's been partially received always shows **Partial** — even if the most recent attempt itself succeeded. The order isn't "Received" until everything has come in. If you expand an order, you'll see the individual attempts (each marked applied, test run, failed, and so on) underneath.

This is deliberate: the top-level badge answers "where does this order stand?" and the expanded rows answer "what happened on each try?"

---

## Starting to receive

Click the button to begin a new receiving session. That takes you to the intake flow, where you'll either scan or look up a packing slip and match it to the right order. See the **Receiving — Intake** guide for the full walkthrough.

---

## What to do about a "Failed" receipt

A failed receipt means an attempt didn't fully apply — often a single book that couldn't be updated. Open the order, expand the attempts, and look at the failed line. In most cases you can simply receive against the order again to finish the job. If it keeps failing, flag it.

---

## Quick reference

- **PO (purchase order)** — the order you're receiving against; the unit of work here.
- **Receipt / attempt** — one act of receiving against a PO. An order can have several.
- **Partial** — some of the order has arrived; more is still expected.
- **Failed** — an attempt hit a problem and needs a second look.
- **Pending** — expected but not yet received.
