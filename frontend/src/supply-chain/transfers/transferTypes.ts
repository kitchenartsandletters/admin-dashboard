// transferTypes.ts
// Mirrors supply-chain-service/app/models/transfer.py

export type TransferStatus =
  | 'pending'
  | 'in_transit'
  | 'received'
  | 'partial'
  | 'cancelled'

export type TransferLineStatus =
  | 'pending'
  | 'decrement_applied'
  | 'received'
  | 'failed'
  | 'cancelled'

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  pending:    'Pending',
  in_transit: 'In Transit',
  received:   'Received',
  partial:    'Partial',
  cancelled:  'Cancelled',
}

export const TRANSFER_STATUS_COLORS: Record<TransferStatus, string> = {
  pending:    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  in_transit: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  received:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  partial:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  cancelled:  'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
}

export interface InventoryTransfer {
  id: string
  from_location_id: string
  to_location_id: string
  status: TransferStatus
  notes: string | null
  initiated_by: string | null
  created_at: string
  received_at: string | null
}

export interface InventoryTransferLine {
  id: string
  transfer_id: string
  inventory_item_id: string
  variant_id: string
  quantity_sent: number
  quantity_received: number | null
  quantity_damaged: number
  shopify_decrement_key: string
  shopify_increment_key: string
  damage_key: string | null
  decrement_applied_at: string | null
  increment_applied_at: string | null
  damage_applied_at: string | null
  status: TransferLineStatus
}

export interface TransferDetail {
  transfer: InventoryTransfer
  lines: InventoryTransferLine[]
}

export interface TransferResult {
  transfer_id: string
  status: TransferStatus
  lines_applied: number
  lines_failed: number
  errors: string[]
}
