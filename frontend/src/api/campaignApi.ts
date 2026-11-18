// campaignApi.ts
// All HTTP calls to the campaign-service backend.
// No campaign fetch calls exist anywhere else in the dashboard.
// Mirrors the pattern established in backorderApi.ts, with one difference:
// campaign-service authenticates with Authorization: Bearer, not X-Admin-Token.

import type {
  CampaignRow,
  CampaignMetrics,
  CampaignOrderRow,
  ResyncResult,
  ReconcileReport,
  GiveawayResult,
  GiveawayLedger,
  GiveawayTracking,
  GiveawayTrackingRefusal,
  GiveawayTrackingSummary,
} from '../types/campaignTypes'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CA_BASE_URL = import.meta.env.VITE_CAMPAIGN_BASE_URL as string
const CA_TOKEN    = import.meta.env.VITE_CAMPAIGN_ADMIN_TOKEN as string

if (!CA_BASE_URL) {
  console.error('[campaignApi] VITE_CAMPAIGN_BASE_URL is not set')
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${CA_TOKEN}`,
}

// ---------------------------------------------------------------------------
// Errors
//
// FastAPI's `detail` is not always a string. On this service it can be:
//   - a string                      most routes
//   - an object                     the giveaway route's 422 column diagnosis,
//                                   and the tracking route's 409 incomplete-file
//                                   refusal, which carries {error, campaign,
//                                   summary, hint}
//   - an array of {loc, msg, type}  request validation errors
//
// Throwing a bare Error with the status interpolated into the message is how
// supply-chain-service surfaced "[409] [object Object]" to staff when the PO
// line floor guard went live on 2026-11-02 (see ScApiError in supplyChainApi.ts).
// The same shape of bug was waiting here: a caller handed a string cannot tell
// a refused partial file from any other failure, and the awaiting count never
// reaches the screen.
//
// CampaignApiError keeps the readable message in `message` and preserves the
// parsed body, so callers can read structured fields — e.g. the 409's summary,
// via giveawayTrackingRefusal() below.
//
// Deliberately not an import of ScApiError: different base URL, different auth
// header, and coupling the two API modules buys nothing.
// ---------------------------------------------------------------------------

export class CampaignApiError extends Error {
  readonly status: number
  /** Raw `detail` as returned: string, object, array, or null. */
  readonly detail: unknown
  /** `detail` when it is a plain object, else null. Where structured fields live. */
  readonly data: Record<string, unknown> | null
  /** The readable message without the "[409] " prefix. What staff should see. */
  readonly text: string

  constructor(
    status: number,
    message: string,
    detail: unknown,
    data: Record<string, unknown> | null,
  ) {
    super(`[${status}] ${message}`)
    this.name = 'CampaignApiError'
    this.status = status
    this.detail = detail
    this.data = data
    this.text = message
    // Keep instanceof working when the bundle targets ES5.
    Object.setPrototypeOf(this, CampaignApiError.prototype)
  }
}

/** Pull a human-readable string out of whatever shape `detail` arrived in. */
function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail.trim()

  // Request validation errors: [{loc, msg, type}, …]
  if (Array.isArray(detail)) {
    const msgs = detail
      .map(d => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : null))
      .filter((m): m is string => !!m && m.trim().length > 0)
    if (msgs.length) return msgs.join('; ')
  }

  if (detail && typeof detail === 'object') {
    const obj = detail as Record<string, unknown>
    for (const key of ['error', 'message', 'detail', 'hint']) {
      const v = obj[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }

  return fallback
}

/** Build a CampaignApiError from a failed Response, reading the body at most once. */
async function caError(res: Response, fallback?: string): Promise<CampaignApiError> {
  let body: unknown = null
  try { body = await res.json() } catch { /* empty or non-JSON body */ }

  const envelope = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const detail = envelope ? (envelope.detail ?? envelope.message ?? null) : null
  const data = detail && typeof detail === 'object' && !Array.isArray(detail)
    ? (detail as Record<string, unknown>)
    : null

  return new CampaignApiError(
    res.status,
    detailMessage(detail, fallback ?? res.statusText ?? 'Request failed'),
    detail,
    data,
  )
}

/**
 * The tracking CSV refused because fulfillments are still unsynced, or null if
 * this is any other failure. Keeps the 409's shape here rather than in a
 * component reaching into `err.data`.
 *
 * The summary is the same object the json route returns, so a panel can show
 * the live awaiting count in its own refusal message.
 */
export function giveawayTrackingRefusal(err: unknown): GiveawayTrackingRefusal | null {
  if (!(err instanceof CampaignApiError) || err.status !== 409) return null
  const data = err.data
  const summary = data?.summary
  if (!summary || typeof summary !== 'object') return null
  return {
    error: typeof data?.error === 'string' ? data.error : err.text,
    campaign: typeof data?.campaign === 'string' ? data.campaign : '',
    summary: summary as GiveawayTrackingSummary,
    hint: typeof data?.hint === 'string' ? data.hint : undefined,
  }
}

// ---------------------------------------------------------------------------
// Base fetch wrapper
//
// `raw` returns the Response itself, for downloads such as CSV. An anchor href
// cannot carry the Bearer token, so a download has to come through fetch and be
// handed to the browser as a blob — the pattern _downloadBlob uses in
// supplyChainApi.ts, reached here through the same option scRequest exposes.
// ---------------------------------------------------------------------------

async function ca<T>(
  path: string,
  options: RequestInit = {},
  opts: { raw?: boolean } = {},
): Promise<T> {
  const url = `${CA_BASE_URL}${path}`
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
  if (!res.ok) throw await caError(res)
  if (opts.raw) return res as unknown as T
  if (res.status === 204) return undefined as T
  return res.json()
}

// ===========================================================================
// READS
// ===========================================================================

export async function fetchCampaigns(): Promise<CampaignRow[]> {
  const res = await ca<{ campaigns: CampaignRow[] }>('/api/campaigns')
  return res.campaigns
}

export async function fetchCampaignMetrics(slug: string): Promise<CampaignMetrics> {
  return ca(`/api/campaigns/${slug}/metrics`)
}

export async function fetchCampaignOrders(
  slug: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<CampaignOrderRow[]> {
  const limit = opts.limit ?? 200
  const offset = opts.offset ?? 0
  const res = await ca<{ orders: CampaignOrderRow[] }>(
    `/api/campaigns/${slug}/orders?limit=${limit}&offset=${offset}`
  )
  return res.orders
}

// ===========================================================================
// REPAIR
// ===========================================================================

/** Push the gate value to Shopify. The one-click fix when metafield_in_sync is false. */
export async function resyncMetafield(slug: string): Promise<ResyncResult> {
  return ca(`/api/campaigns/${slug}/resync`, { method: 'POST' })
}

/**
 * Compare the ledger against the cached counter and against Shopify.
 *
 * Dry run by default, and worth running that way first: a report with
 * needs_attention entries is describing something the service will not repair
 * on its own, so there is nothing to gain by going straight to a write.
 */
export async function reconcileCampaign(
  slug: string,
  opts: { dryRun?: boolean; since?: string } = {}
): Promise<ReconcileReport> {
  return ca(`/api/campaigns/${slug}/reconcile`, {
    method: 'POST',
    body: JSON.stringify({
      dry_run: opts.dryRun ?? true,
      since: opts.since ?? null,
    }),
  })
}

// ===========================================================================
// GIVEAWAY
// ===========================================================================

/**
 * Parse a winner list. dryRun true reports what it made of the file and
 * creates nothing; false creates one zero-price Shopify order per winner.
 *
 * Read columns.unmapped on the first run against a new partner's file — those
 * are the headers that were not understood, and the names to add to ALIASES.
 */
export async function submitGiveaway(
  slug: string,
  csv: string,
  opts: { dryRun?: boolean } = {}
): Promise<GiveawayResult> {
  return ca(`/api/campaigns/${slug}/giveaway`, {
    method: 'POST',
    body: JSON.stringify({ csv, dry_run: opts.dryRun ?? true }),
  })
}

/**
 * The giveaway ledger: one row per winner, no fulfillment state.
 *
 * Superseded for display by fetchGiveawayTracking, which covers every row here
 * and adds shipment state. Kept for callers that want the ledger alone, but a
 * screen should show one giveaway count, from tracking — two counts that can
 * disagree is the failure this module guards against elsewhere.
 */
export async function fetchGiveawayOrders(slug: string): Promise<GiveawayLedger> {
  return ca(`/api/campaigns/${slug}/giveaway`)
}

// ===========================================================================
// GIVEAWAY TRACKING
//
// What the partner receives, and the state of each shipment behind it. The file
// carries no winner name and no address — `ship_state` is region and that is
// the whole of it. Do not add columns to the download.
// ===========================================================================

/**
 * Tracking state for every giveaway order, plus the counts the panel heads with.
 *
 * `summary.awaiting_shipment` above 0 means ShipStation has not synced those
 * fulfillments back yet. It is a warning, not an error, and the rows behind it
 * read as pending rather than failed — but it is also why the CSV is refused
 * while it is above 0 (see downloadGiveawayTrackingCsv).
 */
export async function fetchGiveawayTracking(slug: string): Promise<GiveawayTracking> {
  return ca(`/api/campaigns/${encodeURIComponent(slug)}/giveaway/tracking?format=json`)
}

/**
 * Fetch the partner CSV and hand it to the browser as <slug>-tracking.csv.
 *
 * The service refuses this with a 409 while awaiting_shipment > 0, because the
 * mistake worth preventing is a partial file reaching the partner — and the
 * refusal has to live there rather than in a disabled button, since the file is
 * also pulled by curl and by the recurring job. Catch CampaignApiError and read
 * giveawayTrackingRefusal(err) to show the live awaiting count.
 *
 * `allowPartial` sets the service's override. It sends an incomplete file on
 * purpose, so only pass it on an explicit decision to do that.
 */
export async function downloadGiveawayTrackingCsv(
  slug: string,
  opts: { allowPartial?: boolean } = {},
): Promise<void> {
  const query = `format=csv${opts.allowPartial ? '&allow_partial=true' : ''}`
  const res = await ca<Response>(
    `/api/campaigns/${encodeURIComponent(slug)}/giveaway/tracking?${query}`,
    { method: 'GET' },
    { raw: true },
  )
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${slug}-tracking.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}
