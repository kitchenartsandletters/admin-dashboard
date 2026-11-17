// campaignTypes.ts
// Types for the Campaign module. Shapes match campaign-service
// /api/campaigns/* responses (vw_campaigns, vw_campaign_metrics,
// vw_campaign_orders, plus the resync, reconcile and giveaway routes).

export type CampaignState = 'open' | 'paused' | 'closed'

/**
 * How an order was tied to a campaign.
 *   property — the line item carried _campaign. The normal case.
 *   both     — property and landing site agreed.
 *   inferred — landing site only, property missing. The template is broken.
 *   manual   — an operator correction, a refund, or a cancellation.
 */
export type AttributionSignal = 'property' | 'inferred' | 'both' | 'manual'

export interface CampaignRow {
  id: string
  slug: string
  name: string
  partner: string
  product_id: number
  variant_id: number | null
  /** Variant barcode. Sales reporting rolls up on this, never on product or SKU. */
  isbn: string | null
  page_handle: string | null
  allocation: number
  buffer: number
  consumed: number
  remaining: number
  /** allocation - buffer - consumed, floored at 0. What is still sellable. */
  sellable: number
  reopen_on_refund: boolean
  /** What belongs in the Shopify metafield: 0 unless the campaign is open. */
  metafield_value: number
  state: CampaignState
  opens_at: string | null
  closes_at: string | null
  last_order_at: string | null
  /** Last value a successful sync_log row attempted. Not proof of what Shopify holds. */
  last_synced_value: number | null
  metafield_in_sync: boolean | null
}

export interface CampaignMetrics {
  campaign_id: string
  slug: string
  orders: number
  units: number
  revenue_cents: number
  units_24h: number
  units_7d: number
  /** Orders attributed by landing site alone. Any number above 0 wants looking at. */
  inferred_count: number
  refund_count: number
}

export interface CampaignOrderRow {
  campaign_id: string
  slug: string
  order_id: number
  order_name: string | null
  quantity: number
  subtotal_cents: number | null
  ship_state: string | null
  signal: AttributionSignal
  is_refund: boolean
  occurred_at: string
  admin_url: string
}

export interface ResyncResult {
  slug: string
  state: CampaignState
  remaining: number
  metafield_value: number
  synced: boolean
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * in_sync        — nothing disagrees.
 * corrected      — only derived values disagreed; the ledger won.
 * drift_reported — Shopify disagrees with the ledger, or the scan was
 *                  incomplete. Needs a person, and is never auto-corrected.
 */
export type ReconcileAction = 'in_sync' | 'corrected' | 'drift_reported'

export interface ReconcileReport {
  campaign: string
  dry_run: boolean
  scanned: {
    since: string | null
    orders: number
    cancelled_skipped: number
    /** The scan hit its page limit, so the comparison cannot clear the campaign. */
    truncated: boolean
  }
  /** Authoritative: every row came from a verified webhook delivery. */
  ledger_qty: number
  /** The cached rollup. Disagreeing with the ledger is a lost update. */
  consumed: number
  /** Net campaign line items in Shopify now. Disagreeing means a missed delivery. */
  shopify_qty: number
  metafield: { live: number | null; expected: number }
  contributing_orders: Array<{
    order_id: number
    order_name: string | null
    quantity: number
    created_at: string | null
  }>
  action: ReconcileAction
  cache_drift: number
  source_drift: number
  metafield_drift: boolean
  /** Which derived values the service will rewrite on a non-dry run. */
  fixes: string[]
  /** What it refuses to fix, in words. */
  needs_attention: string[]
  state?: CampaignState
  applied?: string[]
  metafield_errors?: unknown[]
}

// ---------------------------------------------------------------------------
// Giveaway
// ---------------------------------------------------------------------------

/** What the parse made of the partner's column headers. */
export interface GiveawayColumns {
  headers: string[]
  mapped: Record<string, string>
  /** Contact details and partner-side preferences. Dropped, never stored. */
  refused: string[]
  /** Not understood, so ignored. Candidates for ALIASES. */
  unmapped: string[]
  missing_required: string[]
}

export interface GiveawayPreviewRow {
  winner_reference: string
  ship_to: string
  quantity: number
}

export interface GiveawayCreatedRow {
  winner_reference: string
  id: number
  name: string
  gid: string
}

export interface GiveawayResult {
  campaign: string
  dry_run: boolean
  columns: GiveawayColumns
  parsed: number
  rejected: Array<{ row: number; problems: string[] }>
  already_shipped: Array<{
    winner_reference: string
    reason: string
    order_name: string | null
  }>
  to_create: number
  copies: number
  preview?: GiveawayPreviewRow[]
  created?: GiveawayCreatedRow[]
  failed?: Array<{ winner_reference: string; error: string }>
  /** Present instead of the above when no column maps to a required field. */
  error?: string
  hint?: string
}

export interface GiveawayOrderRow {
  id: string
  campaign_id: string
  winner_reference: string
  shopify_order_id: number
  order_name: string | null
  quantity: number
  ship_state: string | null
  created_at: string
}

export interface GiveawayLedger {
  campaign: string
  count: number
  copies: number
  orders: GiveawayOrderRow[]
}
