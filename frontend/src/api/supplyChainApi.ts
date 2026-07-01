// supplyChainApi.ts
// All HTTP calls to the supply-chain-service backend.

import type {
  SupplierParty, SupplierPartyCreate,
  SupplierAccount, SupplierAccountCreate,
  SupplierContact, SupplierContactCreate,
  SupplierProduct, SupplierDetail,
} from '../supply-chain/suppliers/supplierTypes'
import type {
  PurchaseOrder, PurchaseOrderDetail, PurchaseOrderLine,
} from '../supply-chain/purchase-orders/purchaseOrderTypes'
import type {
  ReceiveRequest, ReceiveResult, Receipt, DamageResolution,
} from '../supply-chain/receiving/receivingTypes'
import type {
  InventoryTransfer, TransferDetail, TransferResult,
} from '../supply-chain/transfers/transferTypes'

const SC_BASE_URL = import.meta.env.VITE_SC_BASE_URL as string
const SC_TOKEN    = import.meta.env.VITE_SC_ADMIN_TOKEN as string
if (!SC_BASE_URL) console.error('[supplyChainApi] VITE_SC_BASE_URL is not set')
const headers = { 'Content-Type': 'application/json', 'X-Admin-Token': SC_TOKEN }

async function sc<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SC_BASE_URL}${path}`, { ...options, headers: { ...headers, ...options.headers } })
  if (!res.ok) {
    let detail = res.statusText
    try { const body = await res.json(); detail = body.detail ?? body.message ?? detail } catch {}
    throw new Error(`[${res.status}] ${detail}`)
  }
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

async function _downloadBlob(path: string, filename: string): Promise<void> {
  const res = await fetch(`${SC_BASE_URL}${path}`, { method: 'GET', headers: { 'X-Admin-Token': SC_TOKEN } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `[${res.status}] Failed to generate PDF`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

async function _multipartPost<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${SC_BASE_URL}${path}`, { method: 'POST', headers: { 'X-Admin-Token': SC_TOKEN }, body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `[${res.status}] Request failed`)
  }
  return res.json()
}

