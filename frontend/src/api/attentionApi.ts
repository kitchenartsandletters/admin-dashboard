// attentionApi.ts
// Calls to the supply-chain-service "Needs attention" endpoints.
//
// Why this is not in supplyChainApi.ts
// ------------------------------------
// It should be. supplyChainApi.ts owns every other call to this backend, and
// its `sc()` helper is exactly what these need. But `sc()` is module-private
// and that file is 28KB — adding one function means rewriting the whole thing
// inline, and a truncated write there takes out every API call in the app.
//
// So this duplicates ~8 lines of transport rather than risk that. The right
// follow-up is to export `sc` and `qs` from supplyChainApi and delete the
// duplication here; it is deliberately written to make that a small change.

const SC_BASE_URL = import.meta.env.VITE_SC_BASE_URL as string
const SC_TOKEN    = import.meta.env.VITE_SC_ADMIN_TOKEN as string
if (!SC_BASE_URL) console.error('[attentionApi] VITE_SC_BASE_URL is not set')
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

/** Why a PO line needs attention. Mirrors the backend's bucket values. */
export type ExceptionBucket = 'over_accounted' | 'damage_unresolved'

/**
 * 'investigate' — the row cannot be actioned here; someone has to find out what
 *                 physically arrived first.
 * 'decide'      — the row can be resolved in place (credit / replacement).
 */
export type ExceptionSeverity = 'investigate' | 'decide'

export interface ReceivingException {
  po_line_id: string
  po_id: string
  po_number: string | null
  po_status: string | null
  informal_ref: string | null
  line_status: string | null
  title: string | null
  isbn: string | null
  quantity_ordered: number
  quantity_received: number
  quantity_damaged: number
  quantity_cancelled: number
  quantity_accounted: number
  over_by: number
  damage_resolution: string | null
  bucket: ExceptionBucket
  severity: ExceptionSeverity
  message: string
}

export interface ReceivingExceptionsResponse {
  count: number
  counts: Record<ExceptionBucket, number>
  items: ReceivingException[]
  as_of: string
}

/**
 * PO lines with unresolved damage or quantities accounted past what was ordered.
 *
 * Queried line-by-line on the backend rather than derived from the awaiting-receipt
 * list, so a PO closing to 'received' cannot quietly drop its unresolved damage
 * out of view.
 */
export async function fetchReceivingExceptions(): Promise<ReceivingExceptionsResponse> {
  return sc('/api/attention/receiving-exceptions')
}
