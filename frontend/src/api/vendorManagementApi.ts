// vendorManagementApi.ts
// Phase 2 vendor management (supply-chain-service docs/VENDOR_MANAGEMENT.md).
//
//   §4.1 explain a title           GET   /suppliers/explain
//   §4.2 supplier profile           GET   /suppliers/{party_id}/profile
//   §4.4 vendor-code changes        POST  /suppliers/{party_id}/codes/preview | apply
//   §4.5 product vendor (Shopify)   PATCH /suppliers/products/{inventory_item_id}/vendor
//   §4.6 barcode audit              GET   /suppliers/barcode-audit
//
// Every call goes through supplyChainApi's transport (scRequest), so writes
// carry the same actor headers as PO line edits (X-Actor-Email / -Role /
// -Staff-Id / -Staff-Name) and refusals arrive as ScApiError, with
// `data.error` naming the case and `text` the message to show.
//
// Display rules shared by every screen that uses this:
//   - Problems, warnings and blockers carry `code` and `message` (problems also
//     `severity`). Show `message`; colour by severity; keep the order the
//     backend sends (blockers first). `code` is for logic only, never text.
//   - Returns are not ordering. Where returns go is always `chain.returns_to`
//     (with its `path`), never the ordering parent. Chesapeake & Hudson takes
//     orders but never returns; its lines return to Hachette.
//
// Types follow the contract's examples. Fields the contract marks "…details"
// are kept open (index signatures) rather than guessed.

import { scRequest, ScApiError } from './supplyChainApi'

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type Severity = 'blocker' | 'warning' | 'info'

export interface Problem {
  code: string
  severity: Severity
  message: string
  [detail: string]: unknown
}

/** A conflict, warning or blocker in a code-change preview. */
export interface Notice {
  code: string
  message: string
  [detail: string]: unknown
}

export interface PartyRef { party_id: string; party_name: string }

export interface ReturnsTo {
  party_id: string
  party_name: string
  depth: number
  /** The walk, e.g. ["Quarto Group", "Chesapeake & Hudson", "Hachette Book Group"]. */
  path: string[]
  address: { label: string | null; recipient_name: string | null; address: string | null } | null
}

export interface Chain {
  /** Ordering chain by parent_id, starting with the supplier itself. */
  ordering: { party_id: string; party_name: string; is_returnable: boolean | null }[]
  /** Null when nothing up the returns chain takes returns. */
  returns_to: ReturnsTo | null
}

const SEVERITY_ORDER: Record<Severity, number> = { blocker: 0, warning: 1, info: 2 }

/** Severity rank, for code that must group; display keeps the backend's order. */
export function severityRank(s: Severity | string): number {
  return SEVERITY_ORDER[s as Severity] ?? 3
}

/** The message to show for any refusal from these endpoints. */
export function errorText(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof ScApiError) {
    if (Array.isArray(e.detail)) {
      return `The dashboard sent a request the server couldn’t read. This is a dashboard bug, not something you did. (${e.text})`
    }
    return e.text
  }
  return e instanceof Error ? e.message : fallback
}

/** The refusal's `error` code, for logic. */
export function errorCode(e: unknown): string | null {
  return e instanceof ScApiError && typeof e.data?.error === 'string' ? e.data.error : null
}

// ---------------------------------------------------------------------------
// §4.2 Supplier profile
// ---------------------------------------------------------------------------

export interface ProfileAccount {
  account_id: string
  label: string
  account_number: string | null
  is_active: boolean
  is_primary: boolean
  is_wholesaler: boolean
  is_b2b: boolean
  ordering_method: string | null
  ordering_email: string | null
  ordering_url: string | null
  currency: string | null
  min_order_amount: number | null
  freight_terms: string | null
  notes: string | null
  titles: number
  /** Other accounts with the same number, under any supplier. Normal for the Ingram family. */
  shared_with: { account_id: string; account_label: string; is_active: boolean; party_id: string; party_name: string }[]
  purchase_orders: { total: number; open: number; last_ordered_at: string | null }
}

export interface ProfileVendorCode {
  code: string
  vendor_key: string
  /** The supplier's own name, listed first; not a removable code. */
  is_name: boolean
  titles: number
  titles_here: number
  titles_elsewhere: { party_id: string; party_name: string; titles: number; [k: string]: unknown }[]
  resolves_to: PartyRef | null
  wins: boolean
  won_by_parent: boolean
  also_claimed_by: { party_id: string; party_name: string; has_active_account: boolean }[]
}

