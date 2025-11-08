# 📦 Backorder Service

The **Backorder Service** monitors inventory fluctuations and customer interest for **temporarily out-of-stock books** that are still in print and expected to restock.

It integrates with:
- `webhook-gateway`: Shopify data ingestion
- `Request Service`: Supabase-based logging of Notify Me requests
- `Admin Dashboard`: Visibility into customer interest and restock triggers

---

## 📦 Input Data

### ✅ Webhooks Ingested
- `inventory_levels/update`
- `products/update`
- `variants/update`

### ✅ Shopify Data Fields Used
| Field/Source                       | Purpose                            |
|------------------------------------|------------------------------------|
| `Track quantity`                   | Required to determine stock status |
| `Inventory level`                  | Drives in/out of backorder state   |
| `Continue selling when out of stock` | Used to permit/disallow backorder |
| `Tag: out-of-print` (optional)     | Exclusion logic for OOP books      |

---

## 🔄 Lifecycle Logic

| Condition                                | Action                               |
|------------------------------------------|--------------------------------------|
| Inventory ≤ 0 and continue selling = ON  | Mark as backorderable                |
| Inventory ≤ 0 and continue selling = OFF | Mark as out of stock                 |
| Inventory restocked > 0                  | Notify customers, close requests     |
| Notify form submission                   | Log to Supabase with `product_id`    |

---

## 🧾 Notify Me Logic

| Phase         | Behavior                                  |
|---------------|-------------------------------------------|
| Product OOS   | Form appears (unless blacklisted)         |
| Submission    | Sent to `request_service.requests` table  |
| Admin review  | View and manage via Admin Dashboard       |
| Restock       | Manual notifications (automated = future) |
| Closeout      | Mark request `status: closed`             |

> ⚠️ Future automation via webhook will allow real-time restock detection + customer contact.

---

## 🧠 Admin Dashboard UI

| Component        | Functionality                           |
|------------------|-----------------------------------------|
| Request Service  | View requests by product, status        |
| Blacklist Toggle | Prevent Notify form from appearing      |
| Slack Notification Log | Coming soon                        |

---

## 🛠️ TODO / Future

- [ ] Slack alerts when restock triggers active requests
- [ ] Supabase webhook on `request.status = open` to detect stale entries
- [ ] Bulk CSV upload for historical request import
- [ ] Integration with Preorder Service for dual-status SKUs