// receivingTypes.ts
// Mirrors supply-chain-service/app/models/receiving.py
//
// Key decisions:
//   - ReceiveLineInput uses quantity_damaged: number (matches backend ReceiveLineInput)
//     The wizard always sends quantity_damaged: 0 — no Shopify damage state mutation.
//   - WizardLine keeps notes_damaged: string | null for the UI text note field.
//     This note is folded into the receipt-level notes before submission.
//   - ReceiptStatus includes 'test_applied' for test mode POs.

export type ReceiptStatus =
  | 'pending'
  | 'applied'
  | 'partial'
  | 'failed'
  | 'test_applied'

export type ReceiptLineStatus = 'pending' | 'applied' | 'failed' | 'skipped'

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
  quantity_received: number
  restock_idempotency_key: string
  damage_idempotency_key: string | null
  restock_applied_at: string | null
  damage_applied_at: string | null
  status: ReceiptLineStatus
  error_message: string | null
}

// What the UI sends to the backend per line.
// quantity_damaged is always 0 — damage is noted in receipt notes, not mutated in Shopify.
export interface ReceiveLineInput {
  purchase_order_line_id: string
  inventory_item_id: string
  quantity_received: number
  quantity_damaged: number   // always 0 — kept for backend compatibility
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

// UI state for each line in the wizard before submission.
// notes_damaged: free-text note for staff (e.g. "2 copies water damaged").
// This is folded into receipt notes on submit — not sent as a per-line field.
export interface WizardLine {
  purchase_order_line_id: string
  inventory_item_id: string
  variant_id: string
  title: string              // from PO line, enriched by detail endpoint
  isbn: string | null        // from PO line, enriched by detail endpoint
  quantity_ordered: number
  quantity_previously_received: number
  quantity_received: number
  notes_damaged: string | null  // UI only — folded into receipt notes on submit
}