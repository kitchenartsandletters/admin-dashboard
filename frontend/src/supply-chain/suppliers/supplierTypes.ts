// supplierTypes.ts
// Mirrors the Pydantic models in supply-chain-service/app/models/supplier.py

export type SupplierRole =
  | 'distributor'
  | 'wholesaler'
  | 'publisher'
  | 'small_press'
  | 'direct'
  | 'author'
  | 'restaurant'
  | 'other'

export type OrderingMethod =
  | 'email'
  | 'edi'
  | 'web_portal'
  | 'phone'
  | 'in_person'
  | 'other'

export type ContactRole =
  | 'sales_rep'
  | 'customer_service'
  | 'billing'
  | 'returns'
  | 'general'

export const SUPPLIER_ROLE_LABELS: Record<SupplierRole, string> = {
  distributor: 'Distributor',
  wholesaler: 'Wholesaler',
  publisher: 'Publisher',
  small_press: 'Small Press',
  direct: 'Direct',
  author: 'Author',
  restaurant: 'Restaurant',
  other: 'Other',
}

export const ORDERING_METHOD_LABELS: Record<OrderingMethod, string> = {
  email: 'Email',
  edi: 'EDI',
  web_portal: 'Web Portal',
  phone: 'Phone',
  in_person: 'In Person',
  other: 'Other',
}

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  sales_rep: 'Sales Rep',
  customer_service: 'Customer Service',
  billing: 'Billing',
  returns: 'Returns',
  general: 'General',
}

// ---------------------------------------------------------------------------
// Party
// ---------------------------------------------------------------------------

export interface SupplierParty {
  id: string
  name: string
  legal_name: string | null
  parent_id: string | null
  roles: SupplierRole[]
  country: string | null
  website: string | null
  notes: string | null
  payment_terms: string | null
  is_returnable: boolean | null
  discount_pct: number | null
  is_active: boolean
  shopify_vendor_codes: string[] | null
  created_at: string
  updated_at: string
}

export interface SupplierPartyCreate {
  name: string
  legal_name?: string
  parent_id?: string
  roles: SupplierRole[]
  country?: string
  website?: string
  notes?: string
  payment_terms?: string
  is_returnable?: boolean
  discount_pct?: number
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export interface SupplierAccount {
  id: string
  party_id: string
  label: string
  account_number: string | null
  // Optional Shopify location GID. When set, this account number is specific to
  // that location (e.g. PRH 111 Broadway). null = location-agnostic; the PO
  // ship-to dictates destination. POBuilder resolves the effective account from
  // (party accounts + destination location).
  location_id: string | null
  ordering_method: OrderingMethod | null
  ordering_email: string | null
  ordering_url: string | null
  ship_from_address: string | null
  freight_terms: string | null
  currency: string
  min_order_amount: number | null
  is_primary: boolean
  // Convenience wholesale account (Ingram wholesale, Baker & Taylor, etc.).
  // Products received via a wholesaler account should not inherit it as their
  // publisher — the real publisher/distributor is attributed instead.
  is_wholesaler: boolean
  // Marks the party's B2B account. When a PO is B2B, resolveAccountForLocation
  // returns this account regardless of destination (overrides the location flip).
  is_b2b: boolean
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface SupplierAccountCreate {
  party_id: string
  label: string
  account_number?: string
  location_id?: string
  ordering_method?: OrderingMethod
  ordering_email?: string
  ordering_url?: string
  ship_from_address?: string
  freight_terms?: string
  currency?: string
  min_order_amount?: number
  is_primary?: boolean
  is_wholesaler?: boolean
  is_b2b?: boolean
  notes?: string
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export interface SupplierContact {
  id: string
  party_id: string
  account_id: string | null
  name: string
  title: string | null
  email: string | null
  phone: string | null
  role: ContactRole | null
  is_primary: boolean
  notes: string | null
  created_at: string
}

export interface SupplierContactCreate {
  party_id: string
  account_id?: string
  name: string
  title?: string
  email?: string
  phone?: string
  role?: ContactRole
  is_primary?: boolean
  notes?: string
}

// ---------------------------------------------------------------------------
// Supplier Product (variant ↔ account mapping)
// ---------------------------------------------------------------------------

export interface SupplierProduct {
  id: string
  account_id: string
  inventory_item_id: string
  variant_id: string
  supplier_sku: string | null
  unit_cost: number | null
  case_pack_size: number
  minimum_order_qty: number
  lead_time_days: number | null
  is_primary_supplier: boolean
  is_active: boolean
  notes: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Detail view composite
// ---------------------------------------------------------------------------

export interface SupplierDetail {
  party: SupplierParty
  accounts: SupplierAccount[]
  contacts: SupplierContact[]
  products: SupplierProduct[]
  children: SupplierParty[]  // imprints / subsidiaries
}
