# 🛒 Shopify Business Policies: Preorder & Backorder

This document defines how preorder and backorder states are represented, enforced, and tracked in Shopify, including business logic, cart behavior, reporting pipelines, and lifecycle triggers.

It is intended to guide the continued development of:
- ✅ **Preorder Service** (Webhook-Gateway connected)
- ✅ **Backorder Service** (Webhook-Gateway connected)
- 🔜 **NYT Weekly Reporting Tool** (modular integration with Preorder Service)

---

## 📘 Preorder Book

### ✅ Definition
A preorder is a book available for sale **before its official publication date** (aka on-sale date). Customers can reserve copies in advance; fulfillment occurs when inventory becomes available, often before or during the official pub week.

---

### 🔧 Shopify Implementation

#### Product Visibility
- Product is **published** to **Online Store** and always to **POS**.
- Tagged with `preorder`.
- Added to the **Preorder** collection.
- Removed from Preorder collection **after** its **publication date**.

#### Publication Date
- Stored as:
  - Tag: `MM-DD-YYYY`
  - Metafield: `YYYY-MM-DD` (used in logic and dashboards)

#### Inventory Settings
- `Track quantity`: ✅ Enabled
- `Inventory`: Set to `0`
- `Continue selling when out of stock`: ✅ ON

#### Cart Behavior
- `custom.js` (or equivalent) intercepts Add to Cart:
  - Adds `line item property`:  
    ```json
    {
      "preorder": true,
      "backorder": false
    }
    ```

#### Lifecycle Automation
- `preorder` tag is **never removed** (used for historical tracking).
- Product is **removed from the Preorder collection** automatically (via Liquid or webhook) on or after its pub date.

#### Current Reporting
- Preorders tracked via:
  - Shopify **tags**
  - Shopify **metafields**
  - GitHub workflows (e.g. `NYT_weekly_and_preorder_release`)
- **New system** will use a webhook-fed **Preorder Service** powered by `webhook-gateway`.

---

## 📙 Backorder Book

### ✅ Definition
A backorder book is a **post-release** title that is **temporarily out of stock** but still **in print and expected to restock**. Customers may be allowed to order or request notification.

---

### 🔧 Shopify Implementation

#### Inventory Settings
- `Track quantity`: ✅ Enabled
- `Inventory`: ≤ `0`
- `Continue selling when out of stock`: ✅ Must be ON for a book to be **considered backorderable**
  - If OFF, the book is either **Out of Stock** or **Out of Print** (OOP).

#### Cart Behavior
- If `Continue selling when out of stock` is OFF, default Shopify prevents checkout.
- If ON, cart is allowed and product is treated as **backordered**.

#### Notify Me Flow
- Custom Notify Me form is rendered:
  - Injected via snippet or `custom.js`
  - Uses `product.id` or `variant.id` to track interest in Supabase
- The flow can be **blacklisted** by Admins via the **Request Service dashboard**.

#### Restock Ops
- Upon restock:
  - Notify Me form disappears (via Liquid or JavaScript).
  - Admin manually sends notifications to customers.
- ⚠️ Automated notifications via Request Service are a **planned future enhancement**.

---

## 🔗 System Integration Plan

| Component               | Role                                                   |
|------------------------|--------------------------------------------------------|
| `Preorder Service`     | Webhook-triggered lifecycle management of preorder SKUs. |
| `Backorder Service`    | Tracks interest, stock restoration, and notification queueing. |
| `webhook-gateway`      | Ingests product updates (tags, inventory, pub date changes) for both services. |
| `NYT Weekly Tool`      | Tracks weekly presales, links with `Preorder Service` for pub week matching. |

> The `NYT Weekly Reporting Tool` will be **standalone**, with optional linkage to Preorder Service to produce comprehensive CSV snapshots for internal and publisher-facing reporting.

---

## 📌 Notes for Developers

- Preorder lifecycle is **driven by publication date**, not stock status.
- Backorder lifecycle is **driven by inventory + restock expectation**, not tags.
- Notify form logic must be tightly scoped to:
  - **In-stock status**
  - **Blacklist inclusion**
  - **Restock confirmation**
- Both services will include **Slack alert integrations**, **Supabase data logging**, and **Admin Dashboard visibility**.