export interface SupplierProfile {
  party: {
    id: string
    name: string
    legal_name: string | null
    roles: string[]
    relationship_type: string | null
    country: string | null
    website: string | null
    notes: string | null
    payment_terms: string | null
    discount_pct: number | null
    is_returnable: boolean | null
    returns_code: string | null
    is_active: boolean
    is_deprecated: boolean
    shopify_vendor_synced_at: string | null
    created_at: string
    updated_at: string
    parent: PartyRef | null
    returns_parent: PartyRef | null
  }
  orderable: boolean
  accounts: ProfileAccount[]
  vendor_codes: ProfileVendorCode[]
  chain: Chain
  children: {
    party_id: string; party_name: string; roles: string[]; relationship_type: string | null
    is_active: boolean; is_deprecated: boolean; is_returnable: boolean | null
    has_active_account: boolean; titles: number; returns_parent: PartyRef | null
  }[]
  /** Suppliers whose returns END here after the full walk; `via` names those passed through. */
  returns_from: { party_id: string; party_name: string; via?: string[]; [k: string]: unknown }[]
  titles: {
    total: number
    by_status: Record<string, number>
    by_barcode_finding: Record<string, number>
  }
  purchase_orders: { total: number; open: number; last_ordered_at: string | null }
  open_setup_requests: {
    id: string; vendor: string; active_titles: number; total_titles: number
    suggestion_reason: string | null; last_seen_at: string
  }[]
  recent_changes: {
    changed_at: string; change_type: string; old_value: unknown; new_value: unknown
    reason: string | null; changed_by: string | null
  }[]
  recent_moves: {
    direction: 'in' | 'out' | 'within'
    moved_at: string; title: string | null; isbn: string | null; inventory_item_id: string | null
    old_vendor: string | null; new_vendor: string | null; source: string | null; applied: boolean
    reason: string | null; asserted_staff_name: string | null; asserted_actor_email: string | null
    from_account: string | null; from_party: string | null; to_account: string | null; to_party: string | null
  }[]
  problems: Problem[]
}

export async function fetchSupplierProfile(partyId: string): Promise<SupplierProfile> {
  return scRequest(`/api/suppliers/${encodeURIComponent(partyId)}/profile`)
}

// ---------------------------------------------------------------------------
// §4.4 Vendor-code changes
// ---------------------------------------------------------------------------

export interface CodeEffect {
  code: string
  vendor_key: string
  change: 'add' | 'remove'
  resolves_before: PartyRef | null
  resolves_after: PartyRef | null
  also_claimed_by: { party_id: string; party_name: string; has_active_account: boolean }[]
  titles: number
  titles_moving: number
  [k: string]: unknown
}

export interface CodeMove {
  row_id: string
  inventory_item_id: string
  title: string | null
  isbn: string | null
  vendor: string | null
  vendor_key: string
  from_account_id: string | null
  from_account: string | null
  from_account_active: boolean | null
  from_party: string | null
  to_account_id: string | null
  to_account: string | null
  to_party: string | null
  already_misplaced: boolean
}

export interface CodePreview {
  /** Null when there are blockers: nothing was stored and there is nothing to apply. */
  preview_id: string | null
  expires_at: string | null
  party: PartyRef
  codes_before: string[]
  codes_after: string[]
  added: string[]
  removed: string[]
  effects: CodeEffect[]
  move_count: number
  titles_with_isbn: number
  items_without_isbn: number
  /** The first 200; move_count counts all. */
  moves: CodeMove[]
  moves_truncated: boolean
  stranded_count: number
  setup_requests_resolved: { request_id: string; vendor: string; active_titles: number; party_id: string; party_name: string }[]
  conflicts: Notice[]
  warnings: Notice[]
  blockers: Notice[]
  fingerprint: string | null
}

export interface CodeApplyResult {
  applied: true
  preview_id: string
  party: PartyRef
  codes_before: string[]
  codes_after: string[]
  added: string[]
  removed: string[]
  moved: number
  occupants_consolidated: number
  setup_requests_resolved: number
}

