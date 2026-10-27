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
  arrival_record_is_live: boolean

  // Reporting flags
  already_reported: boolean

  // Tag and collection state
  preorder_tag_present: boolean | null
  preorder_collection_present: boolean | null

  // Release queue flags (from vw_preorder_release_queue)
  due_for_release_review: boolean
  early_stock_arrival: boolean

  // Metadata
  last_updated: string | null

  first_positive_inventory_at: string | null
  lifecycle_closed: boolean

  // Explicit preorder hold (vw_preorder_products). hold_active is authoritative.
  hold_until?: string | null
  hold_reason?: string | null
  hold_note?: string | null
  hold_active?: boolean | null
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

  inventory: number | null

  // Arrival receipt signal — live inventory_arrival record. Drives the
  // three-state stock label (Received · oversold when inventory <= 0 but stock
  // did arrive). Optional: older backend responses may omit it.
  arrival_record_is_live?: boolean

  // Release queue flags
  due_for_release_review: boolean
  early_stock_arrival: boolean

  // Anomaly
  anomaly_type: string | null

  last_updated: string | null

  // Explicit preorder hold (vw_preorder_release_queue). PreorderService also
  // fills these from /products if a response lacks them (see withHoldFields).
  hold_until?: string | null
  hold_reason?: string | null
  hold_note?: string | null
  hold_active?: boolean | null
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

  // Late arrivals — aligned to vw_arrival_timing
  late_arrivals_unresolved: number   // count of preorders with late_arrival timing but not yet marked as early_stock_arrival
  no_arrival_count: number             // count of preorders with no_arrival timing

  // Arrived-but-still-active: active_preorder titles with a live inventory_arrival
  // record. Stock physically received but demand oversold it into negative
  // inventory, so it stays active_preorder. Fulfillable now; candidates for
  // early shipping-profile detachment.
  arrived_active_count: number

  // Removed: anomalies (not in backend view), already_reported_this_week (Phase 6)
}

export interface ReportablePreorderRow {
  product_id: number
  title: string | null
  isbn: string | null
  pub_date: string | null
  live_presale_qty: number
  estimated_presale_qty: number
  total_presale_qty: number
  data_confidence: "verified" | "estimated"
  report_week_start: string   // YYYY-MM-DD, Sunday
  report_week_end: string     // YYYY-MM-DD, Saturday
  already_reported: boolean
  current_week_start: string
  current_week_end: string
  anomaly_type: string | null
  is_queued: boolean
  is_reported: boolean
}

export interface UpcomingReleaseRow extends ReleaseReviewRow {
  // due_for_release_review is always true for rows from /upcoming
  // days_until_pub is computed client-side from pub_date
}
