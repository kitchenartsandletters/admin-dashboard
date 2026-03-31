// preorderApi.ts
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
// API Response Types — aligned to Phase 3/5 view column names
// -----------------------------------------------------------------------------

type PreorderProductAPI = {
  product_id: number
  title: string | null
  isbn: string | null
  inventory: number | null
  live_presale_qty: number | null
  estimated_presale_qty: number | null
  total_presale_qty: number | null
  data_confidence: "verified" | "estimated"
  pub_date: string | null
  classification: string
  preorder_tag_present: boolean | null
  preorder_collection_present: boolean | null
  override_status: string | null
  anomaly_type: string | null
  arrival_timing: string | null
  due_for_release_review: boolean
  early_stock_arrival: boolean
  last_updated: string | null
}

type ReleaseQueueAPI = PreorderProductAPI

type PreorderMetricsAPI = {
  active_preorders: number
  early_arrivals: number
  releases_due_for_review: number
  releases_this_week: number
  total_live_presold_units: number
  total_estimated_presold_units: number
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
    inventory: row.inventory ?? 0,
    live_presale_qty: row.live_presale_qty ?? 0,
    estimated_presale_qty: row.estimated_presale_qty ?? 0,
    total_presale_qty: row.total_presale_qty ?? 0,
    data_confidence: row.data_confidence ?? "estimated",
    classification: row.classification,
    anomaly_type: row.anomaly_type,
    pub_date: row.pub_date,
    arrival_timing: row.arrival_timing as PreorderRow["arrival_timing"],
    preorder_tag_present: row.preorder_tag_present,
    preorder_collection_present: row.preorder_collection_present,
    override_status: (row.override_status ?? "none") as PreorderRow["override_status"],
    due_for_release_review: row.due_for_release_review ?? false,
    early_stock_arrival: row.early_stock_arrival ?? false,
    last_updated: row.last_updated,
  }
}

function adaptReleaseQueueRow(row: ReleaseQueueAPI): ReleaseReviewRow {
  return {
    product_id: row.product_id,
    title: row.title,
    isbn: row.isbn,
    live_presale_qty: row.live_presale_qty ?? 0,
    estimated_presale_qty: row.estimated_presale_qty ?? 0,
    total_presale_qty: row.total_presale_qty ?? 0,
    data_confidence: row.data_confidence ?? "estimated",
    classification: row.classification,
    pub_date: row.pub_date,
    arrival_timing: row.arrival_timing as ReleaseReviewRow["arrival_timing"],
    due_for_release_review: row.due_for_release_review ?? false,
    early_stock_arrival: row.early_stock_arrival ?? false,
    anomaly_type: row.anomaly_type,
    override_status: (row.override_status ?? "none") as ReleaseReviewRow["override_status"],
    last_updated: row.last_updated,
  }
}

function adaptMetrics(row: PreorderMetricsAPI): PreorderSummaryMetrics {
  return {
    active_preorders: row.active_preorders ?? 0,
    early_arrivals: row.early_arrivals ?? 0,
    releases_due_for_review: row.releases_due_for_review ?? 0,
    releases_this_week: row.releases_this_week ?? 0,
    total_live_presold_units: row.total_live_presold_units ?? 0,
    total_estimated_presold_units: row.total_estimated_presold_units ?? 0,
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