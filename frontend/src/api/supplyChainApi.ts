// supplyChainApi.ts
// All HTTP calls to the supply-chain-service backend.
// No supply chain fetch calls exist anywhere else in the dashboard.
// Mirrors the pattern established in preorderApi.ts.

import type {
  SupplierParty,
  SupplierPartyCreate,
  SupplierAccount,
  SupplierAccountCreate,
  SupplierContact,
  SupplierContactCreate,
  SupplierProduct,
  SupplierDetail,
} from '../supply-chain/suppliers/supplierTypes'

import type {
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderLine,
} from '../supply-chain/purchase-orders/purchaseOrderTypes'

import type {
  ReceiveRequest,
  ReceiveResult,
  Receipt,
} from '../supply-chain/receiving/receivingTypes'

import type {
  InventoryTransfer,
  TransferDetail,
  TransferResult,
} from '../supply-chain/transfers/transferTypes'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SC_BASE_URL = import.meta.env.VITE_SC_BASE_URL as string
const SC_TOKEN    = import.meta.env.VITE_SC_ADMIN_TOKEN as string

if (!SC_BASE_URL) {
  console.error('[supplyChainApi] VITE_SC_BASE_URL is not set')
}

const headers = {
  'Content-Type': 'application/json',
  'X-Admin-Token': SC_TOKEN,
}

// ---------------------------------------------------------------------------
// Base fetch wrapper — throws on non-ok responses with the error body
// ---------------------------------------------------------------------------

