// backorderTypes.ts
// Types for the Backorder module. Shapes match backorder-service
// /admin/backorders/* responses (vw_product_overview, vw_order_overview,
// order_lines, actions).

export type UrgencyBucket = 'critical' | 'high' | 'medium' | 'low'

export type BackorderProductStatus =
  | 'backorderable'
  | 'temporarily_oos'
  | 'oop_suspect'
  | 'restock_pending'
  | 'resolved'

export interface BackorderProductRow {
  product_id: number
  variant_id: number | null
  inventory_item_id: number | null
  sku: string | null
  title: string | null
  vendor: string | null
  tags: string[] | null
  available: number | null
  inventory_policy: string | null
  tracked: boolean | null
  status: BackorderProductStatus
  open_backorder_qty: number
  open_orders_count: number
  oldest_open_order_at: string | null
  last_restock_at: string | null
  updated_at: string
  // Supply-chain joins (live from purchase_orders / purchase_order_lines)
  on_order_qty: number
  next_expected_at: string | null
  po_numbers: string[] | null
  lead_time_days: number | null
  // Customer-service state
  last_customer_notified_at: string | null
  unnotified_open_lines: number
  // Urgency
  days_open: number
  urgency_score: number
  urgency_bucket: UrgencyBucket
}

export type BackorderLineStatus = 'open' | 'partial' | 'resolved' | 'cancelled'

export interface BackorderOrderLine {
  order_id: number
  line_item_id: number
  order_name: string | null
  customer_id: number | null
  customer_email: string | null
  product_id: number | null
  variant_id: number | null
  sku: string | null
  title: string | null
  qty_backordered: number
  qty_fulfilled: number
  qty_refunded: number
  qty_cancelled: number
  open_qty: number
  status: BackorderLineStatus
  order_created_at: string | null
  resolved_at: string | null
  last_customer_notified_at: string | null
  notification_count: number
}

export interface BackorderOrderRow {
  order_id: number
  order_name: string | null
  customer_id: number | null
  customer_email: string | null
  order_created_at: string | null
  backorder_lines: number
  total_backordered: number
  open_qty: number
  has_open: boolean
  last_customer_notified_at: string | null
  resolved_at: string | null
  days_open: number
}

export type BackorderActionType =
  | 'po_created'
  | 'po_linked'
  | 'vendor_inquiry'
  | 'eta_updated'
  | 'customer_notified'
  | 'note'
  | 'status_override'

export interface BackorderAction {
  id: string
  scope: 'product' | 'order' | 'order_line'
  product_id: number | null
  order_id: number | null
  line_item_id: number | null
  action_type: BackorderActionType
  details: Record<string, unknown> | null
  purchase_order_id: string | null
  eta_date: string | null
  actor: string | null
  created_at: string
}

export interface BackorderActionCreate {
  scope: 'product' | 'order' | 'order_line'
  action_type: BackorderActionType
  product_id?: number
  order_id?: number
  line_item_id?: number
  details?: Record<string, unknown>
  purchase_order_id?: string
  eta_date?: string
  actor?: string
}

export interface BackorderSummary {
  open_products: number
  units_owed: number
  orders_affected: number
  not_on_order: number
  buckets: Record<UrgencyBucket, number>
  as_of: string
}
