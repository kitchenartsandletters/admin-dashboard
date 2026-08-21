// receivingTypes.ts
// Mirrors supply-chain-service/app/models/receiving.py
//
// Damage handling (#29):
//   quantity_received  — HARD RULE: undamaged copies only. This is what goes
//                        to Shopify. Never includes damaged units.
//   quantity_damaged   — copies that arrived damaged. Tracked per line for
//                        records and claim management. No Shopify mutation.
//   damage_disposal    — UI only, folded into receipt notes. Tells staff what
//                        to do with the physical damaged copies:
//                          'donate_destroy' — keep/donate/put in sale carton
//                          'return'         — return with call tag from publisher
//   damage_resolution  — what happens to the gap left by damaged copies:
//                          'credit'              — publisher credits account,
//                                                  line closes at quantity_received
//                          'replacement_pending' — publisher reshipping on same
//                                                  PO number, line stays open
//                          null                  — no damage, or not yet resolved
//
// Receiving decision support:
//   on_hand / committed / current_price / list_price / price_mismatch /
//   stock_alert are NOT stored anywhere. The backend attaches them to each PO
//   line at request time from live Shopify state
//   (app/routes/po_enrich.attach_stock_and_price), so a receiver can see
//   existing stock and price disagreements without opening each product page.
//
//   null/undefined means "not looked up / lookup failed" and MUST render
//   differently from 0, which means "none on the shelf". Showing 0 for a failed
//   lookup would wrongly tell a receiver nothing is waiting on the title.

export type ReceiptStatus =
  | 'pending'
  | 'applied'
  | 'partial'
  | 'failed'
  | 'test_applied'

export type ReceiptLineStatus = 'pending' | 'applied' | 'failed' | 'skipped'

export type DamageDisposal    = 'donate_destroy' | 'return'
export type DamageResolution  = 'credit' | 'replacement_pending'

export interface Receipt {
  id: string
  purchase_order_id: string
  location_id: string
  receipt_type: 'full' | 'partial'
  status: ReceiptStatus
  notes: string | null
  received_by: string | null
  received_at: string
  shopify_adjustment_group_id: string | null
}

export interface ReceiptLine {
  id: string
  receipt_id: string
  purchase_order_line_id: string
  inventory_item_id: string
  quantity_received: number   // undamaged copies only
  quantity_damaged: number
  restock_idempotency_key: string
  damage_idempotency_key: string | null
  restock_applied_at: string | null
  damage_applied_at: string | null
  status: ReceiptLineStatus
  error_message: string | null
}

// What the UI sends to the backend per line.
// quantity_received = undamaged copies only (hard rule).
// damage_disposal is UI-only — it is NOT sent to the backend;
// it is folded into the receipt-level notes string before submission.
export interface ReceiveLineInput {
  purchase_order_line_id: string
  inventory_item_id: string
  quantity_received:  number                    // undamaged copies only — goes to Shopify
  quantity_damaged:   number                    // tracked only, no Shopify mutation
  damage_resolution:  DamageResolution | null   // null = no damage or not yet known
}

export interface ReceiveRequest {
  purchase_order_id: string
  location_id: string
  receipt_type: 'full' | 'partial'
  lines: ReceiveLineInput[]
  notes?: string
}

export interface ReceiveResult {
  receipt_id: string
  status: ReceiptStatus
  lines_applied: number
  lines_failed: number
  lines_skipped: number
  errors: string[]
}

// Live Shopify context the backend attaches to each PO line. Shared by the
// wizard line state and anything else that renders a PO line.
//
// Every numeric field is nullable on purpose: null = unknown (not fetched, or
// the Shopify lookup failed), which is NOT the same as 0.
export interface LineStockContext {
  on_hand:        number | null   // units at the PO's destination
  committed:      number | null   // units reserved by unfulfilled orders
  available:      number | null   // on_hand - committed
  current_price:  number | null   // live Shopify retail price
  list_price:     number | null   // publisher list price (mirrors unit_cost)
  price_mismatch: boolean | null  // true when Shopify disagrees with list price
  // on_hand > 0 AND committed > 0: copies are already here with customer orders
  // waiting on them — the "backordered but never shipped" case. Warn loudly;
  // never block receiving on it.
  stock_alert:    boolean
}

// UI state for each active (non-received) line in the wizard.
// Damage fields:
//   quantity_damaged   — set by the damage section in the line row
//   damage_disposal    — UI only (donate_destroy / return) — goes into notes
//   damage_resolution  — credit closes the line; replacement_pending keeps it open
//
// Stock/price fields are read-only decision support, never sent back to the
// backend. They extend Partial<LineStockContext> rather than LineStockContext
// so that a line built anywhere that hasn't been enriched yet still type-checks;
// an absent field reads as unknown, exactly like null. Renderers must treat
// undefined and null identically and must never coerce either to 0.
export interface WizardLine extends Partial<LineStockContext> {
  purchase_order_line_id: string
  inventory_item_id: string
  variant_id: string
  title: string
  isbn: string | null
  quantity_ordered: number
  quantity_previously_received: number
  quantity_received: number              // undamaged copies staff are restocking
  quantity_damaged: number               // damaged copies (NOT added to quantity_received)
  damage_disposal:   DamageDisposal | null    // UI only — folded into notes on submit
  damage_resolution: DamageResolution | null  // sent to backend
}

// Default stock context for a line built before/without backend enrichment.
// Everything unknown, no alert — so a line that was never enriched can't
// masquerade as "0 on hand, nothing waiting".
export const EMPTY_STOCK_CONTEXT: LineStockContext = {
  on_hand:        null,
  committed:      null,
  available:      null,
  current_price:  null,
  list_price:     null,
  price_mismatch: null,
  stock_alert:    false,
}

// Pull the decision-support fields off a raw PO line from the API.
// Tolerates lines from an older backend (fields simply absent -> unknown).
export function stockContextFromLine(line: any): LineStockContext {
  if (!line) return { ...EMPTY_STOCK_CONTEXT }
  const num = (v: any): number | null =>
    v === null || v === undefined || v === '' ? null : Number(v)
  return {
    on_hand:        num(line.on_hand),
    committed:      num(line.committed),
    available:      num(line.available),
    current_price:  num(line.current_price),
    list_price:     num(line.list_price),
    price_mismatch: line.price_mismatch === null || line.price_mismatch === undefined
                      ? null
                      : Boolean(line.price_mismatch),
    stock_alert:    Boolean(line.stock_alert),
  }
}

// Formatting helpers so every surface renders these signals identically —
// and so "unknown" can never be accidentally displayed as 0.
export function formatStockCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value)
}

export function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `$${value.toFixed(2)}`
}
