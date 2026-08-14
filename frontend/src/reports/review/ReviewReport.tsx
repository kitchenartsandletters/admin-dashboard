// src/reports/review/ReviewReport.tsx
// Review report (M2). Server-side sorted/filtered/paginated table over
// reporting.review_rows, with a freshness banner + provisional flag (slice 2a),
// and slice 2b: a column chooser, per-user saved views, and CSV export.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchReview,
  fetchReviewFreshness,
  runReviewRefresh,
  fetchViews,
  saveView,
  deleteView,
  downloadReviewCsv,
  ReviewRow,
  ReviewFreshness,
  SavedView,
  ViewConfig,
} from '../../api/reviewReportApi';
import { useAuth } from '../../auth/AuthProvider';

type ColKey =
  | 'title' | 'author' | 'isbn' | 'publisher_name' | 'supplier_name'
  | 'price' | 'on_hand' | 'available' | 'on_order'
  | 'sales_last_7d' | 'sales_last_30d' | 'sales_12mo' | 'last_sold_at';

type SortKey = ColKey;
type GroupBy = 'none' | 'publisher' | 'supplier';

const PAGE_SIZE = 100;

// Canonical column order + labels. Every column is sortable (all keys are valid
// server sort columns). `align: 'right'` for numerics.
const ALL_COLUMNS: { key: ColKey; label: string; align?: 'right' }[] = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'publisher_name', label: 'Publisher' },
  { key: 'supplier_name', label: 'Supplier' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'on_hand', label: 'On hand', align: 'right' },
  { key: 'available', label: 'Avail', align: 'right' },
  { key: 'on_order', label: 'On order', align: 'right' },
  { key: 'sales_last_7d', label: '7d', align: 'right' },
  { key: 'sales_last_30d', label: '30d', align: 'right' },
  { key: 'sales_12mo', label: '12mo', align: 'right' },
  { key: 'last_sold_at', label: 'Last sold' },
];
const ALL_KEYS = ALL_COLUMNS.map(c => c.key);

const num = (v: number | null | undefined) => (v == null ? '—' : String(v));
const money = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);
const day = (v: string | null) => (v ? v.slice(0, 10) : '—');

function cellValue(key: ColKey, r: ReviewRow) {
  switch (key) {
    case 'title': return r.title ?? '—';
    case 'author': return r.author ?? '—';
    case 'isbn': return r.isbn ?? '—';
    case 'publisher_name': return r.publisher_name ?? '—';
    case 'supplier_name': return r.supplier_name ?? '—';
    case 'price': return money(r.price);
    case 'on_hand': return num(r.on_hand);
    case 'available': return num(r.available);
    case 'on_order': return r.on_order;
    case 'sales_last_7d': return r.sales_last_7d;
    case 'sales_last_30d': return r.sales_last_30d;
    case 'sales_12mo': return r.sales_12mo;
    case 'last_sold_at': return day(r.last_sold_at);
    default: return '';
  }
}

