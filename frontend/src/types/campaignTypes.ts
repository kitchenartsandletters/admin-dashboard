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

/**
 * What the parse made of the partner's column headers.
 *
 * `refused` and `unmapped` carry HEADER NAMES, not the values beneath them.
 * Render the names only: a screen that lists the contact columns it refused by
 * printing what was in them has defeated the point of refusing them.
 */
export interface GiveawayColumns {
  headers: string[]
  mapped: Record<string, string>
  /**
   * Contact columns, dropped on import and never stored. The shipping address
   * is stored on the Shopify order only.
   */
  refused: string[]
  /** Not understood, so ignored. Candidates for ALIASES. */
  unmapped: string[]
  missing_required: string[]
}

/**
 * A value the import altered rather than rejected, so an operator can see what
 * we changed on their behalf. Currently only a ZIP leading zero put back
 * (02139 arriving as 2139 out of a spreadsheet export). Empty is the normal case.
 */
export interface GiveawayNormalisation {
  row: number
  field: string
  from: string
  to: string
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
  /** Server-built. null when it cannot be built — render the name plain. */
  admin_url: string | null
}

export interface GiveawayAlreadyShippedRow {
  winner_reference: string
  reason: string
  order_name: string | null
  /** Server-built. null when it cannot be built — render the name plain. */
  admin_url: string | null
}

export interface GiveawayResult {
  campaign: string
  dry_run: boolean
  columns: GiveawayColumns
  parsed: number
  rejected: Array<{ row: number; problems: string[] }>
  already_shipped: GiveawayAlreadyShippedRow[]
  /** Values changed rather than rejected. Empty is normal. */
  normalised: GiveawayNormalisation[]
  to_create: number
  copies: number
  preview?: GiveawayPreviewRow[]
  created?: GiveawayCreatedRow[]
  /**
   * Shopify's own GraphQL errors, verbatim. Show each as given — summarising
   * them loses the only account of why a winner has no order.
   */
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
  /** Two-letter US state code. Label it "Ships to"; it is not a lifecycle state. */
  ship_state: string | null
  created_at: string
  /** Server-built. null when it cannot be built — render the name plain. */
  admin_url: string | null
}

export interface GiveawayLedger {
  campaign: string
  /** Rows in giveaway_orders: one per winner. */
  count: number
  /** Sum of quantity. Above `count` only when a winner took more than one copy. */
  copies: number
  orders: GiveawayOrderRow[]
}

// ---------------------------------------------------------------------------
// Giveaway tracking
//
// The partner-facing file. Deliberately carries no winner name and no address:
// `ship_state` is region, and that is the whole of it. Do not add columns, and
// do not display names the dashboard does not have.
//
// This supersedes GiveawayLedger for display — it covers every giveaway row and
// adds fulfillment state. Show ONE giveaway count, and take it from here; two
// counts that can disagree is the failure this module guards against elsewhere.
// ---------------------------------------------------------------------------

export interface GiveawayTrackingRow {
  winner_reference: string
  order_name: string | null
  quantity: number
  /** Two-letter US state code. Plain text, not a status badge. */
  ship_state: string | null
  fulfillment_status: string | null
  tracking_company: string | null
  /** null until ShipStation syncs the fulfillment back. Pending, not an error. */
  tracking_number: string | null
  tracking_url: string | null
  shipped_at: string | null
  estimated_delivery: string | null
  /** Ours, not the partner's. Never goes in the download. */
  shopify_order_id: number
  /** Ours too. Server-built; null when it cannot be built — render plain. */
  admin_url: string | null
}

export interface GiveawayTrackingSummary {
  /** Distinct winner_reference. */
  winners: number
  /**
   * Tracking lines, one per tracking number. Exceeds `winners` on a split
   * shipment: two parcels for one winner is two rows and one winner.
   */
  rows: number
  with_tracking: number
  /**
   * Fulfillments ShipStation has not synced back yet. A warning, not an error —
   * but the service refuses the CSV while it is above 0, because a partial file
   * reaching the partner is the mistake worth preventing.
   */
  awaiting_shipment: number
}

export interface GiveawayTracking {
  campaign: string
  summary: GiveawayTrackingSummary
  rows: GiveawayTrackingRow[]
}

/**
 * The 409 body when the CSV is refused as incomplete, carried under `detail`.
 * Read it off a CampaignApiError with `giveawayTrackingRefusal(err)` rather
 * than reaching into `err.data` at the call site.
 */
export interface GiveawayTrackingRefusal {
  error: string
  campaign: string
  summary: GiveawayTrackingSummary
  hint?: string
}
