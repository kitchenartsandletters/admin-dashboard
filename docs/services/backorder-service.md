# 📦 Backorder Service

The **Backorder Service** monitors inventory fluctuations and customer interest for **temporarily out-of-stock books** that are still in print and expected to restock.

It integrates with:
- `webhook-gateway`: receives Shopify webhooks, logs them to `webhook_logs`, and forwards relevant topics to Backorder Service
- `Request Service`: Supabase-based logging of Notify Me requests
- `Admin Dashboard`: Visibility into customer interest and restock triggers
- `public.external_deliveries`: Logs outbound delivery attempts (future phase)

---

## 📦 Input Data

### ✅ Webhooks Ingested via Gateway (via public.webhook_logs + external forwarding)

- `inventory_levels/update`
- `products/update`
- `variants/update`

### ✅ Shopify Data Fields Used

| Field/Source                        | Purpose                                  |
|-------------------------------------|------------------------------------------|
| `Track quantity`                    | Required to determine stock status       |
| `Inventory level`                   | Drives in/out of backorder state         |
| `Continue selling when out of stock`| Governs backorderability vs OOS          |
| `Tag: out-of-print` (optional)      | Exclusion logic for OOP books            |

---

## 🔄 Lifecycle Logic

| Condition                                 | Action                                    |
|-------------------------------------------|-------------------------------------------|
| Inventory ≤ 0 and continue selling = ON   | Mark as backorderable                     |
| Inventory ≤ 0 and continue selling = OFF  | Mark as out of stock                      |
| Inventory restocked > 0                   | Notify customers, close requests          |
| Notify form submission                    | Log to Supabase with `product_id` (Shopify numeric product ID)         |
| All state changes are traceable via `webhook_logs.id` and will be stored in internal backorder tables. |                                           |

Webhook delivery metadata and payloads are tracked via `public.webhook_logs`.

---

## 🧾 Notify Me Logic

| Phase         | Behavior                                                     |
|---------------|--------------------------------------------------------------|
| Product OOS   | Form appears (unless blacklisted via Admin Dashboard)        |
| Submission    | Saved to `request_service.requests` Supabase table           |
| Admin review  | Managed via Dashboard: view by product/status/priority       |
| Restock       | Manual notifications sent by staff (auto-send = future dev)  |
| Closeout      | Request marked `status: closed` or logged as resolved        |

> ⚠️ Webhook-triggered inventory updates may automatically initiate notification flows in future phases.

---

## 🧠 Admin Dashboard UI

| Component             | Functionality                                |
|------------------------|----------------------------------------------|
| Request Service        | Review and filter request backlog            |
| Blacklist Toggle       | Prevent Notify form display on select titles |
| Slack Notification Log | (Planned) Alert staff when restock occurs    |

---

## 📤 Outbound Delivery Logs

All restock-triggered deliveries (manual or automated) are tracked via:

- `public.external_deliveries` (active table)
- Referenced by `webhook_logs.id` where applicable
- Response metadata (e.g. status, timestamp, retry count) stored alongside delivery record

---

## 🛠️ TODO / Future

- [ ] Slack alerts when restock triggers active requests
- [ ] Supabase webhook on `request.status = open` to detect stale entries
- [ ] Bulk CSV upload for historical request import
- [ ] Integration with Preorder Service for dual-status SKUs
- [ ] Full outbound logging to `external_deliveries` with response tracking
- [ ] Harden Notify Me eligibility logic with composite inventory conditions
- [ ] Leverage `webhook_logs.id` as primary trace ID across all subsystems