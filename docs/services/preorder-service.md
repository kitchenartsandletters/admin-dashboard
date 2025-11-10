# 🚀 Preorder Service

The **Preorder Service** is responsible for identifying, tracking, and managing the lifecycle of **pre-publication books** (preorders) within Shopify. It consumes validated webhook events from the `webhook-gateway`, enriches product/order data as needed, and maintains the canonical product-level preorder tracking set used for reporting (including the NYT reporting pipeline).

It is closely linked to:
- `webhook-gateway`: source of truth for Shopify change events (inserts into `public.webhook_logs`)
- `NYT Weekly Reporting Tool`: downstream consumer of approved preorder data (reads from `preorder` schema/views)
- `Admin Dashboard`: UI surface for product-level approval, lifecycle visibility, and report preparation

> Important: The Preorder Service is **product-level** focused. It tracks the master list of preorder titles (current + historical) and their lifecycle slices (due this week, next week, released previous weeks, season, etc.). Order-level tracking of preorders is supported for presale counts, but the authoritative unit for release/approval is the product (product_id / variant_id).

---

## 📦 Input Data

### ✅ Webhooks Ingested via Gateway
- `products/update`
- `variants/update`
- `inventory_levels/update`
- (Optional) `orders/create` for presale counting and enrichment

Webhook payloads are logged by the gateway in `public.webhook_logs`. Preorder Service should always reference `webhook_logs.id` (or `X-Gateway-Event-ID` on forwarded requests) for traceability when enriching or acting on an event.

### ✅ Shopify Data Fields Used

| Field/Source             | Purpose                                                                 |
|--------------------------|-------------------------------------------------------------------------|
| `Tag: MM-DD-YYYY`        | Raw pub date marker used as a human-friendly tag                        |
| `Metafield: YYYY-MM-DD`  | Canonical pub date (machine-usable; primary source of truth for logic) |
| `Tag: preorder`          | Product-level flag indicating the product belongs to the Preorder set   |
| `Inventory level`        | Detect early stock arrivals (inventory > 0 while product still marked preorder)
| `Published Scope`        | Visibility to determine which sales channels the product is on          |

---

## 🔄 Lifecycle Logic

### Preorder Status Triggers

| Condition                                        | Action / Result                                                                 |
|--------------------------------------------------|----------------------------------------------------------------------------------|
| Tagged `preorder` + future `pub_date`            | Add or maintain product in `preorder.tracking` (product-level truth set)        |
| Inventory > 0 before `pub_date`                  | Flag as **Early Stock Arrival** (visible in Admin UI for ops decisioning)       |
| On or after `pub_date`                            | **Remove product from the `Preorder` collection** (but **do not remove** the `preorder` tag — retained for historical slicing)
| Orders created before `pub_date`                 | Count as presales; increment `presold_qty` in `preorder.tracking`              |

**Note:** the `preorder` tag is treated as a persistent historical marker and **is not removed** by lifecycle automation. The collection membership is the operational toggled set (removed on/after pub date), while the tag remains for reporting slices.

---

## 🔒 Robust Preorder Detection (Signal Fusion)

Relying solely on `line_item.properties.preorder = true` is **not airtight** (frontend scripts may be bypassed or fail). The Preorder Service MUST implement *composite detection* when classifying an order/line item as a preorder.

### Composite detection (recommended rule)
Consider a line item a preorder if **at least two** of the following signals are true at the time of processing:

1. `line_item.properties.preorder === true` (frontend-injected property)
2. The product (product_id) is currently tagged `preorder`
3. The product has a `pub_date` metafield that is **in the future** relative to the order `created_at`

This reduces false negatives/positives without relying on any single fragile signal.

### Implementation notes
- Enrich `orders.create` processing by looking up product metadata (metafields/tags) via Supabase cache or Shopify GraphQL if needed.
- When an `orders/create` event is identified as containing preorder line items, update `preorder.tracking.presold_qty` and add a presale snapshot to `preorder.presale_snapshots` (optional) referencing `webhook_logs.id`.

---

## 📤 Output & Integration

