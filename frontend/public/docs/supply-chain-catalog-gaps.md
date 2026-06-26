# Catalog Gaps

This tool answers one specific, frustrating question: **"Why can't I find this book in the PO builder?"**

Sometimes a title exists in Shopify but hasn't made it into the supply-chain catalog yet, so it won't show up when you're building a purchase order. This page lets you find and fix those gaps yourself, without needing developer help.

It has three sections.

---

## 1. Catalog sync

The catalog is kept in step with Shopify by a sync that runs every night. This panel shows when it last ran and what it did — how many new products it registered, and whether it found any vendor codes it didn't recognize.

If you can't wait for tonight's run, there's a **Run sync now** button that triggers it on the spot. Use this when you've just added titles in Shopify and need them available for ordering right away.

---

## 2. Register by ISBN

This is the fastest fix for a single missing book. Type in the ISBN and the tool checks Shopify directly. If the book is there, it registers it into the catalog immediately, and it becomes available in the PO builder.

Use this when you know exactly which title is missing and just need it available now.

---

## 3. Unrecognized vendors

This lists vendor codes that appear on products in Shopify but don't map to any supplier in the system. Each one is a small gap: books carrying that code don't have a known supplier behind them.

When you see a code here, the fix is usually over in **Suppliers** — either add the missing supplier, or attach the code to the right existing one. Once the code is mapped, those books resolve properly.

---

## Which section do I use?

- **One specific book missing?** → Register by ISBN.
- **Just added a batch of titles in Shopify?** → Run sync now.
- **Seeing a code with no supplier behind it?** → Note it here, fix it in Suppliers.

---

## Do's & Don'ts

**Do**
- Use **Register by ISBN** for a quick one-off fix.
- Use **Run sync now** after bulk-adding products in Shopify.
- Follow up on **unrecognized vendors** by mapping them in Suppliers.

**Don't**
- Don't assume a missing book is an error — it usually just hasn't synced yet.
- Don't leave unrecognized codes unaddressed; they mean books without a known supplier.

---

## Quick reference

- **Sync** — the process that keeps the catalog matched to Shopify; runs nightly, or on demand here.
- **Register by ISBN** — pull one specific book into the catalog right now.
- **Unrecognized vendor** — a code on Shopify products that isn't mapped to any supplier yet.
