// BackorderService.tsx
// Admin Dashboard module: definitive overview of products/orders owed to customers.
// Heatmap (urgency-scored) + product table + drill-down drawer with order lines and
// action tracking (ordered? expected when? customer notified?).
// Data: backorder-service /admin/backorders/* (X-Admin-Token auth, DBS pattern).
import { useCallback, useEffect, useMemo, useState } from 'react';

const BASE_URL = import.meta.env.VITE_BACKORDER_BASE_URL || '';
const ADMIN_TOKEN = import.meta.env.VITE_BACKORDER_ADMIN_TOKEN || '';

type Bucket = 'critical' | 'high' | 'medium' | 'low';

interface ProductOverview {
  product_id: number;
  variant_id: number | null;
  sku: string | null;
  title: string | null;
  vendor: string | null;
  status: string;
  available: number | null;
  open_backorder_qty: number;
  open_orders_count: number;
  oldest_open_order_at: string | null;
  days_open: number;
  on_order_qty: number;
  next_expected_at: string | null;
  po_numbers: string[] | null;
  lead_time_days: number | null;
  last_customer_notified_at: string | null;
  unnotified_open_lines: number;
  urgency_score: number;
  urgency_bucket: Bucket;
}

interface OrderLine {
  order_id: number;
  line_item_id: number;
  order_name: string | null;
  customer_email: string | null;
  qty_backordered: number;
  open_qty: number;
  status: string;
  order_created_at: string | null;
  last_customer_notified_at: string | null;
  notification_count: number;
}

interface ActionRow {
  id: string;
  action_type: string;
  scope: string;
  order_id: number | null;
  eta_date: string | null;
  details: Record<string, unknown> | null;
  actor: string | null;
  created_at: string;
}

interface Summary {
  open_products: number;
  units_owed: number;
  orders_affected: number;
  not_on_order: number;
  buckets: Record<Bucket, number>;
}

const bucketTile: Record<Bucket, string> = {
  critical: 'bg-red-600 hover:bg-red-700 text-white',
  high: 'bg-orange-500 hover:bg-orange-600 text-white',
  medium: 'bg-amber-400 hover:bg-amber-500 text-gray-900',
  low: 'bg-emerald-500 hover:bg-emerald-600 text-white',
};

const bucketBadge: Record<Bucket, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '\u2014');

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': ADMIN_TOKEN,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

