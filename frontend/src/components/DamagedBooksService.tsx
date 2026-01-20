// src/services/DamagedBooksService.ts
export type DamagedRow = {
  inventory_item_id: number;
  product_id: number;
  variant_id: number;
  handle: string;
  condition_raw: string | null;
  condition_key: 'light' | 'moderate' | 'heavy' | string | null;
  available: number;
  last_shopify_sync_at: string;
  last_webhook_at: string;
  last_source: 'webhook' | 'reconcile' | string;
  notes: string | null;
  title: string | null;
  sku: string | null;
  barcode: string | null;
  stock_status: 'in_stock' | 'out_of_stock';
};

export type DamagedInventoryResponse = {
  data: DamagedRow[];
  meta: { count: number };
};

const BASE = import.meta.env.VITE_DBS_BASE_URL;
const ADMIN_API_TOKEN = import.meta.env.VITE_DBS_ADMIN_TOKEN;

async function get<T>(path: string, params?: Record<string, string | number | boolean>) {
  const url = new URL(path, BASE);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: {
      'X-Admin-Token': ADMIN_API_TOKEN,
      'Accept': 'application/json',
    },
    credentials: 'omit',
    method: 'GET',
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const countHeader = res.headers.get('X-Result-Count');
  return { json: await res.json() as T, countHeader };
}

async function post<TReq, TRes>(path: string, body: TReq) {
  const res = await fetch(new URL(path, BASE), {
    method: 'POST',
    headers: {
      'X-Admin-Token': ADMIN_API_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'omit',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as TRes;
}

export const DamagedBooksService = {
  async listDamagedInventory(opts?: { limit?: number; in_stock?: boolean }) {
    const { json, countHeader } = await get<DamagedInventoryResponse>(
      '/admin/damaged-inventory',
      {
        limit: opts?.limit ?? 200,
        ...(typeof opts?.in_stock === 'boolean' ? { in_stock: opts.in_stock } : {})
      }
    );
    return { ...json, countHeader };
  },

  async getDocs() {
    const { json } = await get<{ links: { title: string; url: string }[] }>('/admin/docs');
    return json.links;
  },

  async getLogsLink() {
    const { json } = await get<{ gateway_logs_url: string }>('/admin/logs');
    return json.gateway_logs_url;
  },

  async reconcileNow(): Promise<{ inspected: number; updated: number; skipped: number }> {
    const res = await fetch(new URL('/admin/reconcile', BASE), {
      method: 'POST',
      headers: { 'X-Admin-Token': ADMIN_API_TOKEN, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  },

  async status(): Promise<{
    inspected: number;
    updated: number;
    skipped: number;
    note?: string;
    at: string;
  }> {
    const res = await fetch(new URL('/admin/reconcile/status', BASE), {
      method: 'GET',
      headers: { 'X-Admin-Token': ADMIN_API_TOKEN }
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  },

  /**
   * Preview bulk damaged-product creation
   * Zero writes. Safe to retry.
   */
  async previewBulkCreate(payload: {
    inputs: { type: 'isbn' | 'product_id'; value: string }[];
    inventory: { light: number; moderate: number; heavy: number };
  }): Promise<
    | { ok: true; preview: any[] }
    | { ok: false; errors: { input: string; reason: string }[] }
  > {
    return post('/admin/bulk-create', {
      ...payload,
      dry_run: true,
    });
  },
};

export default DamagedBooksService;