// purchaseOrderTypes.ts
// Type definitions for purchase orders and lines.
// Reflects the full database schema including ad hoc fields added in migration 005.

export type POStatus =
  | 'draft'
  | 'submitted'
  | 'confirmed'
  | 'partial'
  | 'received'
  | 'cancelled'

export type POLineStatus =
  | 'open'
  | 'partial'
  | 'received'
  | 'backordered'
  | 'cancelled'

export type AdHocSource =
  | 'email'
  | 'phone'
  | 'invoice'
  | 'packing_slip'
  | 'verbal'
  | 'other'

export const AD_HOC_SOURCE_LABELS: Record<AdHocSource, string> = {
  email:        'Email',
  phone:        'Phone',
  invoice:      'Invoice',
  packing_slip: 'Packing slip',
  verbal:       'Verbal',
  other:        'Other',
}

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft:     'Draft',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  partial:   'Partial',
  received:  'Received',
  cancelled: 'Cancelled',
}

export const PO_STATUS_COLORS: Record<POStatus, string> = {
  draft:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  confirmed: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  partial:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  received:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
}

export interface PurchaseOrder {
  id: string
  supplier_account_id: string
  destination_location_id: string
  status: POStatus
  po_number: string
  ordered_at: string | null
  expected_at: string | null
  notes: string | null

  // Ad hoc fields
  is_ad_hoc: boolean
  ad_hoc_source: AdHocSource | null
  informal_ref: string | null

  // Supersession fields
  supersedes_ids: string[]
  superseded_by: string | null
  cancellation_reason: string | null
  cancelled_at: string | null

  // Drop-ship fields
  is_drop_ship: boolean
  drop_ship_venue_id: string | null
  drop_ship_address: string | null

  created_by: string | null
  created_at: string
  updated_at: string

  // Joined fields (populated by API when joining supplier data)
  supplier_name?: string       // supplier_parties.name
  account_label?: string       // supplier_accounts.label
}

export interface PurchaseOrderLine {
  id: string
  purchase_order_id: string
  inventory_item_id: string
  variant_id: string
  unit_cost: number | null
  quantity_ordered: number
  quantity_received: number
  quantity_backordered: number
  quantity_cancelled: number
  status: POLineStatus
  notes: string | null
  created_at: string
  // Populated by API from supplier_products
  title?: string
  isbn?: string
  supplier_sku?: string
}

export interface PurchaseOrderDetail {
  order: PurchaseOrder
  lines: PurchaseOrderLine[]
}

// Receipt types — for displaying receiving history linked to a PO
export interface Receipt {
  id: string
  purchase_order_id: string
  location_id: string
  receipt_type: string
  status: 'pending' | 'applied' | 'failed' | 'partial'
  notes: string | null
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
  restock_applied_at: string | null
  damage_applied_at: string | null
  status: string
  error_message: string | null
  // Joined from inventory_events
  shopify_group_id?: string
  delta?: number
}
