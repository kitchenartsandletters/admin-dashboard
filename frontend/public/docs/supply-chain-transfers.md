# Transfers

This is where you move inventory between locations — most often sending books from HQ to the FiDi / 111 Broadway shop, especially around a seasonal opening.

A transfer has two halves: someone **dispatches** it from the source location, and someone at the destination **receives** it. In between, the books are "in transit."

---

## The status of a transfer

- **Pending** — created but not yet on its way.
- **In Transit** — dispatched and traveling. Decremented from the source, not yet added at the destination.
- **Received** — arrived and counted in at the destination. Done.
- **Partial** — some of the transfer was received, but not all.
- **Cancelled** — called off.

---

## The most important thing to understand

**When you dispatch a transfer, the books immediately leave the source location's count — but they don't appear at the destination until it's received.**

So for the whole time a transfer is "in transit," those copies show at **neither** location. That's expected, not a bug. The books are on the truck, so to speak. They reappear at the destination the moment FiDi receives them.

The dispatch screen warns you about this clearly before you confirm, because it can be surprising the first time.

---

## Dispatching a transfer

1. **Choose locations** — pick where it's coming **From** and going **To**. If you accidentally pick the same place for both, the form sorts it out for you rather than letting you send books to themselves.
2. **Add the books** — search by ISBN or title and set a quantity for each line.
3. **Review** — you'll see a summary with the in-transit warning. This is your last check.
4. **Confirm** — the transfer is created and enters **In Transit**. The source count drops right away.

---

## Receiving a transfer

When books arrive at the destination, open the transfer and use **Receive**. Open transfers that are in transit show a "Receive →" action. Receiving adds the books to the destination's count and moves the transfer to Received (or Partial, if not everything turned up).

---

## Practicing safely: test mode

Test mode lets you rehearse the whole dispatch-and-receive flow end to end **without touching real inventory**. Nothing is decremented, nothing moves in Shopify — the statuses just advance so you can see how it works. Use this to get comfortable before doing a real seasonal move.

---

## Do's & Don'ts

**Do**
- Expect in-transit books to show at neither location — that's normal until received.
- Use **test mode** to rehearse before a real seasonal transfer.
- Receive promptly at the destination so the books reappear in the count.

**Don't**
- Don't panic when a dispatched transfer makes stock "disappear" from the source — it's in transit and comes back on receipt.
- Don't forget the second half. A transfer isn't done until the destination receives it.

---

## Quick reference

- **Dispatch** — sending a transfer from the source location; decrements the source immediately.
- **In transit** — dispatched but not yet received; books show at neither location.
- **Receive** — counting the transfer in at the destination; this is what makes the books reappear.
- **Partial** — some of the transfer was received, not all.
- **Test mode** — rehearse the flow with zero inventory impact.
