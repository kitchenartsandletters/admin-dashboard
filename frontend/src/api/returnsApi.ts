// returnsApi.ts
// HTTP calls for the Publisher Returns worksheet (reporting.returns_* endpoints
// on supply-chain-service). Same auth/env pattern as reviewReportApi.
const SC_BASE_URL = import.meta.env.VITE_SC_BASE_URL as string
const SC_TOKEN = import.meta.env.VITE_SC_ADMIN_TOKEN as string
if (!SC_BASE_URL) console.error('[returnsApi] VITE_SC_BASE_URL is not set')

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
  const s = p.toString()
  return s ? `?${s}` : ''
}

export interface ReturnsPublisherTile {
  publisher_party_id: string
  publisher_name: string | null
  publisher_notes: string | null
  payment_terms: string | null
  default_return_address: string | null
  default_return_recipient: string | null
  titles: number
  titles_with_excess: number
  on_hand_units: number
  on_hand_value: number
  return_units: number
  return_value_list: number
  never_sold_titles: number
}

export interface ReturnsWorksheetRow {
  inventory_item_id: string
  variant_id: string | null
  isbn: string | null
  title: string | null
  author: string | null
  price: number | null
  on_hand: number
  available: number | null
  on_order: number
  sales_12mo: number
  sales_24mo: number
  last_sold_at: string | null
  months_since_last_sold: number | null
  never_sold_ever: boolean
  publisher_party_id: string
  publisher_name: string | null
  keep_qty: number
  suggested_return: number
  suggested_return_value: number
}

export interface ReturnsWorksheetResponse {
  publisher: ReturnsPublisherTile | null
  rows: ReturnsWorksheetRow[]
  total: number
  limit: number
  offset: number
  sort: string
  order: 'asc' | 'desc'
}

export interface WorksheetParams {
  limit?: number
  offset?: number
  sort?: string
  order?: 'asc' | 'desc'
  excessOnly?: boolean
  search?: string
}

export async function fetchReturnsPublishers(): Promise<ReturnsPublisherTile[]> {
  return sc('/api/reporting/returns/publishers')
}

export async function fetchReturnsWorksheet(publisherId: string, params: WorksheetParams = {}): Promise<ReturnsWorksheetResponse> {
  return sc(`/api/reporting/returns/worksheet${qs({
    publisher_id: publisherId,
    limit: params.limit ?? 1000,
    offset: params.offset ?? 0,
    sort: params.sort,
    order: params.order,
    excess_only: params.excessOnly || undefined,
    search: params.search,
  })}`)
}
