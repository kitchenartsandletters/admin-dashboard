// src/components/ReviewReport.tsx
// Review report (M2 slice 2a): server-side sorted/filtered/paginated table over
// reporting.review_rows, with a per-family freshness banner and a provisional
// flag on the sales-derived columns until full order history is loaded.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReviewReportService,
  ReviewRow,
  Freshness,
} from '../components/ReviewReportService';

type SortKey =
  | 'title' | 'author' | 'isbn' | 'price'
  | 'on_hand' | 'available' | 'on_order'
  | 'sales_last_7d' | 'sales_last_30d' | 'sales_12mo' | 'last_sold_at'
  | 'publisher_name' | 'supplier_name';

type GroupBy = 'none' | 'publisher' | 'supplier';

const PAGE_SIZE = 100;

const num = (v: number | null | undefined) => (v == null ? '—' : String(v));
const money = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);
const day = (v: string | null) => (v ? v.slice(0, 10) : '—');

export default function ReviewReport() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tag, setTag] = useState('');
  const [neverSold, setNeverSold] = useState(false);
  const [inStock, setInStock] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  // Sort + paging
  const [sort, setSort] = useState<SortKey>('sales_12mo');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);

  const [freshness, setFreshness] = useState<Freshness[]>([]);

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Grouping pins the sort to the grouping column so page boundaries stay tidy.
  const effectiveSort: SortKey =
    groupBy === 'publisher' ? 'publisher_name'
    : groupBy === 'supplier' ? 'supplier_name'
    : sort;
  const effectiveOrder = groupBy === 'none' ? order : 'asc';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await ReviewReportService.getReview({
        limit: PAGE_SIZE,
        offset,
        sort: effectiveSort,
        order: effectiveOrder,
        tag: tag || undefined,
        never_sold: neverSold || undefined,
        in_stock: inStock || undefined,
        search: debouncedSearch || undefined,
      });
      setRows(resp.rows);
      setTotal(resp.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [offset, effectiveSort, effectiveOrder, tag, neverSold, inStock, debouncedSearch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { ReviewReportService.getFreshness().then(setFreshness).catch(() => {}); }, []);

  // Any filter/sort change resets to the first page.
  useEffect(() => { setOffset(0); }, [effectiveSort, effectiveOrder, tag, neverSold, inStock, debouncedSearch]);

  const onSort = (key: SortKey) => {
    if (groupBy !== 'none') return; // sorting is controlled by grouping
    if (sort === key) {
      setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder('desc');
    }
  };

  const salesFresh = useMemo(
    () => freshness.find(f => f.family === 'sales') || null,
    [freshness]
  );
  // Sales history is provisional until the full backfill lands (see read_all_orders).
  const salesProvisional = !salesFresh || salesFresh.status !== 'complete';

  const arrow = (key: SortKey) =>
    groupBy === 'none' && sort === key ? (order === 'asc' ? ' ▲' : ' ▼') : '';

  const th = (key: SortKey, label: string, extra?: string) => (
    <th
      className={`px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700 whitespace-nowrap ${groupBy === 'none' ? 'cursor-pointer' : ''}`}
      onClick={() => onSort(key)}
      title={extra}
    >
      {label}{arrow(key)}
    </th>
  );

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  // Client-side group headers within the current page.
  const renderBody = () => {
    if (rows.length === 0) {
      return (
        <tr><td className="px-3 py-6 text-center opacity-70" colSpan={13}>No rows</td></tr>
      );
    }
    const out: JSX.Element[] = [];
    let lastGroup: string | null = null;
    for (const r of rows) {
      if (groupBy !== 'none') {
        const g = (groupBy === 'publisher' ? r.publisher_name : r.supplier_name) || '— Unmapped —';
        if (g !== lastGroup) {
          lastGroup = g;
          out.push(
            <tr key={`g-${g}`} className="bg-gray-100 dark:bg-gray-800">
              <td className="px-3 py-2 font-semibold" colSpan={13}>{g}</td>
            </tr>
          );
        }
      }
      out.push(
        <tr key={r.inventory_item_id} className="even:bg-gray-50 dark:even:bg-gray-700 align-top">
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{r.title ?? '—'}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{r.author ?? '—'}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{r.isbn ?? '—'}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{r.publisher_name ?? '—'}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{r.supplier_name ?? '—'}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{money(r.price)}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{num(r.on_hand)}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{num(r.available)}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{r.on_order}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{r.sales_last_7d}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{r.sales_last_30d}</td>
          <td className={`px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right ${salesProvisional ? 'text-amber-700 dark:text-amber-400' : ''}`}>{r.sales_12mo}</td>
          <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{day(r.last_sold_at)}</td>
        </tr>
      );
    }
    return out;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Review Report</h2>
          <span className="text-sm opacity-70">{total.toLocaleString()} variants</span>
        </div>
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              await ReviewReportService.refresh();
              const fr = await ReviewReportService.getFreshness();
              setFreshness(fr);
              await load();
            } catch { /* surfaced on next load */ } finally {
              setRefreshing(false);
            }
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Freshness banner */}
      <div className="text-xs text-gray-600 dark:text-gray-300 flex flex-wrap gap-x-4 gap-y-1">
        {freshness.map(f => (
          <span key={f.family}>
            <span className="uppercase opacity-60">{f.family}</span>{' '}
            {f.as_of ? new Date(f.as_of).toLocaleString() : 'pending'}
          </span>
        ))}
      </div>

      {salesProvisional && (
        <div className="text-xs rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 text-amber-800 dark:text-amber-300 px-3 py-2">
          12-month sales and the never-sold filter are <strong>provisional</strong> — the
          sales snapshot does not yet cover a full 12 months, so recent-only titles may be
          understated. These will settle once the full order-history backfill completes.
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search title / ISBN / author…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white"
        />
        <input
          type="text"
          placeholder="Tag (e.g. preorder)"
          value={tag}
          onChange={e => setTag(e.target.value)}
          className="px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white"
        />
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={inStock} onChange={e => setInStock(e.target.checked)} />
          In stock
        </label>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={neverSold} onChange={e => setNeverSold(e.target.checked)} />
          Never sold (12mo)
        </label>
        <select
          className="border px-2 py-2 rounded text-sm dark:bg-gray-800 dark:text-white"
          value={groupBy}
          onChange={e => setGroupBy(e.target.value as GroupBy)}
        >
          <option value="none">No grouping</option>
          <option value="publisher">Group by publisher</option>
          <option value="supplier">Group by supplier</option>
        </select>
      </div>

      {error && (
        <div className="text-sm rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2">
          {error}
        </div>
      )}

      <div className="overflow-auto border rounded-md">
        <table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {th('title', 'Title')}
              {th('author', 'Author')}
              {th('isbn', 'ISBN')}
              {th('publisher_name', 'Publisher')}
              {th('supplier_name', 'Supplier')}
              {th('price', 'Price')}
              {th('on_hand', 'On hand')}
              {th('available', 'Avail')}
              {th('on_order', 'On order')}
              {th('sales_last_7d', '7d')}
              {th('sales_last_30d', '30d')}
              {th('sales_12mo', salesProvisional ? '12mo *' : '12mo', 'Provisional until full history loads')}
              {th('last_sold_at', 'Last sold')}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-6 text-center opacity-70" colSpan={13}>Loading…</td></tr>
            ) : renderBody()}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="opacity-70">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 border rounded disabled:opacity-40"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
          >
            Prev
          </button>
          <button
            className="px-3 py-1 border rounded disabled:opacity-40"
            disabled={to >= total || loading}
            onClick={() => setOffset(o => o + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
