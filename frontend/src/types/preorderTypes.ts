// types/preorderTypes.ts
// Updated for Phase 5 — aligned to actual backend view columns.
// See docs/Trust_Tier_Labeling.md for data_confidence semantics.

export interface PreorderRow {
  // Identity
  product_id: number
  title: string | null
  isbn: string | null

  // Inventory
  inventory: number

  // Presale quantities — all three must be present after Phase 3 migration
  live_presale_qty: number       // Tier 1 verified only: post-cutover live events
  estimated_presale_qty: number  // Tier 3 backfill-sourced
  total_presale_qty: number      // Combined display figure

  // Confidence label — always present, never omit from display
  data_confidence: "verified" | "estimated"

  // Classification
  classification: string         // active_preorder | historical_preorder | early_stock_arrival | anomaly_* | not_a_preorder_product
  anomaly_type: string | null

  // Pub date
  pub_date: string | null        // YYYY-MM-DD

  // Arrival timing — joined from vw_arrival_timing
  arrival_timing: "early_arrival" | "on_time_arrival" | "late_arrival" | "no_arrival" | null

  // Override and tag state
  preorder_tag_present: boolean | null
  preorder_collection_present: boolean | null
  override_status: "override" | "none"

  // Release queue flags (from vw_preorder_release_queue)
  due_for_release_review: boolean
  early_stock_arrival: boolean

  // Metadata
  last_updated: string | null
}

export interface ReleaseReviewRow {
  // Identity
  product_id: number
  title: string | null
  isbn: string | null

  // Presale quantities — using live as the reporting figure
  live_presale_qty: number
  estimated_presale_qty: number
  total_presale_qty: number
  data_confidence: "verified" | "estimated"

  // Classification and timing
  classification: string
  pub_date: string | null
  arrival_timing: "early_arrival" | "on_time_arrival" | "late_arrival" | "no_arrival" | null

  // Release queue flags
  due_for_release_review: boolean
  early_stock_arrival: boolean

  // Anomaly
  anomaly_type: string | null
  override_status: "override" | "none"

  last_updated: string | null
}

export interface PreorderSummaryMetrics {
  // Counts — aligned to vw_preorder_metrics column names
  active_preorders: number
  early_arrivals: number           // was early_stock_arrivals — backend column is early_arrivals
  releases_due_for_review: number  // was eligible_for_reporting_this_week
  releases_this_week: number       // count of active preorders with pub_date in next 7 days

  // Presale aggregates — two figures, both required
  total_live_presold_units: number       // verified only
  total_estimated_presold_units: number  // includes backfill

  // Removed: anomalies (not in backend view), already_reported_this_week (Phase 6)
}