// backorderApi.ts
// All HTTP calls to the backorder-service backend.
// No backorder fetch calls exist anywhere else in the dashboard.
// Mirrors the pattern established in supplyChainApi.ts.

import type {
  BackorderProductRow,
  BackorderOrderLine,
  BackorderOrderRow,
  BackorderAction,
  BackorderActionCreate,
  BackorderSummary,
  UrgencyBucket,
  BackorderProductStatus,
} from '../types/backorderTypes'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BO_BASE_URL = import.meta.env.VITE_BACKORDER_BASE_URL as string
const BO_TOKEN    = import.meta.env.VITE_BACKORDER_ADMIN_TOKEN as string

if (!BO_BASE_URL) {
  console.error('[backorderApi] VITE_BACKORDER_BASE_URL is not set')
}

const headers = {
  'Content-Type': 'application/json',
  'X-Admin-Token': BO_TOKEN,
}

// ---------------------------------------------------------------------------
// Base fetch wrapper
// ---------------------------------------------------------------------------

async function bo<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BO_BASE_URL}${path}`
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? body.message ?? detail
    } catch { /* non-JSON error body */ }
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

// ===========================================================================
// SUMMARY
// ===========================================================================

export async function fetchBackorderSummary(): Promise<BackorderSummary> {
  return bo('/admin/backorders/summary')
}

// ===========================================================================
// PRODUCTS
// ===========================================================================

export async function fetchBackorderProducts(opts: {
  bucket?: UrgencyBucket
  status?: BackorderProductStatus
  includeResolved?: boolean
  search?: string
  limit?: number
  offset?: number
} = {}): Promise<BackorderProductRow[]> {
  const res = await bo<{ data: BackorderProductRow[] }>(
    `/admin/backorders/products${qs({
      bucket:           opts.bucket,
      status:           opts.status,
      include_resolved: opts.includeResolved,
      search:           opts.search,
      limit:            opts.limit ?? 500,
      offset:           opts.offset ?? 0,
    })}`
  )
  return res.data
}

export async function fetchProductOrders(productId: number): Promise<{
  lines: BackorderOrderLine[]
  actions: BackorderAction[]
}> {
  return bo(`/admin/backorders/products/${productId}/orders`)
}

// ===========================================================================
// ORDERS
// ===========================================================================

export async function fetchBackorderOrders(opts: {
  openOnly?: boolean
  limit?: number
  offset?: number
} = {}): Promise<BackorderOrderRow[]> {
  const res = await bo<{ data: BackorderOrderRow[] }>(
    `/admin/backorders/orders${qs({
      open_only: opts.openOnly ?? true,
      limit:     opts.limit ?? 500,
      offset:    opts.offset ?? 0,
    })}`
  )
  return res.data
}

export async function fetchOrderDetail(orderId: number): Promise<{
  lines: BackorderOrderLine[]
  actions: BackorderAction[]
}> {
  return bo(`/admin/backorders/orders/${orderId}`)
}

// ===========================================================================
// ACTIONS
// ===========================================================================

export async function fetchBackorderActions(opts: {
  productId?: number
  orderId?: number
  limit?: number
} = {}): Promise<BackorderAction[]> {
  const res = await bo<{ data: BackorderAction[] }>(
    `/admin/backorders/actions${qs({
      product_id: opts.productId,
      order_id:   opts.orderId,
      limit:      opts.limit ?? 100,
    })}`
  )
  return res.data
}

export async function createBackorderAction(
  body: BackorderActionCreate
): Promise<BackorderAction> {
  const res = await bo<{ data: BackorderAction }>('/admin/backorders/actions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.data
}

// ===========================================================================
// OPS
// ===========================================================================

export async function rebuildBackorderRollups(): Promise<{
  order_lines: number
  product_states: number
}> {
  return bo('/admin/backorders/rollup/rebuild', { method: 'POST' })
}

export async function runBackorderReconciliation(limit = 100): Promise<{
  checked: number
  flagged: number
  errors: Array<{ product_id: number; error: string }>
}> {
  return bo(`/admin/backorders/reconcile${qs({ limit })}`, { method: 'POST' })
}
