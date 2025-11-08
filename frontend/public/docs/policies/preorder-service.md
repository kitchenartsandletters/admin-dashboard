# 🚀 Preorder Service

The **Preorder Service** is responsible for identifying, tracking, and managing the lifecycle of **pre-publication books** (preorders) within Shopify, triggered by webhook events and publication metadata.

It is closely linked to:
- `webhook-gateway`: source of truth for Shopify change events
- `NYT Weekly Reporting Tool`: downstream consumer of approved preorder data
- `Admin Dashboard`: UI surface for tracking approval status, tagging anomalies, and reporting readiness

---

## 📦 Input Data

### ✅ Webhooks Ingested
- `products/update`
- `variants/update`
- `inventory_levels/update`
- (Optional: `orders/create` for live presale tagging)

### ✅ Shopify Data Fields Used
| Field/Source        | Purpose                        |
|---------------------|--------------------------------|
| `Tag: MM-DD-YYYY`   | Raw pub date marker            |
| `Metafield: YYYY-MM-DD` | Canonical pub date             |
| `Tag: preorder`     | Used to flag as preorder       |
| `Inventory level`   | Used to calculate early arrivals|
| `Published Scope`   | Used to determine visibility   |

---

## 🔄 Lifecycle Logic

### Preorder Status Triggers

| Condition                              | Action                           |
|----------------------------------------|----------------------------------|
| Tagged `preorder` + future pub date    | Add to tracked list              |
| Inventory > 0 before pub date          | Flag as “Early Stock Arrival”    |
| On or after pub date                   | Remove from Preorder Collection  |
| Orders created before pub date         | Count as presale                 |

---

## 📤 Output & Integration

### ✅ Slack Alerts
- Early arrival notifications
- Missing/malformed pub date tags
- NYT approval reminders (future)

### ✅ GitHub/CSV Outputs
- Append to `approved_releases.csv`
- Optional: `early_arrivals.csv`

### ✅ Supabase Tables (planned)
| Table                  | Fields |
|------------------------|--------|
| `preorder_tracking`    | `isbn`, `product_id`, `pub_date`, `presold_qty`, `inventory`, `early_arrival` |
| `preorder_approvals`   | Manual checkboxes and notes from Admin Dashboard |

---

## 🔧 Admin Dashboard UI

| Component            | Functionality                    |
|----------------------|----------------------------------|
| Preorder Approval Tab | View all tracked preorders      |
| CSV Export Button     | Download report for NYT/tooling |
| Early Arrival Section | Highlight active edge cases     |

---

## 🛠️ TODO / Future

- [ ] Migrate tracking from CSV to Supabase
- [ ] Enable webhook-gateway validation of malformed pub dates
- [ ] Sync with Backorder Service for product overlaps
- [ ] Add user-facing publication status (e.g., countdown, badges)