export async function previewCodeChange(partyId: string, add: string[], remove: string[]): Promise<CodePreview> {
  return scRequest(`/api/suppliers/${encodeURIComponent(partyId)}/codes/preview`, {
    method: 'POST', body: JSON.stringify({ add, remove }),
  })
}

export async function applyCodeChange(partyId: string, previewId: string, reason: string): Promise<CodeApplyResult> {
  return scRequest(`/api/suppliers/${encodeURIComponent(partyId)}/codes/apply`, {
    method: 'POST', body: JSON.stringify({ preview_id: previewId, reason }),
  })
}

// ---------------------------------------------------------------------------
// §4.1 Explain a title
// ---------------------------------------------------------------------------

export interface Barcode {
  value: string
  declared_type: string | null
  valid: boolean
  formats: string[]
  suggested_type: string | null
  ambiguous_types: string[] | null
  repair: { value: string; how: string; formats: string[]; suggested_type: string | null } | null
  finding: string | null
}

export interface ExplainAccount {
  account_id: string
  label: string
  account_number: string | null
  is_active: boolean
  is_wholesaler: boolean
  ordering_method: string | null
  ordering_email: string | null
  ordering_url: string | null
  party_id: string
  party_name: string
}

export interface Explain {
  query: { isbn: string | null; inventory_item_id: string | null }
  found: boolean
  shopify: {
    found: boolean
    title?: string | null
    vendor?: string | null
    status?: string | null
    isbn?: string | null
    product_id?: string | null
    variant_id?: string | null
    inventory_item_id?: string | null
    product_admin_url?: string | null
    barcodes?: Barcode[]
  }
  catalogue: {
    catalogued: boolean
    row_id?: string | null
    stored_vendor?: string | null
    shopify_status_seen?: string | null
    account?: ExplainAccount | null
    other_rows?: { row_id: string; is_active: boolean; account: string | null }[]
  }
  resolution: {
    vendor: string | null
    vendor_key: string | null
    candidates: {
      party_id: string; party_name: string; matched_by: string; code: string | null
      has_active_account: boolean; account_label: string | null; chosen: boolean
    }[]
    chosen_party_id: string | null
    chosen_party_name: string | null
    expected_account: ExplainAccount | null
    matches_catalogue: boolean | null
    rule: string | null
  } | null
  orderable: boolean
  chain: Chain | null
  shared_account_number: {
    account_number: string
    also_used_by: { account_label: string; is_active: boolean; party_name: string }[]
  } | null
  setup_request: { id: string; vendor: string; status: string; [k: string]: unknown } | null
  recent_moves: { moved_at: string; source: string | null; from_account: string | null; to_account: string | null; [k: string]: unknown }[]
  open_po_lines: { po_number: string; po_status: string; quantity_ordered: number; quantity_received: number; account: string | null }[]
  problems: Problem[]
}

export async function explainTitle(opts: { isbn?: string; inventoryItemId?: string }): Promise<Explain> {
  const p = new URLSearchParams()
  if (opts.isbn) p.set('isbn', opts.isbn)
  if (opts.inventoryItemId) p.set('inventory_item_id', opts.inventoryItemId)
  return scRequest(`/api/suppliers/explain?${p.toString()}`)
}

// ---------------------------------------------------------------------------
// §4.5 Product vendor (writes to Shopify)
// ---------------------------------------------------------------------------

export interface PlanRow {
  row_id: string
  inventory_item_id: string
  title: string | null
  isbn: string | null
  old_vendor: string | null
  from: { account_id: string; label: string; party_name: string } | null
  to: { account_id: string; label: string; party_name: string } | null
  moves: boolean
}

export interface VendorEditResult {
  applied: boolean
  dry_run: boolean
  product: { product_id: string; title: string | null; status: string | null; isbn: string | null }
  vendor_before: string | null
  vendor_after: string
  plan: {
    vendor: string
    vendor_key: string
    outcome: 'resolved' | 'unclaimed' | 'no_active_account'
    resolves_to: PartyRef | null
    destination_account: { account_id: string; label: string; party_name: string } | null
    ambiguous_with: PartyRef[]
    rows: PlanRow[]
    moves: number
  }
  shopify?: { product_id: string; title: string | null; vendor: string; inventory_item_ids: string[] }
  catalogue?: {
    moved?: number
    rows_logged?: number
    setup_request?: { id: string; vendor: string; status: string; ignore_reason: string | null; created: boolean } | null
    /** Present when Shopify accepted but the catalogue half failed. */
    error?: string
    reconciled_by_next_sync?: boolean
  }
  explain?: Explain
}

