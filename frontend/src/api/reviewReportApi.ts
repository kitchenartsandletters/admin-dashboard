// reviewReportApi.ts
// HTTP calls for the Review report (reporting.* endpoints on supply-chain-service).
// Mirrors supplyChainApi's auth/env pattern (VITE_SC_BASE_URL + X-Admin-Token).
// Kept separate for now to avoid churn in supplyChainApi.ts; fold in if preferred.

const SC_BASE_URL = import.meta.env.VITE_SC_BASE_URL as string
const SC_TOKEN = import.meta.env.VITE_SC_ADMIN_TOKEN as string
if (!SC_BASE_URL) console.error('[reviewReportApi] VITE_SC_BASE_URL is not set')

const headers = { 'Content-Type': 'application/json', 'X-Admin-Token': SC_TOKEN }

async function sc<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SC_BASE_URL}${path}`, { ...options, headers: { ...headers, ...options.headers } })
  if (!res.ok) {
    let detail = res.statusText
    try { const body = await res.json(); detail = body.detail ?? body.message ?? detail } catch {}
    throw new Error(`[${res.status}] ${detail}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const str = p.toString()
  return str ? `?${str}` : ''
}

export interface ReviewRow {
  inventory_item_id: string
  variant_id: string | null
  isbn: string | null
  title: string | null
  author: string | null
  price: number | null
  tags: string[]
  on_hand: number | null
  available: number | null
  sales_last_7d: number
  sales_last_30d: number
  sales_12mo: number
  last_sold_at: string | null
  publisher_party_id: string | null
  publisher_name: string | null
  root_supplier_party_id: string | null
  supplier_name: string | null
  on_order: number
  refreshed_at: string | null
}

export interface ReviewResponse {
  rows: ReviewRow[]
  total: number
  limit: number
  offset: number
  sort: string
  order: 'asc' | 'desc'
}

export interface ReviewFreshness {
  family: string
  as_of: string | null
  source: string | null
  status: string | null
}

export interface ReviewParams {
  limit?: number
  offset?: number
  sort?: string
  order?: 'asc' | 'desc'
  publisherId?: string
  supplierId?: string
  tag?: string
  neverSold?: boolean
  inStock?: boolean
  search?: string
}

export async function fetchReview(params: ReviewParams = {}): Promise<ReviewResponse> {
  return sc(`/api/reporting/review${qs({
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
    sort: params.sort,
    order: params.order,
    publisher_id: params.publisherId,
    supplier_id: params.supplierId,
    tag: params.tag,
    never_sold: params.neverSold || undefined,
    in_stock: params.inStock || undefined,
    search: params.search,
  })}`)
}

export async function fetchReviewFreshness(): Promise<ReviewFreshness[]> {
  return sc('/api/reporting/snapshot/freshness')
}

export async function runReviewRefresh(): Promise<unknown> {
  return sc('/api/reporting/snapshot/run', { method: 'POST' })
}

// ===========================================================================
// SLICE 2b — saved views + CSV export
// ===========================================================================

export interface ViewConfig {
  sort?: string
  order?: 'asc' | 'desc'
  search?: string
  tag?: string
  neverSold?: boolean
  inStock?: boolean
  groupBy?: 'none' | 'publisher' | 'supplier'
  columns?: string[] // visible column keys, in canonical order
}

export interface SavedView {
  id: string
  user_id: string
  name: string
  config: ViewConfig
  created_at: string
  updated_at: string
}

export async function fetchViews(userId: string): Promise<SavedView[]> {
  return sc(`/api/reporting/views${qs({ user_id: userId })}`)
}

export async function saveView(userId: string, name: string, config: ViewConfig): Promise<SavedView> {
  return sc('/api/reporting/views', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, name, config }),
  })
}

export async function deleteView(userId: string, id: string): Promise<{ deleted: number; id: string }> {
  return sc(`/api/reporting/views/${id}${qs({ user_id: userId })}`, { method: 'DELETE' })
}

// CSV of the full filtered set. Needs the admin-token header, so we fetch the
// blob and trigger a download rather than using a plain link.
export async function downloadReviewCsv(params: ReviewParams = {}): Promise<void> {
  const query = qs({
    sort: params.sort,
    order: params.order,
    publisher_id: params.publisherId,
    supplier_id: params.supplierId,
    tag: params.tag,
    never_sold: params.neverSold || undefined,
    in_stock: params.inStock || undefined,
    search: params.search,
  })
  const res = await fetch(`${SC_BASE_URL}/api/reporting/review/export${query}`, {
    headers: { 'X-Admin-Token': SC_TOKEN },
  })
  if (!res.ok) throw new Error(`[${res.status}] CSV export failed`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kal-review-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
