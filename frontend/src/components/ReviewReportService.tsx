// src/components/ReviewReportService.tsx
// Data layer for the Review report. Talks to supply-chain-service (NOT the
// gateway) using a Bearer admin token. Server does the sort/filter/pagination;
// this module is a thin typed client.

export type ReviewRow = {
  inventory_item_id: string;
  variant_id: string | null;
  isbn: string | null;
  title: string | null;
  author: string | null;
  price: number | null;
  tags: string[];
  on_hand: number | null;
  available: number | null;
  sales_last_7d: number;
  sales_last_30d: number;
  sales_12mo: number;
  last_sold_at: string | null;
  publisher_party_id: string | null;
  publisher_name: string | null;
  root_supplier_party_id: string | null;
  supplier_name: string | null;
  on_order: number;
  refreshed_at: string | null;
};

export type ReviewResponse = {
  rows: ReviewRow[];
  total: number;
  limit: number;
  offset: number;
  sort: string;
  order: 'asc' | 'desc';
};

export type Freshness = {
  family: string;
  as_of: string | null;
  source: string | null;
  status: string | null;
};

export type ReviewParams = {
  limit?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  publisher_id?: string;
  supplier_id?: string;
  tag?: string;
  never_sold?: boolean;
  in_stock?: boolean;
  search?: string;
};

const BASE = import.meta.env.VITE_SCS_BASE_URL;
const ADMIN_TOKEN = import.meta.env.VITE_SCS_ADMIN_TOKEN;

async function scsFetch<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  init?: RequestInit
): Promise<T> {
  const url = new URL(path, BASE);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const ReviewReportService = {
  getReview(params: ReviewParams = {}) {
    return scsFetch<ReviewResponse>('/api/reporting/review', params);
  },
  getFreshness() {
    return scsFetch<Freshness[]>('/api/reporting/snapshot/freshness');
  },
  // On-demand refresh: rolling-window sales + catalog/on-hand. The heavy
  // full backfill is run separately from the terminal/cron.
  refresh() {
    return scsFetch<unknown>('/api/reporting/snapshot/run', undefined, { method: 'POST' });
  },
};

export default ReviewReportService;
