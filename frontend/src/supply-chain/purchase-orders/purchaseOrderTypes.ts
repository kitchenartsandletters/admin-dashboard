// purchaseOrderTypes.ts
// Mirrors supply-chain-service/app/models/purchase_order.py

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

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  partial: 'Partial',
  received: 'Received',
  cancelled: 'Cancelled',
}

export const PO_STATUS_COLORS: Record<POStatus, string> = {
  draft:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  confirmed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  partial:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  received:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
}

export const PO_LINE_STATUS_COLORS: Record<POLineStatus, string> = {
  open:        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  partial:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  received:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  backordered: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  cancelled:   'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
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
  is_ad_hoc: boolean
  ad_hoc_source: AdHocSource | null
  informal_ref: string | null
  created_by: string | null
  created_at: string
  updated_at: string
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
}

export interface PurchaseOrderDetail {
  order: PurchaseOrder
  lines: PurchaseOrderLine[]
}

export interface POLineCreate {
  purchase_order_id: string
  inventory_item_id: string
  variant_id: string
  unit_cost?: number
  quantity_ordered: number
  notes?: string
}