const BackorderService = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [products, setProducts] = useState<ProductOverview[]>([]);
  const [bucketFilter, setBucketFilter] = useState<Bucket | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ProductOverview | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        api<Summary>('/admin/backorders/summary'),
        api<{ data: ProductOverview[] }>('/admin/backorders/products?limit=500'),
      ]);
      setSummary(s);
      setProducts(p.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backorders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDrawer = useCallback(async (product: ProductOverview) => {
    setSelected(product);
    setDrawerLoading(true);
    try {
      const detail = await api<{ lines: OrderLine[]; actions: ActionRow[] }>(
        `/admin/backorders/products/${product.product_id}/orders`
      );
      setLines(detail.lines);
      setActions(detail.actions);
    } catch {
      setLines([]);
      setActions([]);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const closeDrawer = () => {
    setSelected(null);
    setLines([]);
    setActions([]);
  };

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      await api('/admin/backorders/actions', { method: 'POST', body: JSON.stringify(body) });
      if (selected) await openDrawer(selected);
      await load();
    },
    [selected, openDrawer, load]
  );

  const logVendorInquiry = async () => {
    if (!selected) return;
    const note = window.prompt('Vendor / publisher inquiry note:');
    if (note === null) return;
    await postAction({
      scope: 'product',
      product_id: selected.product_id,
      action_type: 'vendor_inquiry',
      details: { note },
    });
  };

  const setEta = async () => {
    if (!selected) return;
    const eta = window.prompt('Expected date (YYYY-MM-DD):');
    if (!eta) return;
    await postAction({
      scope: 'product',
      product_id: selected.product_id,
      action_type: 'eta_updated',
      eta_date: eta,
      details: { source: 'manual' },
    });
  };

  const markNotified = async (line: OrderLine) => {
    if (!selected) return;
    await postAction({
      scope: 'order_line',
      product_id: selected.product_id,
      order_id: line.order_id,
      line_item_id: line.line_item_id,
      action_type: 'customer_notified',
      details: { channel: 'manual' },
    });
  };

  const visible = useMemo(() => {
    let rows = products;
    if (bucketFilter !== 'all') rows = rows.filter((p) => p.urgency_bucket === bucketFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (p) =>
          (p.title || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [products, bucketFilter, search]);

  return (
    <div className="px-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-3xl font-semibold">Backorders</h2>
        <button
          onClick={load}
          className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white text-sm"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded border border-red-300 bg-red-50 text-red-800 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-200">
          {error}. Check VITE_BACKORDER_BASE_URL / VITE_BACKORDER_ADMIN_TOKEN.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Titles owed', value: summary?.open_products ?? '\u2014' },
          { label: 'Units owed', value: summary?.units_owed ?? '\u2014' },
          { label: 'Orders affected', value: summary?.orders_affected ?? '\u2014' },
          { label: 'Not yet ordered', value: summary?.not_on_order ?? '\u2014' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
          >
            <div className="text-xs text-gray-500 dark:text-gray-400">{card.label}</div>
            <div className="text-2xl font-semibold">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Heatmap: every open-backorder title, sized attention-first */}
      <h3 className="text-xl font-semibold mb-2">Urgency heatmap</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Score blends days open, units owed, whether stock is on order (or overdue), and
        un-notified customers. Click a tile for order-level detail and actions.
      </p>
      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-6">Loading\u2026</div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-8">
          {visible.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              No open backorders. Nothing is owed to customers right now.
            </div>
          )}
          {visible.map((p) => (
            <button
              key={p.product_id}
              onClick={() => openDrawer(p)}
              title={`${p.title ?? p.sku ?? p.product_id} \u2014 score ${p.urgency_score}`}
              className={`rounded px-3 py-2 text-left transition-colors w-40 ${bucketTile[p.urgency_bucket]}`}
            >
              <div className="text-xs font-semibold truncate">{p.title ?? p.sku ?? p.product_id}</div>
              <div className="text-[10px] opacity-90">
                {p.open_backorder_qty} owed \u00b7 {p.days_open}d \u00b7{' '}
                {p.on_order_qty > 0 ? `${p.on_order_qty} on PO` : 'not ordered'}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="controls-bar">
        <input
          className="control-input dark:bg-gray-800 dark:border-gray-600"
          placeholder="Search title or SKU\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="w-auto dark:bg-gray-800 dark:border-gray-600"
          value={bucketFilter}
          onChange={(e) => setBucketFilter(e.target.value as Bucket | 'all')}
        >
          <option value="all">All urgency</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Product table */}
      <table className="text-sm">
        <thead>
          <tr>
            <th>Title</th>
            <th>SKU</th>
            <th>Owed</th>
            <th>Orders</th>
            <th>Days open</th>
            <th>On order</th>
            <th>Expected</th>
            <th>Notified</th>
            <th>Status</th>
            <th>Urgency</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p) => (
            <tr
              key={p.product_id}
              onClick={() => openDrawer(p)}
              className="border-t border-gray-200 dark:border-gray-700 even:bg-gray-50 dark:even:bg-gray-800 cursor-pointer"
            >
              <td className="font-medium">{p.title ?? '\u2014'}</td>
              <td>{p.sku ?? '\u2014'}</td>
              <td>{p.open_backorder_qty}</td>
              <td>{p.open_orders_count}</td>
              <td>{p.days_open}</td>
              <td>
                {p.on_order_qty > 0
                  ? `${p.on_order_qty}${p.po_numbers?.length ? ` (${p.po_numbers.join(', ')})` : ''}`
                  : 'No'}
              </td>
              <td>{fmtDate(p.next_expected_at)}</td>
              <td>
                {p.unnotified_open_lines > 0
                  ? `${p.unnotified_open_lines} pending`
                  : fmtDate(p.last_customer_notified_at)}
              </td>
              <td>{p.status.replace(/_/g, ' ')}</td>
              <td>
                <span className={`px-2 py-0.5 rounded text-xs ${bucketBadge[p.urgency_bucket]}`}>
                  {p.urgency_bucket} \u00b7 {p.urgency_score}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Drawer */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 backdrop-blur-sm bg-black/40"
            onClick={closeDrawer}
          ></div>
          <aside className="fixed top-0 right-0 z-50 h-full w-full md:w-[560px] bg-white dark:bg-gray-900 shadow-xl overflow-y-auto transition-transform duration-300 ease-in-out translate-x-0 p-6">
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-xl font-semibold pr-4">{selected.title ?? selected.sku}</h3>
              <button
                onClick={closeDrawer}
                className="px-3 py-1 rounded bg-gray-600 hover:bg-gray-700 text-white text-sm"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {selected.vendor ?? ''} \u00b7 SKU {selected.sku ?? '\u2014'} \u00b7 available{' '}
              {selected.available ?? '\u2014'} \u00b7 {selected.status.replace(/_/g, ' ')}
            </p>

            <div className="grid grid-cols-3 gap-2 mb-4 text-sm">
              <div className="rounded border border-gray-200 dark:border-gray-700 p-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">Owed</div>
                <div className="font-semibold">{selected.open_backorder_qty}</div>
              </div>
              <div className="rounded border border-gray-200 dark:border-gray-700 p-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">On order</div>
                <div className="font-semibold">
                  {selected.on_order_qty > 0 ? selected.on_order_qty : 'No'}
                </div>
              </div>
              <div className="rounded border border-gray-200 dark:border-gray-700 p-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">Expected</div>
                <div className="font-semibold">{fmtDate(selected.next_expected_at)}</div>
              </div>
            </div>

            <div className="flex gap-2 mb-6">
              <button
                onClick={logVendorInquiry}
                className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white text-sm"
              >
                Log vendor inquiry
              </button>
              <button
                onClick={setEta}
                className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-700 text-white text-sm"
              >
                Set expected date
              </button>
            </div>

            <h4 className="text-sm font-semibold mb-2">Orders owed ({lines.length})</h4>
            {drawerLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading\u2026</div>
            ) : (
              <table className="text-sm mb-6">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Open</th>
                    <th>Status</th>
                    <th>Placed</th>
                    <th>Notified</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr
                      key={`${l.order_id}-${l.line_item_id}`}
                      className="border-t border-gray-200 dark:border-gray-700 even:bg-gray-50 dark:even:bg-gray-800"
                    >
                      <td>{l.order_name ?? l.order_id}</td>
                      <td className="truncate max-w-[140px]">{l.customer_email ?? '\u2014'}</td>
                      <td>
                        {l.open_qty}/{l.qty_backordered}
                      </td>
                      <td>{l.status}</td>
                      <td>{fmtDate(l.order_created_at)}</td>
                      <td>
                        {l.last_customer_notified_at
                          ? `${fmtDate(l.last_customer_notified_at)} (${l.notification_count}x)`
                          : 'Never'}
                      </td>
                      <td>
                        {(l.status === 'open' || l.status === 'partial') && (
                          <button
                            onClick={() => markNotified(l)}
                            className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          >
                            Mark notified
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h4 className="text-sm font-semibold mb-2">Action history</h4>
            {actions.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                No actions logged yet. Log a vendor inquiry or set an expected date to start the trail.
              </div>
            ) : (
              <ul className="text-sm space-y-2">
                {actions.map((a) => (
                  <li
                    key={a.id}
                    className="border-t border-gray-200 dark:border-gray-700 pt-2"
                  >
                    <span className="font-medium">{a.action_type.replace(/_/g, ' ')}</span>
                    {a.order_id ? ` \u00b7 order ${a.order_id}` : ''}
                    {a.eta_date ? ` \u00b7 ETA ${a.eta_date}` : ''}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {' '}
                      \u2014 {new Date(a.created_at).toLocaleString()}
                      {a.actor ? ` by ${a.actor}` : ''}
                    </span>
                    {a.details && 'note' in a.details && (
                      <div className="text-xs text-gray-600 dark:text-gray-300">
                        {String(a.details.note)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </>
      )}
    </div>
  );
};

export default BackorderService;