/** inventoryItemId: the number or the full GID. */
export async function changeProductVendor(
  inventoryItemId: string, vendor: string, reason: string, dryRun: boolean,
): Promise<VendorEditResult> {
  const id = inventoryItemId.replace(/^gid:\/\/shopify\/InventoryItem\//, '')
  return scRequest(`/api/suppliers/products/${encodeURIComponent(id)}/vendor`, {
    method: 'PATCH', body: JSON.stringify({ vendor, reason, dry_run: dryRun }),
  })
}

// ---------------------------------------------------------------------------
// §4.6 Barcode audit
// ---------------------------------------------------------------------------

export type BarcodeFinding =
  'no_barcode' | 'invalid' | 'repairable' | 'check_digit' | 'nonstandard' | 'type_undeclared' | 'ok'

/** Worst first, as the backend ranks a title by its worst barcode. */
export const BARCODE_FINDINGS: BarcodeFinding[] =
  ['no_barcode', 'invalid', 'repairable', 'check_digit', 'nonstandard', 'type_undeclared', 'ok']

export interface BarcodeAudit {
  summary: { titles: number; by_finding: Record<string, number>; labels: Record<string, string> }
  suppliers: { party_id: string; supplier: string; total: number; needs_work: number; by_finding: Record<string, number> }[]
  count: number
  items: {
    supplier: string | null; account: string | null; vendor: string | null; title: string | null
    shopify_status: string | null; inventory_item_id: string; finding: string; finding_label: string
    barcodes: {
      value: string; type: string | null; finding: string | null; formats: string[]
      suggested_type: string | null; ambiguous_types: string[] | null
      repair: { value: string; how: string; formats: string[]; suggested_type: string | null } | null
    }[]
  }[]
}

export interface BarcodeAuditFilter { finding?: string; partyId?: string; limit?: number }

function auditQuery(f: BarcodeAuditFilter, csv: boolean): string {
  const p = new URLSearchParams()
  if (f.finding) p.set('finding', f.finding)
  if (f.partyId) p.set('party_id', f.partyId)
  if (f.limit) p.set('limit', String(f.limit))
  if (csv) p.set('format', 'csv')
  const s = p.toString()
  return s ? `?${s}` : ''
}

export async function fetchBarcodeAudit(f: BarcodeAuditFilter = {}): Promise<BarcodeAudit> {
  return scRequest(`/api/suppliers/barcode-audit${auditQuery(f, false)}`)
}

/**
 * Used only until the audit's own `summary.labels` arrive. The supplier
 * profile gives finding keys without labels (backend ask), so the profile
 * borrows the audit's wording via loadBarcodeLabels().
 */
export const FALLBACK_BARCODE_LABELS: Record<BarcodeFinding, string> = {
  no_barcode: 'No barcode',
  invalid: 'Invalid for its declared type',
  repairable: 'Damaged code: correction suggested',
  check_digit: 'Check digit wrong (likely a typo)',
  nonstandard: 'Custom code, not a standard barcode',
  type_undeclared: 'Valid, but no type declared',
  ok: 'OK',
}

let labelsPromise: Promise<Record<string, string>> | null = null

/** The audit's finding labels, fetched once per session (one-item audit). */
export function loadBarcodeLabels(): Promise<Record<string, string>> {
  if (!labelsPromise) {
    labelsPromise = fetchBarcodeAudit({ limit: 1 })
      .then(a => ({ ...FALLBACK_BARCODE_LABELS, ...(a.summary.labels ?? {}) }))
      .catch(() => { labelsPromise = null; return { ...FALLBACK_BARCODE_LABELS } })
  }
  return labelsPromise
}

/** The CSV for the current filter, downloaded as a file. */
export async function downloadBarcodeAuditCsv(f: BarcodeAuditFilter = {}): Promise<void> {
  const res = await scRequest<Response>(`/api/suppliers/barcode-audit${auditQuery(f, true)}`, {}, { raw: true })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `barcode-audit${f.finding ? `-${f.finding}` : ''}${f.partyId ? '-supplier' : ''}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}