export default function ReviewReport() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  // Column visibility (2b)
  const [visible, setVisible] = useState<Record<ColKey, boolean>>(
    () => Object.fromEntries(ALL_KEYS.map(k => [k, true])) as Record<ColKey, boolean>
  );
  const [showCols, setShowCols] = useState(false);

  // Saved views (2b)
  const [views, setViews] = useState<SavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState('');
  const [viewName, setViewName] = useState('');
  const [viewBusy, setViewBusy] = useState(false);

  const [freshness, setFreshness] = useState<ReviewFreshness[]>([]);

  const visibleColumns = useMemo(() => ALL_COLUMNS.filter(c => visible[c.key]), [visible]);
  const colSpan = Math.max(1, visibleColumns.length);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveSort: SortKey =
    groupBy === 'publisher' ? 'publisher_name'
    : groupBy === 'supplier' ? 'supplier_name'
    : sort;
  const effectiveOrder = groupBy === 'none' ? order : 'asc';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchReview({
        limit: PAGE_SIZE,
        offset,
        sort: effectiveSort,
        order: effectiveOrder,
        tag: tag || undefined,
        neverSold,
        inStock,
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
  useEffect(() => { fetchReviewFreshness().then(setFreshness).catch(() => {}); }, []);
  useEffect(() => { setOffset(0); }, [effectiveSort, effectiveOrder, tag, neverSold, inStock, debouncedSearch]);

  const loadViews = useCallback(() => {
    if (!userId) return;
    fetchViews(userId).then(setViews).catch(() => {});
  }, [userId]);
  useEffect(() => { loadViews(); }, [loadViews]);

  const onSort = (key: SortKey) => {
    if (groupBy !== 'none') return;
    if (sort === key) setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder('desc'); }
  };

  const salesFresh = useMemo(() => freshness.find(f => f.family === 'sales') || null, [freshness]);
  const salesProvisional = !salesFresh || salesFresh.status !== 'complete';

  const arrow = (key: SortKey) =>
    groupBy === 'none' && sort === key ? (order === 'asc' ? ' ▲' : ' ▼') : '';

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  // ----- saved views: apply / build config -----
  const applyConfig = (cfg: ViewConfig) => {
    setSearch(cfg.search ?? '');
    setDebouncedSearch(cfg.search ?? '');
    setTag(cfg.tag ?? '');
    setNeverSold(!!cfg.neverSold);
    setInStock(!!cfg.inStock);
    setGroupBy(cfg.groupBy ?? 'none');
    if (cfg.sort) setSort(cfg.sort as SortKey);
    if (cfg.order) setOrder(cfg.order);
    if (cfg.columns && cfg.columns.length) {
      const set = new Set(cfg.columns);
      setVisible(Object.fromEntries(ALL_KEYS.map(k => [k, set.has(k)])) as Record<ColKey, boolean>);
    }
    setOffset(0);
  };

  const currentConfig = (): ViewConfig => ({
    sort, order,
    search: search || undefined,
    tag: tag || undefined,
    neverSold: neverSold || undefined,
    inStock: inStock || undefined,
    groupBy,
    columns: ALL_KEYS.filter(k => visible[k]),
  });

  const onSelectView = (id: string) => {
    setSelectedViewId(id);
    const v = views.find(x => x.id === id);
    if (v) { applyConfig(v.config || {}); setViewName(v.name); }
  };

  const onSaveView = async () => {
    const name = viewName.trim();
    if (!name || !userId) return;
    setViewBusy(true);
    try {
      const saved = await saveView(userId, name, currentConfig());
      await loadViews();
      setSelectedViewId(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save view');
    } finally {
      setViewBusy(false);
    }
  };

  const onDeleteView = async () => {
    if (!selectedViewId || !userId) return;
    setViewBusy(true);
    try {
      await deleteView(userId, selectedViewId);
      setSelectedViewId('');
      setViewName('');
      await loadViews();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete view');
    } finally {
      setViewBusy(false);
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      await downloadReviewCsv({
        sort: effectiveSort, order: effectiveOrder,
        tag: tag || undefined, neverSold, inStock,
        search: debouncedSearch || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CSV export failed');
    } finally {
      setExporting(false);
    }
  };

  const renderBody = () => {
    if (rows.length === 0) {
      return <tr><td className="px-3 py-6 text-center opacity-70" colSpan={colSpan}>No rows</td></tr>;
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
              <td className="px-3 py-2 font-semibold" colSpan={colSpan}>{g}</td>
            </tr>
          );
        }
      }
      out.push(
        <tr key={r.inventory_item_id} className="even:bg-gray-50 dark:even:bg-gray-700 align-top">
          {visibleColumns.map(c => {
            const isProvisional = c.key === 'sales_12mo' && salesProvisional;
            return (
              <td
                key={c.key}
                className={`px-3 py-2 border-r border-gray-200 dark:border-gray-700 ${c.align === 'right' ? 'text-right' : ''} ${isProvisional ? 'text-amber-700 dark:text-amber-400' : ''}`}
              >
                {cellValue(c.key, r)}
              </td>
            );
          })}
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
        <div className="flex gap-2">
          <button
            className="border px-3 py-1 rounded text-sm disabled:opacity-50"
            disabled={exporting || loading}
            onClick={onExport}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                await runReviewRefresh();
                const fr = await fetchReviewFreshness();
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
      </div>

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
          understated. These settle once the full order-history backfill completes.
        </div>
      )}

      {/* Saved views + column chooser */}
      <div className="flex gap-2 flex-wrap items-center">
        <select
          className="border px-2 py-2 rounded text-sm dark:bg-gray-800 dark:text-white"
          value={selectedViewId}
          onChange={e => onSelectView(e.target.value)}
        >
          <option value="">— Saved views —</option>
          {views.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input
          type="text"
          placeholder="View name"
          value={viewName}
          onChange={e => setViewName(e.target.value)}
          className="px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white"
        />
        <button className="border px-3 py-2 rounded text-sm disabled:opacity-50" disabled={viewBusy || !viewName.trim()} onClick={onSaveView}>Save view</button>
        <button className="border px-3 py-2 rounded text-sm disabled:opacity-50" disabled={viewBusy || !selectedViewId} onClick={onDeleteView}>Delete</button>

        <div className="relative">
          <button className="border px-3 py-2 rounded text-sm" onClick={() => setShowCols(s => !s)}>Columns ▾</button>
          {showCols && (
            <div className="absolute z-10 mt-1 w-48 max-h-72 overflow-auto rounded border bg-white dark:bg-gray-800 dark:border-gray-700 shadow p-2 text-sm">
              {ALL_COLUMNS.map(c => (
                <label key={c.key} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={visible[c.key]}
                    onChange={e => setVisible(v => ({ ...v, [c.key]: e.target.checked }))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
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
              {visibleColumns.map(c => {
                const label = c.key === 'sales_12mo' && salesProvisional ? `${c.label} *` : c.label;
                return (
                  <th
                    key={c.key}
                    className={`px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700 whitespace-nowrap ${groupBy === 'none' ? 'cursor-pointer' : ''}`}
                    onClick={() => onSort(c.key)}
                    title={c.key === 'sales_12mo' ? 'Provisional until full history loads' : undefined}
                  >
                    {label}{arrow(c.key)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-6 text-center opacity-70" colSpan={colSpan}>Loading…</td></tr>
            ) : renderBody()}
          </tbody>
        </table>
      </div>

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
