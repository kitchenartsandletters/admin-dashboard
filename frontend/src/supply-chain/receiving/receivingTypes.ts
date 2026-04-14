// receivingTypes.ts
// Mirrors supply-chain-service/app/models/receiving.py

export type ReceiptStatus = 'pending' | 'applied' | 'partial' | 'failed'
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
  quantity_damaged: number
  restock_idempotency_key: string
  damage_idempotency_key: string | null
  restock_applied_at: string | null
  damage_applied_at: string | null
  status: ReceiptLineStatus
  error_message: string | null
}

// What the UI sends for each line in the receiving wizard
export interface ReceiveLineInput {
  purchase_order_line_id: string
  inventory_item_id: string
  quantity_received: number
  quantity_damaged: number
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

// State for each line in the wizard UI before submission
export interface WizardLine {
  purchase_order_line_id: string
  inventory_item_id: string
  variant_id: string
  title: string           // display only — from PO line context
  quantity_ordered: number
  quantity_previously_received: number
  quantity_received: number
  quantity_damaged: number
}
