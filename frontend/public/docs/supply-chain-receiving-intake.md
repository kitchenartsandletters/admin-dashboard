# Receiving — Intake

This is the start of every receiving session. Its job is to figure out *which order* the box in front of you belongs to, and then hand you off to the receiving wizard to count the books in.

There are two ways through: let the system match a packing slip for you, or pick the order yourself.

---

## Step 1: The packing slip

You'll land on "Upload Packing Slip." From here you can either scan the slip or look the order up by hand.

### Scanning the slip
When you upload a slip image, the system tries to match it to an order in two ways, in order:

1. **By reference** — it reads the slip's text looking for a PO number or reference. A confident single match takes you straight to reconciliation.
2. **By ISBN** — if the text didn't pin it down, it compares the ISBNs on the slip against open orders. A strong match (most of the books line up) goes to reconciliation. Several possible matches gives you a ranked list to choose from. No match sends you to the ad hoc path (see below).

### Looking it up by hand
Prefer to choose yourself? Use the dropdown to filter the receivable orders and pick the right one directly.

---

## Reconciliation: slip vs. order

When a slip is matched to an order, you'll see them side by side — the slip's lines next to the order's lines. Review that they agree, adjust quantities if something's off, and confirm. That carries you into the receiving wizard.

This side-by-side check is your chance to catch a mismatch *before* counting anything in.

---

## When there's no matching order (ad hoc)

Sometimes a shipment arrives with no PO — a direct delivery, a surprise reorder, something that was never entered. That's an **ad hoc** receipt, and the flow handles it:

1. **Identify the supplier** — tell the system who it's from.
2. **Enter the lines** — add each title and quantity from the slip.
3. **Review the summary** — check it over. On confirm, a purchase order is created for you from what you entered, and you're taken into the wizard to receive against it.

So even with no paperwork in the system, you end up with a proper order on record.

---

## New titles you've never carried

If a book on the slip isn't in the catalog yet, you can create it on the spot through the new-product step. It pre-fills what it can read from the slip (ISBN, title, cost, supplier) and you fill in the rest. Once created, it's added to the session like any other line.

---

## Do's & Don'ts

**Do**
- Use the side-by-side reconciliation to catch quantity mismatches early.
- Reach for the ad hoc path when a box shows up without a PO — don't force it onto an unrelated order.
- Create a new title right here if the slip has something you've never carried.

**Don't**
- Don't guess at a match. If the scan is unsure and gives you a list, pick deliberately or look it up by hand.
- Don't abandon a box with no PO — ad hoc receiving exists exactly for that case.

---

## Quick reference

- **Packing slip** — the document in the box listing what shipped.
- **Reconciliation** — the side-by-side check of slip against order before receiving.
- **Ad hoc receipt** — receiving something with no existing PO; the system creates one for you.
- **ISBN match** — matching a slip to an order by comparing the books on it.