async function sc<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${SC_BASE_URL}${path}`
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? body.message ?? detail
    } catch {
      // non-JSON error body
    }
    throw new Error(`[${res.status}] ${detail}`)
  }
  // 204 No Content
  if (res.status === 204) return undefined as T
  return res.json()
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const str = p.toString()
  return str ? `?${str}` : ''
}

// ===========================================================================
// SUPPLIERS
// ===========================================================================

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

export async function fetchSuppliers(opts: {
  activeOnly?: boolean
  role?: string
  search?: string
} = {}): Promise<SupplierParty[]> {
  return sc(`/api/suppliers${qs({
    active_only: opts.activeOnly ?? true,
    role: opts.role,
    search: opts.search,
  })}`)
}

export async function fetchSupplierDetail(partyId: string): Promise<SupplierDetail> {
  return sc(`/api/suppliers/${partyId}`)
}

export async function createSupplier(body: SupplierPartyCreate): Promise<SupplierParty> {
  return sc('/api/suppliers', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateSupplier(
  partyId: string,
  body: Partial<SupplierPartyCreate & { is_active: boolean }>
): Promise<SupplierParty> {
  return sc(`/api/suppliers/${partyId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function deactivateSupplier(partyId: string): Promise<void> {
  return sc(`/api/suppliers/${partyId}`, { method: 'DELETE' })
}

export async function fetchSupplierChildren(partyId: string): Promise<SupplierParty[]> {
  return sc(`/api/suppliers/${partyId}/children`)
}

export async function fetchSuppliersForInventoryItem(
  inventoryItemId: string
): Promise<SupplierProduct[]> {
  return sc(`/api/suppliers/by-inventory-item/${encodeURIComponent(inventoryItemId)}`)
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function createSupplierAccount(
  partyId: string,
  body: Omit<SupplierAccountCreate, 'party_id'>
): Promise<SupplierAccount> {
  return sc(`/api/suppliers/${partyId}/accounts`, {
    method: 'POST',
    body: JSON.stringify({ ...body, party_id: partyId }),
  })
}

export async function updateSupplierAccount(
  accountId: string,
  body: Partial<SupplierAccountCreate>
): Promise<SupplierAccount> {
  return sc(`/api/suppliers/accounts/${accountId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deactivateSupplierAccount(accountId: string): Promise<void> {
  return sc(`/api/suppliers/accounts/${accountId}`, { method: 'DELETE' })
}

export async function fetchAccountProducts(
  accountId: string,
  activeOnly = true
): Promise<SupplierProduct[]> {
  return sc(`/api/suppliers/accounts/${accountId}/products${qs({ active_only: activeOnly })}`)
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function createSupplierContact(
  partyId: string,
  body: Omit<SupplierContactCreate, 'party_id'>
): Promise<SupplierContact> {
  return sc(`/api/suppliers/${partyId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({ ...body, party_id: partyId }),
  })
}

export async function updateSupplierContact(
  contactId: string,
  body: Partial<SupplierContactCreate>
): Promise<SupplierContact> {
  return sc(`/api/suppliers/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteSupplierContact(contactId: string): Promise<void> {
  return sc(`/api/suppliers/contacts/${contactId}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Supplier products (variant ↔ account mappings)
// ---------------------------------------------------------------------------

export async function createSupplierProduct(
  body: Omit<SupplierProduct, 'id' | 'is_active' | 'created_at'>
): Promise<SupplierProduct> {
  return sc('/api/suppliers/products', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateSupplierProduct(
  productId: string,
  body: Partial<Pick<SupplierProduct,
    'supplier_sku' | 'unit_cost' | 'case_pack_size' |
    'minimum_order_qty' | 'lead_time_days' | 'is_primary_supplier' | 'is_active' | 'notes'
  >>
): Promise<SupplierProduct> {
  return sc(`/api/suppliers/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deactivateSupplierProduct(productId: string): Promise<void> {
  return sc(`/api/suppliers/products/${productId}`, { method: 'DELETE' })
}

// ===========================================================================
// PURCHASE ORDERS
// ===========================================================================

export async function fetchPurchaseOrders(opts: {
  status?: string          // comma-separated: 'draft,submitted'
  supplierAccountId?: string
  locationId?: string
  isAdHoc?: boolean
  limit?: number
  offset?: number
} = {}): Promise<PurchaseOrder[]> {
  return sc(`/api/purchase-orders${qs({
    status: opts.status,
    supplier_account_id: opts.supplierAccountId,
    location_id: opts.locationId,
    is_ad_hoc: opts.isAdHoc,
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
  })}`)
}

export async function fetchPurchaseOrderDetail(poId: string): Promise<PurchaseOrderDetail> {
  return sc(`/api/purchase-orders/${poId}`)
}

export async function createPurchaseOrder(body: {
  supplier_account_id: string
  destination_location_id: string
  status?: string
  po_number?: string
  ordered_at?: string
  expected_at?: string
  notes?: string
  is_ad_hoc?: boolean
  ad_hoc_source?: string
  informal_ref?: string
  is_drop_ship?: boolean
  drop_ship_venue_id?: string
  drop_ship_address?: string
}): Promise<PurchaseOrder> {
  return sc('/api/purchase-orders', { method: 'POST', body: JSON.stringify(body) })
}

export async function updatePurchaseOrder(
  poId: string,
  body: Partial<{
    status: string
    ordered_at: string
    expected_at: string
    notes: string
    po_number: string
    is_ad_hoc: boolean
    ad_hoc_source: string
    informal_ref: string
  }>
): Promise<PurchaseOrder> {
  return sc(`/api/purchase-orders/${poId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function cancelPurchaseOrder(poId: string): Promise<void> {
  return sc(`/api/purchase-orders/${poId}`, { method: 'DELETE' })
}

export async function submitPurchaseOrder(poId: string): Promise<PurchaseOrder> {
  return sc(`/api/purchase-orders/${poId}/submit`, { method: 'POST' })
}

export async function confirmPurchaseOrder(poId: string): Promise<PurchaseOrder> {
  return sc(`/api/purchase-orders/${poId}/confirm`, { method: 'POST' })
}

export async function addPOLine(poId: string, body: Omit<PurchaseOrderLine, 'id' | 'purchase_order_id' | 'quantity_received' | 'quantity_backordered' | 'quantity_cancelled' | 'status' | 'created_at'>): Promise<void> {
  return sc(`/api/purchase-orders/${poId}/lines`, {
    method: 'POST',
    body: JSON.stringify({ ...body, purchase_order_id: poId }),
  })
}

export async function updatePOLine(
  lineId: string,
  body: Partial<{ unit_cost: number; quantity_ordered: number; quantity_backordered: number; quantity_cancelled: number; status: string; notes: string }>
): Promise<void> {
  return sc(`/api/purchase-orders/lines/${lineId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function removePOLine(lineId: string): Promise<void> {
  return sc(`/api/purchase-orders/lines/${lineId}`, { method: 'DELETE' })
}

// ===========================================================================
// RECEIVING
// ===========================================================================

export async function receiveOrder(body: ReceiveRequest): Promise<ReceiveResult> {
  return sc('/api/receiving', { method: 'POST', body: JSON.stringify(body) })
}

export async function fetchReceiptsForPO(poId: string): Promise<Receipt[]> {
  return sc(`/api/receiving/po/${poId}`)
}

export async function fetchReceipt(receiptId: string): Promise<{ receipt: Receipt; lines: unknown[] }> {
  return sc(`/api/receiving/${receiptId}`)
}

export async function parsePackingSlip(file: File): Promise<{
  lines: Array<{
    supplier_sku: string | null
    isbn: string | null
    title: string | null
    quantity: number | null
    unit_cost: number | null
    confidence: number
    needs_review: boolean
  }>
  stub: boolean
}> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${SC_BASE_URL}/api/receiving/parse-packing-slip`, {
    method: 'POST',
    headers: { 'X-Admin-Token': SC_TOKEN },
    body: form,
  })
  if (!res.ok) throw new Error(`[${res.status}] Failed to parse packing slip`)
  return res.json()
}

// ===========================================================================
// TRANSFERS
// ===========================================================================

export async function fetchTransfers(opts: {
  status?: string
  fromLocationId?: string
  toLocationId?: string
  limit?: number
  offset?: number
} = {}): Promise<InventoryTransfer[]> {
  return sc(`/api/transfers${qs({
    status: opts.status,
    from_location_id: opts.fromLocationId,
    to_location_id: opts.toLocationId,
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
  })}`)
}

export async function fetchTransferDetail(transferId: string): Promise<TransferDetail> {
  return sc(`/api/transfers/${transferId}`)
}

export async function dispatchTransfer(body: {
  from_location_id: string
  to_location_id: string
  lines: Array<{ inventory_item_id: string; variant_id: string; quantity_sent: number }>
  notes?: string
}): Promise<TransferResult> {
  return sc('/api/transfers', { method: 'POST', body: JSON.stringify(body) })
}

export async function receiveTransfer(
  transferId: string,
  body: {
    lines: Array<{
      transfer_line_id: string
      inventory_item_id: string
      quantity_received: number
      quantity_damaged: number
    }>
    notes?: string
  }
): Promise<TransferResult> {
  return sc(`/api/transfers/${transferId}/receive`, {
    method: 'POST',
    body: JSON.stringify({ transfer_id: transferId, ...body }),
  })
}

export async function cancelTransfer(transferId: string): Promise<void> {
  return sc(`/api/transfers/${transferId}`, { method: 'DELETE' })
}

// ===========================================================================
// RECONCILIATION (audit / admin use)
// ===========================================================================

export async function fetchInventoryEvents(opts: {
  status?: string
  sourceType?: string
  inventoryItemId?: string
  limit?: number
  offset?: number
} = {}): Promise<unknown[]> {
  return sc(`/api/inventory-events${qs({
    status: opts.status,
    source_type: opts.sourceType,
    inventory_item_id: opts.inventoryItemId,
    limit: opts.limit ?? 100,
    offset: opts.offset ?? 0,
  })}`)
}

export async function fetchFlaggedSnapshots(): Promise<unknown[]> {
  return sc('/api/reconciliation/snapshots?flagged_only=true')
}

// ===========================================================================
// SUPPLIER SYNC
// ===========================================================================

export interface SupplierSyncResult {
  run_at: string
  shopify_product_count: number
  new_parties_created: number
  new_products_created: number
  stale_products_deactivated: number
  unrecognized_vendors: string[]
  unrecognized_count: number
  duration_seconds: number
  error_message: string | null
}

export async function triggerSupplierSync(): Promise<SupplierSyncResult> {
  return sc('/api/suppliers/sync', { method: 'POST' })
}

export async function fetchSupplierSyncLog(limit = 10): Promise<SupplierSyncResult[]> {
  return sc(`/api/suppliers/sync/log?limit=${limit}`)
}

export async function fetchUnrecognizedVendors(): Promise<{
  run_at: string | null
  unrecognized_vendors: string[]
  unrecognized_count: number
}> {
  return sc('/api/suppliers/sync/unrecognized')
}

// ===========================================================================
// LOCATIONS
// ===========================================================================

export interface Location {
  id: string             // Shopify GID: gid://shopify/Location/...
  name: string           // "Kitchen Arts & Letters", "FiDi Satellite"
  address: string | null
  is_active: boolean
  is_fulfillment: boolean
  is_seasonal: boolean
  active_from: string | null
  active_until: string | null
  shopify_synced_at: string | null
}

export interface LocationSyncResult {
  synced: number
  created: number
  updated: number
  deactivated: number
}

export async function fetchLocations(): Promise<Location[]> {
  return sc('/api/locations')
}

export async function syncLocations(): Promise<LocationSyncResult> {
  return sc('/api/locations/sync', { method: 'POST' })
}

// ===========================================================================
// ADDITIONS FOR POBuilder — append to supplyChainApi.ts
// ===========================================================================

// Variant search — used by POBuilder line item search
export interface VariantSearchResult {
  inventory_item_id: string
  variant_id: string
  title: string
  isbn: string
  vendor: string
}

export async function searchVariants(query: string): Promise<VariantSearchResult[]> {
  return sc(`/api/suppliers/products/search${qs({ q: query, limit: 15 })}`)
}

// Create a PO line
export async function createPOLine(
  poId: string,
  body: {
    inventory_item_id: string
    variant_id: string
    quantity_ordered: number
    unit_cost?: number
    notes?: string
  }
): Promise<unknown> {
  return sc(`/api/purchase-orders/${poId}/lines`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// Submit a draft PO
export async function submitPO(poId: string): Promise<unknown> {
  return sc(`/api/purchase-orders/${poId}/submit`, { method: 'POST' })
}

// ===========================================================================
// ADDITIONS FOR gap-fixes — append to supplyChainApi.ts
// ===========================================================================

// ---------------------------------------------------------------------------
// Receipt history — linked to a PO
// ---------------------------------------------------------------------------

export interface ReceiptRecord {
  id: string
  purchase_order_id: string
  location_id: string
  receipt_type: string
  status: string
  notes: string | null
  received_at: string
  shopify_adjustment_group_id: string | null
}

export interface ReceiptLineRecord {
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
  // Joined from inventory_events via source_id
  shopify_group_id?: string
  delta?: number
}

export async function fetchPOReceipts(poId: string): Promise<ReceiptRecord[]> {
  return sc(`/api/receiving/po/${poId}`)
}

export async function fetchReceiptLines(receiptId: string): Promise<{ receipt: ReceiptRecord; lines: ReceiptLineRecord[] }> {
  return sc(`/api/receiving/${receiptId}`)
}

// ---------------------------------------------------------------------------
// POTable badge support — ad hoc fields in list response
// ---------------------------------------------------------------------------
// The list endpoint should return is_ad_hoc, ad_hoc_source, informal_ref.
// Verify the backend GET /api/purchase-orders response includes these fields.
// If not, update the Pydantic model in app/models/purchase_order.py to include them
// in the PurchaseOrderRow response.

// Corrected endpoint paths:
// fetchPOReceipts → GET /api/receiving/po/{poId}
// fetchReceiptLines → GET /api/receiving/{receiptId}  (returns receipt + lines together)

// PO lookup result — includes match_type from the backend resolver
export interface POLookupResult extends PurchaseOrder {
  match_type: 'exact' | 'fuzzy'
}

// Look up POs from a packing slip PO number or supplier name
export async function lookupPurchaseOrders(opts: {
  poNumber?: string
  supplierName?: string
}): Promise<POLookupResult[]> {
  return sc(`/api/purchase-orders/lookup${qs({
    po_number:     opts.poNumber,
    supplier_name: opts.supplierName,
  })}`)
}

// Search Shopify catalog by ISBN barcode — used to resolve packing slip lines
// Returns existing supplier_products records if found
export async function lookupProductByISBN(isbn: string): Promise<VariantSearchResult[]> {
  return sc(`/api/suppliers/products/search${qs({ q: isbn, limit: 5 })}`)
}
