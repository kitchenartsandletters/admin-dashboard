import {
  PreorderRow,
  ReleaseReviewRow,
  PreorderSummaryMetrics
} from "../src/types/preorderTypes"

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------

const PREORDER_BASE_URL = import.meta.env.VITE_PREORDER_BASE_URL
const ADMIN_TOKEN = import.meta.env.VITE_PREORDER_ADMIN_TOKEN

const headers = {
  "Content-Type": "application/json",
  "X-Admin-Token": ADMIN_TOKEN
}

// -----------------------------------------------------------------------------
// API Response Types (matches SQL view schema)
// -----------------------------------------------------------------------------

type PreorderProductAPI = {
  product_id: number
  title: string
  isbn: string | null
  inventory: number | null
  presold_qty: number | null
  pub_date: string | null
  classification: string
  preorder_tag_present: boolean
  preorder_collection_present: boolean
  override_status: string | null
  anomaly_type: string | null
  last_updated: string | null
}

type ReleaseQueueAPI = PreorderProductAPI

type PreorderMetricsAPI = {
  active_preorders: number
  early_arrivals: number
  anomalies: number
  release_queue_count: number
  released_this_week: number
}

// -----------------------------------------------------------------------------
// Generic Fetch Helper
// -----------------------------------------------------------------------------

async function fetchFromService<T>(path: string): Promise<T> {
  const res = await fetch(`${PREORDER_BASE_URL}${path}`, { headers })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Preorder service error (${res.status}): ${text}`)
  }

  return res.json()
}

// -----------------------------------------------------------------------------
// Adapters (API → UI Types)
// -----------------------------------------------------------------------------

function adaptProductRow(row: PreorderProductAPI): PreorderRow {
  return {
    product_id: row.product_id,
    title: row.title,
    isbn: row.isbn,

    vendor: null,
    handle: undefined,

    classification_status: row.classification as PreorderRow["classification_status"],
    anomaly_type: row.anomaly_type,

    effective_pub_date: row.pub_date,
    effective_pub_date_source: row.override_status ? "override_date" : "unknown",

    arrival_timing: row.inventory && row.inventory > 0 ? "early_arrival" : "no_arrival",

    first_positive_inventory_at: null,
    first_positive_inventory_qty: row.inventory,

    lifecycle_state: row.classification,
    lifecycle_snapshot_at: row.last_updated,
    lifecycle_closed_at: null,

    presale_commitment_total: row.presold_qty ?? 0,

    reporting_state: row.preorder_collection_present ? "queued" : "not_queued",

    released_to_reporting: false,
    release_report_week_start: null,
    release_report_week_end: null,
    released_at: null,
    csv_filename: null,

    can_reclassify: true,
    last_reclassified_at: null,

    created_at: row.last_updated,
    updated_at: row.last_updated
  }
}

function adaptReleaseQueueRow(row: ReleaseQueueAPI): ReleaseReviewRow {
  return {
    product_id: row.product_id,
    title: row.title,
    isbn: row.isbn,

    target_report_week_start: row.pub_date ?? "TBD",
    target_report_week_end: null,

    presales_banked: row.presold_qty ?? 0,
    weekly_sales: 0,

    reporting_quantity: row.presold_qty ?? 0,

    already_reported: false,

    released_at: null,
    csv_filename: null,

    classification_status: row.classification as ReleaseReviewRow["classification_status"],
    anomaly_type: row.anomaly_type
  }
}

function adaptMetrics(row: PreorderMetricsAPI): PreorderSummaryMetrics {
  return {
    active_preorders: row.active_preorders ?? 0,
    early_stock_arrivals: row.early_arrivals ?? 0,
    anomalies: row.anomalies ?? 0,
    eligible_for_reporting_this_week: row.release_queue_count ?? 0,
    already_reported_this_week: row.released_this_week ?? 0
  }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export async function fetchPreorderProducts(): Promise<PreorderRow[]> {
  const data = await fetchFromService<PreorderProductAPI[]>(
    "/admin/preorders/products"
  )

  return data.map(adaptProductRow)
}

export async function fetchPreorderReleaseQueue(): Promise<ReleaseReviewRow[]> {
  const data = await fetchFromService<ReleaseQueueAPI[]>(
    "/admin/preorders/release-queue"
  )

  return data.map(adaptReleaseQueueRow)
}

export async function fetchPreorderMetrics(): Promise<PreorderSummaryMetrics> {
  const data = await fetchFromService<PreorderMetricsAPI>(
    "/admin/preorders/metrics"
  )

  return adaptMetrics(data)
}

export async function reclassifyProduct(productId: number) {
  return fetchFromService(`/admin/preorders/reclassify/${productId}`)
}