// ===========================================================================
// SUPPLIERS
// ===========================================================================
export async function fetchSuppliers(opts: { activeOnly?: boolean; role?: string; search?: string } = {}): Promise<SupplierParty[]> {
  return sc(`/api/suppliers${qs({ active_only: opts.activeOnly ?? true, role: opts.role, search: opts.search })}`)
}
export async function fetchSupplierDetail(partyId: string): Promise<SupplierDetail> { return sc(`/api/suppliers/${partyId}`) }
export async function createSupplier(body: SupplierPartyCreate): Promise<SupplierParty> { return sc('/api/suppliers', { method: 'POST', body: JSON.stringify(body) }) }
export async function updateSupplier(partyId: string, body: Partial<SupplierPartyCreate & { is_active: boolean }>): Promise<SupplierParty> { return sc(`/api/suppliers/${partyId}`, { method: 'PATCH', body: JSON.stringify(body) }) }
export async function deactivateSupplier(partyId: string): Promise<void> { return sc(`/api/suppliers/${partyId}`, { method: 'DELETE' }) }
export async function fetchSupplierChildren(partyId: string): Promise<SupplierParty[]> { return sc(`/api/suppliers/${partyId}/children`) }
export async function fetchSuppliersForInventoryItem(inventoryItemId: string): Promise<SupplierProduct[]> { return sc(`/api/suppliers/by-inventory-item/${encodeURIComponent(inventoryItemId)}`) }
export async function createSupplierAccount(partyId: string, body: Omit<SupplierAccountCreate, 'party_id'>): Promise<SupplierAccount> {
  return sc(`/api/suppliers/${partyId}/accounts`, { method: 'POST', body: JSON.stringify({ ...body, party_id: partyId }) })
}
export async function updateSupplierAccount(accountId: string, body: Partial<SupplierAccountCreate>): Promise<SupplierAccount> {
  return sc(`/api/suppliers/accounts/${accountId}`, { method: 'PATCH', body: JSON.stringify(body) })
}
export async function deactivateSupplierAccount(accountId: string): Promise<void> { return sc(`/api/suppliers/accounts/${accountId}`, { method: 'DELETE' }) }
export async function fetchAccountProducts(accountId: string, activeOnly = true): Promise<SupplierProduct[]> {
  return sc(`/api/suppliers/accounts/${accountId}/products${qs({ active_only: activeOnly })}`)
}
export async function createSupplierContact(partyId: string, body: Omit<SupplierContactCreate, 'party_id'>): Promise<SupplierContact> {
  return sc(`/api/suppliers/${partyId}/contacts`, { method: 'POST', body: JSON.stringify({ ...body, party_id: partyId }) })
}
export async function updateSupplierContact(contactId: string, body: Partial<SupplierContactCreate>): Promise<SupplierContact> {
  return sc(`/api/suppliers/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify(body) })
}
export async function deleteSupplierContact(contactId: string): Promise<void> { return sc(`/api/suppliers/contacts/${contactId}`, { method: 'DELETE' }) }
export async function createSupplierProduct(body: Omit<SupplierProduct, 'id' | 'is_active' | 'created_at'>): Promise<SupplierProduct> {
  return sc('/api/suppliers/products', { method: 'POST', body: JSON.stringify(body) })
}
export async function updateSupplierProduct(productId: string, body: Partial<Pick<SupplierProduct, 'supplier_sku' | 'unit_cost' | 'case_pack_size' | 'minimum_order_qty' | 'lead_time_days' | 'is_primary_supplier' | 'is_active' | 'notes'>>): Promise<SupplierProduct> {
  return sc(`/api/suppliers/products/${productId}`, { method: 'PATCH', body: JSON.stringify(body) })
}
export async function deactivateSupplierProduct(productId: string): Promise<void> { return sc(`/api/suppliers/products/${productId}`, { method: 'DELETE' }) }

export interface VariantSearchResult {
  inventory_item_id: string
  variant_id: string
  title: string
  isbn: string
  vendor: string
}
export async function searchVariants(query: string): Promise<VariantSearchResult[]> { return sc(`/api/suppliers/products/search${qs({ q: query, limit: 15 })}`) }
export async function lookupProductByISBN(isbn: string): Promise<VariantSearchResult[]> { return sc(`/api/suppliers/products/search${qs({ q: isbn, limit: 5 })}`) }

export interface ShopifyLookupResult {
  found: boolean
  registered: boolean
  not_in_shopify?: boolean
  unrecognized_vendor?: boolean
  vendor?: string
  title?: string
  isbn?: string
  inventory_item_id?: string
  variant_id?: string
  shopify_status?: string
  record?: { id: string; inventory_item_id: string; variant_id: string; title: string | null; isbn: string | null; vendor: string | null; is_active: boolean }
}
export async function searchShopifyByISBN(isbn: string): Promise<ShopifyLookupResult> { return sc(`/api/suppliers/products/search-shopify${qs({ isbn })}`) }
export async function syncSingleProduct(isbn: string): Promise<{ synced: boolean; not_in_shopify?: boolean; unrecognized_vendor?: boolean; vendor?: string; title?: string; inventory_item_id?: string; record?: unknown }> {
  return sc(`/api/suppliers/sync/product${qs({ isbn })}`, { method: 'POST' })
}

// ===========================================================================
// PURCHASE ORDERS
// ===========================================================================
export async function fetchPurchaseOrders(opts: { status?: string; supplierAccountId?: string; locationId?: string; isAdHoc?: boolean; search?: string; limit?: number; offset?: number } = {}): Promise<PurchaseOrder[]> {
  return sc(`/api/purchase-orders${qs({ status: opts.status, supplier_account_id: opts.supplierAccountId, location_id: opts.locationId, is_ad_hoc: opts.isAdHoc, search: opts.search, limit: opts.limit ?? 100, offset: opts.offset ?? 0 })}`)
}
export async function fetchPurchaseOrderDetail(poId: string): Promise<PurchaseOrderDetail> { return sc(`/api/purchase-orders/${poId}`) }
export async function createPurchaseOrder(body: { supplier_account_id: string; destination_location_id: string; status?: string; po_number?: string; ordered_at?: string; expected_at?: string; notes?: string; is_ad_hoc?: boolean; ad_hoc_source?: string; informal_ref?: string; is_drop_ship?: boolean; drop_ship_venue_id?: string; drop_ship_address?: string; is_test?: boolean }): Promise<PurchaseOrder> {
  return sc('/api/purchase-orders', { method: 'POST', body: JSON.stringify(body) })
}
export async function updatePurchaseOrder(poId: string, body: Partial<{ status: string; ordered_at: string; expected_at: string; notes: string; po_number: string; is_ad_hoc: boolean; ad_hoc_source: string; informal_ref: string }>): Promise<PurchaseOrder> {
  return sc(`/api/purchase-orders/${poId}`, { method: 'PATCH', body: JSON.stringify(body) })
}
export async function cancelPurchaseOrder(poId: string): Promise<void> { return sc(`/api/purchase-orders/${poId}`, { method: 'DELETE' }) }
export async function submitPurchaseOrder(poId: string): Promise<PurchaseOrder> { return sc(`/api/purchase-orders/${poId}/submit`, { method: 'POST' }) }
export async function confirmPurchaseOrder(poId: string): Promise<PurchaseOrder> { return sc(`/api/purchase-orders/${poId}/confirm`, { method: 'POST' }) }
export async function archiveTestPOs(): Promise<{ archived_count: number }> { return sc('/api/purchase-orders/archive-test-pos', { method: 'POST' }) }
export const submitPO = submitPurchaseOrder
export async function addPOLine(poId: string, body: Omit<PurchaseOrderLine, 'id' | 'purchase_order_id' | 'quantity_received' | 'quantity_backordered' | 'quantity_cancelled' | 'status' | 'created_at'>): Promise<void> {
  return sc(`/api/purchase-orders/${poId}/lines`, { method: 'POST', body: JSON.stringify({ ...body, purchase_order_id: poId }) })
}
export async function createPOLine(poId: string, body: { inventory_item_id: string; variant_id: string; quantity_ordered: number; unit_cost?: number; notes?: string }): Promise<PurchaseOrderLine> {
  return sc(`/api/purchase-orders/${poId}/lines`, { method: 'POST', body: JSON.stringify({ ...body, purchase_order_id: poId }) })
}
export async function updatePOLine(lineId: string, body: Partial<{ unit_cost: number; quantity_ordered: number; quantity_backordered: number; quantity_cancelled: number; status: string; notes: string }>): Promise<void> {
  return sc(`/api/purchase-orders/lines/${lineId}`, { method: 'PATCH', body: JSON.stringify(body) })
}
export async function removePOLine(lineId: string): Promise<void> { return sc(`/api/purchase-orders/lines/${lineId}`, { method: 'DELETE' }) }
export interface POLookupResult extends PurchaseOrder { match_type: 'exact' | 'fuzzy' }
export async function lookupPurchaseOrders(opts: { poNumber?: string; supplierName?: string }): Promise<POLookupResult[]> {
  return sc(`/api/purchase-orders/lookup${qs({ po_number: opts.poNumber, supplier_name: opts.supplierName })}`)
}
export async function downloadPOPdf(poId: string, poNumber: string): Promise<void> { return _downloadBlob(`/api/purchase-orders/${poId}/pdf`, `KAL-${poNumber}.pdf`) }
export async function downloadReceiptPdf(receiptId: string): Promise<void> {
  const shortId = receiptId.slice(0, 8).toUpperCase()
  return _downloadBlob(`/api/receiving/${receiptId}/pdf`, `KAL-RECEIPT-${shortId}.pdf`)
}

// Order-image → draft PO lines (#56). Used by the PO builder's image-scan path.
// Reuses the receiving vision parser server-side, then resolves each parsed
// ISBN to a catalog product so matched lines arrive ready to add to a PO.
export interface ParsedOrderLine {
  isbn: string | null; title: string | null; supplier_sku: string | null
  quantity: number | null; unit_cost: number | null; confidence: number; needs_review: boolean
}
export interface MatchedOrderLine extends ParsedOrderLine {
  inventory_item_id: string; variant_id: string; vendor: string | null
}
export interface OrderImageParseResult {
  matched: MatchedOrderLine[]; unmatched: ParsedOrderLine[]
  supplier_name: string | null
  supplier_guess: { party_id: string; name: string; matched_on: string } | null
  invoice_number: string | null; invoice_date: string | null
  matched_count: number; unmatched_count: number; stub: boolean
}
export async function parseOrderImage(file: File): Promise<OrderImageParseResult> { return _multipartPost('/api/purchase-orders/parse-order-image', file) }

// ===========================================================================
// RECEIVING
// ===========================================================================
export async function receiveOrder(body: ReceiveRequest): Promise<ReceiveResult> { return sc('/api/receiving', { method: 'POST', body: JSON.stringify(body) }) }
export async function fetchReceiptsForPO(poId: string): Promise<Receipt[]> { return sc(`/api/receiving/po/${poId}`) }
export async function fetchReceipt(receiptId: string): Promise<{ receipt: Receipt; lines: unknown[] }> { return sc(`/api/receiving/${receiptId}`) }
export async function fetchReceiptHistory(opts: { limit?: number; status?: string; search?: string } = {}): Promise<unknown[]> {
  return sc(`/api/receiving/history${qs({ limit: opts.limit ?? 100, status: opts.status, search: opts.search })}`)
}
export async function resolveDamage(poLineId: string, resolution: DamageResolution): Promise<{ po_line_id: string; damage_resolution: DamageResolution; line_status: string; po_status: string; updated: boolean }> {
  return sc(`/api/receiving/lines/${poLineId}/damage`, { method: 'PATCH', body: JSON.stringify({ damage_resolution: resolution }) })
}

// Supply status — records publisher-side fulfillment issues noted during receiving (#32).
// backordered:  supplier has stock, will ship later — line stays open
// out_of_stock: supplier temporarily has no stock, no committed date — line stays open
// out_of_print: title discontinued, line will not fulfill — terminal, closes the line
export type SupplyStatus = 'backordered' | 'out_of_stock' | 'out_of_print'

export async function updateSupplyStatus(
  poLineId: string,
  body: { supply_status: SupplyStatus | 'clear'; quantity_affected?: number; note?: string }
): Promise<{ po_line_id: string; supply_status: string; quantity_affected: number; line_status: string; po_status: string; note: string | null; updated: boolean }> {
  return sc(`/api/receiving/lines/${poLineId}/supply`, { method: 'PATCH', body: JSON.stringify(body) })
}

/**
 * ISBN-based PO matching (#35).
 * Sends ISBNs extracted from a scanned slip to the backend, which scores
 * open POs by how many of those ISBNs appear on their open lines.
 * Works without a PO number on the slip — the ISBN list is enough.
 */
export interface ReconciliationLine {
  isbn:               string | null
  title:              string | null
  // 'matched_fuzzy' = recovered from an OCR-misread slip line via backend fuzzy
  // matching (#24). Treated like 'matched' for receiving, but surfaced for human
  // confirmation since the slip ISBN/title didn't exactly match the catalog.
  status:             'matched' | 'matched_fuzzy' | 'on_slip_only' | 'on_po_only'
  slip_qty:           number
  po_qty:             number       // remaining to receive on the PO line
  po_ordered?:        number
  po_received?:       number
  delta:              number | null // slip_qty - po_qty; null for on_po_only
  po_line_id:         string | null
  inventory_item_id:  string | null
  // Fuzzy-recovery metadata — present only when status === 'matched_fuzzy'.
  match_method?:        'fuzzy_isbn' | 'fuzzy_title' | 'fuzzy_isbn+title'
  match_score?:         number       // 0–1 recovery confidence, for display
  recovered_isbn?:      string        // the real catalog ISBN that was matched
  original_slip_isbn?:  string        // the misread ISBN the slip actually carried
  original_slip_title?: string | null // the slip title that aided recovery
}

export interface SlipMatchCandidate {
  po_id:          string
  po_number:      string
  status:         string
  informal_ref:   string | null
  supplier_name:  string | null
  account_label:  string | null
  is_ad_hoc:      boolean
  is_test:        boolean
  slip_coverage:  number   // 0–1: fraction of slip ISBNs found on PO
  po_coverage:    number   // 0–1: fraction of open PO lines covered by slip
  overlap_count:  number
  slip_total:     number
  po_open_total:  number
  reconciliation: ReconciliationLine[]
}

export interface SlipMatchResult {
  candidates:      SlipMatchCandidate[]
  strong_match:    string | null   // po_id of top candidate if slip_coverage ≥ 0.80
  slip_isbn_count: number
}

export async function matchSlipToPO(body: {
  isbns: string[]
  quantities: Record<string, number>
  titles?: Record<string, string>   // isbn → slip title; enables OCR fuzzy recovery (#24)
}): Promise<SlipMatchResult> {
  return sc('/api/receiving/match-slip', { method: 'POST', body: JSON.stringify(body) })
}

export interface ParsedSlipLine { isbn: string | null; title: string | null; supplier_sku: string | null; quantity: number | null; unit_cost: number | null; extended_cost?: number | null; confidence: number; needs_review: boolean }
export interface SlipParseResult { lines: ParsedSlipLine[]; stub: boolean; invoice_number?: string | null; invoice_date?: string | null; supplier_name?: string | null; invoice_total?: number | null; confidence?: number }
export interface POCandidate { id: string; po_number: string; status: string; informal_ref: string | null; supplier_account_id: string; destination_location_id: string; supplier_name: string | null; account_label: string | null; match_type: 'exact' | 'informal_ref' }
export interface ParseAndLookupResult extends SlipParseResult { po_reference: string | null; po_reference_confidence: 'high' | 'medium' | 'low' | null; po_candidates: POCandidate[] }
export async function parsePackingSlip(file: File): Promise<SlipParseResult> { return _multipartPost('/api/receiving/parse-packing-slip', file) }
export async function parseAndLookup(file: File): Promise<ParseAndLookupResult> { return _multipartPost('/api/receiving/parse-and-lookup', file) }

export interface ReceiptRecord { id: string; purchase_order_id: string; location_id: string; receipt_type: string; status: string; notes: string | null; received_at: string; shopify_adjustment_group_id: string | null }
export interface ReceiptLineRecord { id: string; receipt_id: string; purchase_order_line_id: string; inventory_item_id: string; quantity_received: number; restock_applied_at: string | null; damage_applied_at: string | null; status: string; error_message: string | null; shopify_group_id?: string; delta?: number }
export async function fetchPOReceipts(poId: string): Promise<ReceiptRecord[]> { return sc(`/api/receiving/po/${poId}`) }
export async function fetchReceiptLines(receiptId: string): Promise<{ receipt: ReceiptRecord; lines: ReceiptLineRecord[] }> { return sc(`/api/receiving/${receiptId}`) }

// ===========================================================================
// TRANSFERS
// ===========================================================================
export async function fetchTransfers(opts: { status?: string; fromLocationId?: string; toLocationId?: string; includeArchived?: boolean; limit?: number; offset?: number } = {}): Promise<InventoryTransfer[]> {
  return sc(`/api/transfers${qs({ status: opts.status, from_location_id: opts.fromLocationId, to_location_id: opts.toLocationId, include_archived: opts.includeArchived, limit: opts.limit ?? 100, offset: opts.offset ?? 0 })}`)
}
export async function fetchTransferDetail(transferId: string): Promise<TransferDetail> { return sc(`/api/transfers/${transferId}`) }
export async function dispatchTransfer(body: { from_location_id: string; to_location_id: string; lines: Array<{ inventory_item_id: string; variant_id: string; quantity_sent: number }>; notes?: string; is_test?: boolean }): Promise<TransferResult> {
  return sc('/api/transfers', { method: 'POST', body: JSON.stringify(body) })
}
export async function receiveTransfer(transferId: string, body: { lines: Array<{ transfer_line_id: string; inventory_item_id: string; quantity_received: number; quantity_damaged?: number }>; notes?: string }): Promise<TransferResult> {
  return sc(`/api/transfers/${transferId}/receive`, { method: 'POST', body: JSON.stringify({ transfer_id: transferId, ...body }) })
}
export async function cancelTransfer(transferId: string): Promise<void> { return sc(`/api/transfers/${transferId}`, { method: 'DELETE' }) }
export async function archiveTestTransfers(): Promise<{ archived_count: number }> { return sc('/api/transfers/archive-test-transfers', { method: 'POST' }) }

// ===========================================================================
// RECONCILIATION
// ===========================================================================
export async function fetchInventoryEvents(opts: { status?: string; sourceType?: string; inventoryItemId?: string; limit?: number; offset?: number } = {}): Promise<unknown[]> {
  return sc(`/api/inventory-events${qs({ status: opts.status, source_type: opts.sourceType, inventory_item_id: opts.inventoryItemId, limit: opts.limit ?? 100, offset: opts.offset ?? 0 })}`)
}
export async function fetchFlaggedSnapshots(): Promise<unknown[]> { return sc('/api/reconciliation/snapshots?flagged_only=true') }

// ===========================================================================
// SUPPLIER SYNC
// ===========================================================================
export interface SupplierSyncResult { run_at: string; shopify_product_count: number; new_parties_created: number; new_products_created: number; stale_products_deactivated: number; unrecognized_vendors: string[]; unrecognized_count: number; duration_seconds: number; error_message: string | null }
export async function triggerSupplierSync(): Promise<SupplierSyncResult> { return sc('/api/suppliers/sync', { method: 'POST' }) }
export async function fetchSupplierSyncLog(limit = 10): Promise<SupplierSyncResult[]> { return sc(`/api/suppliers/sync/log?limit=${limit}`) }
export async function fetchUnrecognizedVendors(): Promise<{ run_at: string | null; unrecognized_vendors: string[]; unrecognized_count: number }> { return sc('/api/suppliers/sync/unrecognized') }

// ===========================================================================
// LOCATIONS
// ===========================================================================
export interface Location { id: string; name: string; address: string | null; is_active: boolean; is_fulfillment: boolean; is_seasonal: boolean; active_from: string | null; active_until: string | null; shopify_synced_at: string | null }
export interface LocationSyncResult { synced: number; created: number; updated: number; deactivated: number }
export async function fetchLocations(): Promise<Location[]> { return sc('/api/locations') }
export async function syncLocations(): Promise<LocationSyncResult> { return sc('/api/locations/sync', { method: 'POST' }) }
