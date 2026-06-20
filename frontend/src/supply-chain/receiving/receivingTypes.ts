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

// UI state for each active (non-received) line in the wizard.
// Damage fields:
//   quantity_damaged   — set by the damage section in the line row
//   damage_disposal    — UI only (donate_destroy / return) — goes into notes
//   damage_resolution  — credit closes the line; replacement_pending keeps it open
export interface WizardLine {
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
