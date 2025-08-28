// src/types.ts
export type StatusPhase = "New" | "In Progress" | "Request Filed" | "Complete";

export const STATUS_ORDER: StatusPhase[] = [
  "New",
  "In Progress",
  "Request Filed",
  "Complete",
];

// Fast lookup for sorting
const _STATUS_INDEX = STATUS_ORDER.reduce<Record<string, number>>(
  (acc, s, i) => ((acc[s] = i), acc),
  {}
);

// Safe index getter (defaults to 0/"New")
export function getStatusIndex(s?: string | null): number {
  if (!s) return 0;
  const i = _STATUS_INDEX[s];
  return Number.isFinite(i) ? i : 0;
}

export interface InterestEntry {
  id: string; // UUID from DB
  cr_id?: string;
  product_title: string;
  isbn?: string;
  email: string;
  customer_name?: string;
  created_at: string;
  product_id: number;
  status?: StatusPhase;
  cr_seq?: number;
  archived?: boolean;
  archived_at?: string | null;

  // optional enrichers you already use
  shopify_collection_handles?: string[] | null;
  product_tags?: string[] | null;
  shopify_collections?: string[] | null;
}

export interface DashboardHeaderProps {
  title: string;
}