### ✅ Primary Outputs
- `preorder.tracking` (product-level canonical table) — see schema below
- `preorder.approvals` (approval records used by Admin UI to gate inclusion in NYT exports)
- Presale CSVs or Supabase views consumed by `NYT Weekly Reporting Tool` (NYT reads, Preorder Service writes / exposes approved views)

### ✅ Observability & Traceability
- Every action taken by Preorder Service should reference the originating `webhook_logs.id` (or `X-Gateway-Event-ID`) in any derived row for traceability.
- Forwarded outbound deliveries (e.g., CSV push, webhook forwards) may be recorded in `public.external_deliveries` (already provisioned) and should include the `webhook_logs.id` where applicable.

---

## 🧾 Supabase Schema (Suggested Stubs)

> These are suggested initial DDL stubs for the `preorder` schema. Adjust column types and indexes for your environment and conventions.

### `preorder.tracking` (product-level master list)

- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `product_id` BIGINT NOT NULL
- `variant_id` BIGINT NULL
- `barcode` TEXT NULL
- `title` TEXT
- `vendor` TEXT
- `pub_date` DATE NULL
- `pub_date_tag` TEXT NULL -- raw MM-DD-YYYY tag if present
- `preorder_tagged_at` TIMESTAMP WITH TIME ZONE NULL -- when tag first seen
- `added_to_tracking_at` TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
- `is_active` BOOLEAN DEFAULT true -- active in the Preorder collection
- `is_approved` BOOLEAN DEFAULT false -- approved for NYT/export
- `approval_timestamp` TIMESTAMP WITH TIME ZONE NULL
- `presold_qty` INTEGER DEFAULT 0
- `inventory_snapshot` JSONB NULL -- last known inventory snapshot
- `source` TEXT NULL -- manual | script | webhook
- `last_seen_webhook_id` UUID NULL -- FK to public.webhook_logs.id for traceability
- `created_at` TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
- `updated_at` TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())

Indexes: `product_id` unique index, index on `pub_date`, index on `is_approved`.

### `preorder.approvals`

- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `product_id` BIGINT NOT NULL REFERENCES preorder.tracking(product_id)
- `approved_by` TEXT NULL
- `approval_note` TEXT NULL
- `approved_at` TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
- `webhook_log_id` UUID NULL -- for traceability

### (Optional) `preorder.presale_snapshots`

- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `product_id` BIGINT NOT NULL
- `snapshot_ts` TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
- `presold_qty` INTEGER
- `webhook_log_id` UUID NULL
- `meta` JSONB NULL

---

## 🔧 Admin Dashboard UI (Product-level)

The Admin UI for Preorder Service focuses on product-level workflows:

- **Preorder Approval Tab** — list of tracked preorder products with filters (due this week, next week, released last week, season)
- **Product Detail Drawer** — pub_date, presold_qty trend, inventory snapshot, early arrival flag, approval controls
- **Bulk Approve / Export** — select multiple products and mark `is_approved` and generate NYT export CSV or queue for review
- **Presale Snapshot Viewer** — optional view into `preorder.presale_snapshots`

> UI behavior: approvals set `preorder.approvals` rows and flip `preorder.tracking.is_approved`.

---

## 🛠️ TODO / Next Steps (Short List)

- [ ] Implement composite detection logic in `preorder-service` order processing
- [ ] Create Supabase migrations for `preorder.tracking` and `preorder.approvals`
- [ ] Seed `preorder.tracking` by parsing the catalog for existing `preorder` tags + pub_date metafields
- [ ] Build Admin UI components for approval and product detail
- [ ] Implement `presale_snapshots` and export view consumed by NYT tool (read-only for NYT)

---

## 📌 Notes & Constraints

- The `preorder` tag is treated as a historical marker and is **not removed** by lifecycle scripts. Collection membership is the operational set and **is removed** on/after `pub_date`.
- Preorder Service should favor **product-level** tracking. Order-level entries are used for presale counts and auditing, but **product-level approval** is the gating mechanism for NYT/export inclusion.
- Always reference `webhook_logs.id` for traceability when acting on events forwarded by `webhook-gateway`.