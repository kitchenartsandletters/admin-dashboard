// b2bCustomerTypes.ts
// Mirrors supply-chain-service/app/models/b2b_customer.py
//
// B2B customers are businesses KAL wholesales to (sell-side counterparties),
// distinct from suppliers (buy-side). A B2B purchase order references the
// supplier's is_b2b account (buy side) and a B2B customer for the ship-to
// (sell side). Invoicing and discounting live in Shopify; discount_pct here is
// records-only.

export interface B2bCustomer {
  id: string
  business_name: string
  ship_to_address: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  discount_pct: number | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface B2bCustomerCreate {
  business_name: string
  ship_to_address?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  discount_pct?: number
  notes?: string
}
