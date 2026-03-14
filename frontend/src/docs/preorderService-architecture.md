## The admin dashboard is a window into preorder-service state, not a second classification engine and not the webhook ingest layer.

Shopify
  │
  │  webhooks
  ▼
webhook-gateway
  │
  │  validates HMAC
  │  logs raw event facts
  ▼
preorder.tracking
  │
  │  authoritative raw event log
  │
  ├─────────────────────────────────────────────┐
  │                                             │
  ▼                                             ▼
preorder-service classification/orchestration   replay / backfill workflows
  │
  │  reads tracking-derived state
  │  resolves structural preorder identity
  │  resolves effective pub date
  │  tracks inventory arrival
  │  appends commitment ledger
  │  derives lifecycle state
  │  manages release-state architecture
  ▼
Supabase persistent preorder state
  │
  ├─ preorder.product_status
  ├─ preorder.inventory_arrival
  ├─ preorder.pubdate_history
  ├─ preorder.commitment_ledger
  ├─ preorder.lifecycle_snapshot
  ├─ preorder.product_overrides
  ├─ preorder.release_state
  ├─ preorder.release_runs
  └─ preorder.replay_cursor
  │
  ▼
Derived views / query layer
  │
  ├─ preorder.vw_arrival_timing
  ├─ preorder.vw_lifecycle_state
  └─ preorder.vw_candidate_release_base
  │
  ▼
preorder-service admin API
  │
  ├─ overview rows
  ├─ release review rows
  └─ reclassification endpoints
  │
  ▼
admin-dashboard / preorder module
  │
  ├─ Preorder Overview
  ├─ Product Detail Sidebar
  └─ Release Review / Weekly Reporting Queue
  │
  ▼
admin decision / approval path
  │
  │  explicit queue / release-state workflow
  ▼
weekly release engine
  │
  │  consumes release-state + candidate data
  │  generates reporting CSV
  ▼
output/report artifacts + release_runs / release_state updates


### RESPONSIBILITY DIAGRAM

┌──────────────────────┐
│       Shopify        │
└──────────┬───────────┘
           │
           │ webhooks
           ▼
┌──────────────────────┐
│   webhook-gateway    │
│ -------------------- │
│ - receive webhooks   │
│ - validate HMAC      │
│ - log raw facts      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  preorder.tracking   │
│ -------------------- │
│ authoritative event  │
│ log / raw facts      │
└──────────┬───────────┘
           │
           ▼
┌────────────────────────────────────────────┐
│              preorder-service              │
│ ------------------------------------------ │
│ classification + state-machine + reporting │
│                                            │
│ - structural classification                │
│ - anomaly detection                        │
│ - effective pub date resolution            │
│ - inventory arrival tracking               │
│ - pub-date history tracking                │
│ - append-only commitment ledger            │
│ - lifecycle snapshot + derivation          │
│ - release-state architecture               │
└──────────┬─────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────┐
│         Supabase persistent state          │
│ ------------------------------------------ │
│ product_status                             │
│ inventory_arrival                          │
│ pubdate_history                            │
│ commitment_ledger                          │
│ lifecycle_snapshot                         │
│ product_overrides                          │
│ release_state                              │
│ release_runs                               │
│ replay_cursor                              │
└──────────┬─────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────┐
│            derived views / adapters        │
│ ------------------------------------------ │
│ vw_arrival_timing                          │
│ vw_lifecycle_state                         │
│ vw_candidate_release_base                  │
└──────────┬─────────────────────────────────┘
           │
           ▼
┌──────────────────────┐
│   admin-dashboard    │
│  preorder module     │
│ -------------------- │
│ - overview table     │
│ - detail sidebar     │
│ - release review     │
│ - reclassify action  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ weekly release engine│
│ -------------------- │
│ - consumes explicit  │
│   release-state path │
│ - generates CSV      │
└──────────────────────┘