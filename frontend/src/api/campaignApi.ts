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
// Base fetch wrapper
// ---------------------------------------------------------------------------

async function ca<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${CA_BASE_URL}${path}`
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
  if (!res.ok) {
    let detail: string = res.statusText
    try {
      const body = await res.json()
      // A 422 from the giveaway route carries a structured diagnosis rather
      // than a sentence; keep it readable instead of printing [object Object].
      if (body.detail && typeof body.detail === 'object') {
        detail = body.detail.error ?? JSON.stringify(body.detail)
      } else {
        detail = body.detail ?? body.message ?? detail
      }
    } catch { /* non-JSON error body */ }
    throw new Error(`[${res.status}] ${detail}`)
  }
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

export async function fetchGiveawayOrders(slug: string): Promise<GiveawayLedger> {
  return ca(`/api/campaigns/${slug}/giveaway`)
}
