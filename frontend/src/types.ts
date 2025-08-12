// src/types.ts
export interface InterestEntry {
  id: string; // UUID from DB
  cr_id?: string;
  product_title: string;
  isbn?: string;
  email: string;
  customer_name?: string;
  created_at: string;
  product_id: number;
  status?: string;
  cr_seq?: number;
}