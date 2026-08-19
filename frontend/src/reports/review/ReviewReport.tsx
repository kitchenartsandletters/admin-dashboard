// src/reports/review/ReviewReport.tsx
// Review report. Server-side sorted/filtered/paginated table over
// reporting.review_rows, with a freshness banner + provisional flag, a column
// chooser, per-user saved views, and CSV export.
//
// Three distinct entity columns, because they are three different things:
//   Vendor   — the raw Shopify vendor code (ground truth, e.g. HGUS)
//   Imprint  — the resolved publishing entity (Hardie Grant US). The grain
//              buying and culling decisions are made at.
//   Supplier — the ordering party we actually buy from and form returns under
//              (Chronicle Books).
// An imprint whose vendor code has no party mapped yet renders as the bare code
// in muted type — honest, and it doubles as the SCS cleanup worklist.
//
// The sales window is a real date range, not just the fixed 7d/30d/12mo
// buckets: with a range applied the server aggregates reporting.sales_daily
// over it and the Sold/Revenue in range columns appear.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchReview,
  fetchReviewFreshness,
  runReviewRefresh,
  fetchViews,
  saveView,
  deleteView,
  downloadReviewCsv,
  fetchImprintDirectory,
  fetchLastPoDates,
  LastPoDates,
  ReviewRow,
  ReviewFreshness,
  SavedView,
  ViewConfig,
  ImprintDirectory,
} from '../../api/reviewReportApi';
import { useAuth } from '../../auth/AuthProvider';
import SalesRangePicker, { SalesRange } from './SalesRangePicker';

type ColKey =
  | 'title' | 'author' | 'isbn'
  | 'vendor_code' | 'imprint_name' | 'supplier_name'
  | 'price' | 'on_hand' | 'available' | 'on_order'
  | 'sales_last_7d' | 'sales_last_30d' | 'sales_12mo' | 'last_sold_at'
  | 'sales_in_range' | 'revenue_in_range';

type SortKey = ColKey;
type GroupBy = 'none' | 'imprint' | 'supplier';

const PAGE_SIZE = 100;

// Canonical column order + labels. Every column is sortable (all keys are valid
// server sort columns). `align: 'right'` for numerics.
const ALL_COLUMNS: { key: ColKey; label: string; align?: 'right' }[] = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'vendor_code', label: 'Vendor' },
  { key: 'imprint_name', label: 'Imprint' },
  { key: 'supplier_name', label: 'Supplier' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'on_hand', label: 'On hand', align: 'right' },
  { key: 'available', label: 'Avail', align: 'right' },
  { key: 'on_order', label: 'On order', align: 'right' },
  { key: 'sales_last_7d', label: '7d', align: 'right' },
  { key: 'sales_last_30d', label: '30d', align: 'right' },
  { key: 'sales_12mo', label: '12mo', align: 'right' },
  { key: 'last_sold_at', label: 'Last sold' },
  // Only rendered when a sales date range is active.
  { key: 'sales_in_range', label: 'Sold in range', align: 'right' },
  { key: 'revenue_in_range', label: 'Revenue in range', align: 'right' },
];
const RANGE_COLUMNS: ColKey[] = ['sales_in_range', 'revenue_in_range'];
const ALL_KEYS = ALL_COLUMNS.map(c => c.key);
// Vendor is off by default — it's the diagnostic behind Imprint, not everyday
// reading. Turn it on from the Columns menu when auditing a mapping.
const DEFAULT_HIDDEN: ColKey[] = ['vendor_code'];

const num = (v: number | null | undefined) => (v == null ? '—' : String(v));
const money = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);
const day = (v: string | null) => (v ? v.slice(0, 10) : '—');

function cellValue(key: ColKey, r: ReviewRow) {
  switch (key) {
    case 'title': return r.title ?? '—';
    case 'author': return r.author ?? '—';
    case 'isbn': return r.isbn ?? '—';
    case 'vendor_code': return r.vendor_code ?? '—';
    case 'imprint_name':
      if (!r.imprint_name) return '—';
      // Unmapped: show the code, muted, so it reads as "not resolved yet"
      // rather than as a publisher name.
      return r.imprint_is_mapped
        ? r.imprint_name
        : <span className="opacity-50 italic" title="No imprint mapped for this vendor code yet">{r.imprint_name}</span>;
    case 'supplier_name': return r.supplier_name ?? '—';
    case 'price': return money(r.price);
    case 'on_hand': return num(r.on_hand);
    case 'available': return num(r.available);
    case 'on_order': return r.on_order;
    case 'sales_last_7d': return r.sales_last_7d;
    case 'sales_last_30d': return r.sales_last_30d;
    case 'sales_12mo': return r.sales_12mo;
    case 'last_sold_at': return day(r.last_sold_at);
    case 'sales_in_range': return r.sales_in_range ?? 0;
    case 'revenue_in_range': return money(r.revenue_in_range ?? 0);
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
  const [excludeTag, setExcludeTag] = useState('');
  const [neverSold, setNeverSold] = useState(false);
  const [inStock, setInStock] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [imprintId, setImprintId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [salesRange, setSalesRange] = useState<SalesRange | null>(null);
  const [soldOnly, setSoldOnly] = useState(false);
  const [lastPo, setLastPo] = useState<LastPoDates | null>(null);

  // Sort + paging
  const [sort, setSort] = useState<SortKey>('sales_12mo');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);

  // Column visibility
  const [visible, setVisible] = useState<Record<ColKey, boolean>>(
    () => Object.fromEntries(ALL_KEYS.map(k => [k, !DEFAULT_HIDDEN.includes(k)])) as Record<ColKey, boolean>
  );
  const [showCols, setShowCols] = useState(false);

  // Saved views
  const [views, setViews] = useState<SavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState('');
  const [viewName, setViewName] = useState('');
  const [viewBusy, setViewBusy] = useState(false);

  const [freshness, setFreshness] = useState<ReviewFreshness[]>([]);
  const [directory, setDirectory] = useState<ImprintDirectory>({ imprints: [], suppliers: [] });

  const visibleColumns = useMemo(
    () => ALL_COLUMNS.filter(c =>
      visible[c.key] && (salesRange ? true : !RANGE_COLUMNS.includes(c.key))),
    [visible, salesRange]
  );
  const colSpan = Math.max(1, visibleColumns.length);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Grouping no longer hijacks the sort: the server orders by the group column
  // first and by the chosen sort within each group, so both hold at once.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchReview({
        limit: PAGE_SIZE,
        offset,
        sort,
        order,
        groupBy,
        imprintId: imprintId || undefined,
        supplierId: supplierId || undefined,
        unmappedOnly,
        tag: tag || undefined,
        excludeTag: excludeTag || undefined,
        neverSold,
        inStock,
        search: debouncedSearch || undefined,
        salesFrom: salesRange?.from,
        salesTo: salesRange?.to,
        soldOnly: salesRange ? soldOnly : undefined,
      });
      setRows(resp.rows);
      setTotal(resp.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [offset, sort, order, groupBy, imprintId, supplierId, unmappedOnly, tag, excludeTag, neverSold, inStock, debouncedSearch, salesRange, soldOnly]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchLastPoDates().then(setLastPo).catch(() => {}); }, []);
  useEffect(() => { fetchReviewFreshness().then(setFreshness).catch(() => {}); }, []);
  useEffect(() => { fetchImprintDirectory(true).then(setDirectory).catch(() => {}); }, []);
  useEffect(() => {
    setOffset(0);
  }, [sort, order, groupBy, imprintId, supplierId, unmappedOnly, tag, excludeTag, neverSold, inStock, debouncedSearch, salesRange, soldOnly]);

  // Applying a range makes "what sold in it" the interesting order; clearing it
  // sends the sort back to the 12-month default so no dead column is sorted on.
  const applyRange = (r: SalesRange | null) => {
    setSalesRange(r);
    if (r) { setSort('sales_in_range'); setOrder('desc'); }
    else if (RANGE_COLUMNS.includes(sort as ColKey)) { setSort('sales_12mo'); setOrder('desc'); }
  };

  const onSort = (key: SortKey) => {
    if (sort === key) setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder('desc'); }
  };

  const salesFresh = useMemo(() => freshness.find(f => f.family === 'sales') || null, [freshness]);
  const salesProvisional = !salesFresh || salesFresh.status !== 'complete';

  const arrow = (key: SortKey) => (sort === key ? (order === 'asc' ? ' ▲' : ' ▼') : '');

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  // Anchor for "Since last PO": the PO date of whichever party is filtered.
  const lastPoDate = useMemo(() => {
    if (!lastPo) return null;
    if (supplierId) return lastPo.by_root[supplierId] ?? lastPo.by_party[supplierId] ?? null;
    if (imprintId) return lastPo.by_party[imprintId] ?? lastPo.by_root[imprintId] ?? null;
    return null;
  }, [lastPo, supplierId, imprintId]);

  const lastPoLabel = useMemo(() => {
    if (supplierId) return directory.suppliers.find(s => s.supplier_party_id === supplierId)?.supplier_name ?? null;
    if (imprintId) return directory.imprints.find(i => i.imprint_party_id === imprintId)?.imprint_name ?? null;
    return null;
  }, [directory, supplierId, imprintId]);

  const clearFilters = () => {
    setSearch(''); setDebouncedSearch(''); setTag(''); setExcludeTag('');
    setNeverSold(false); setInStock(false);
    setImprintId(''); setSupplierId(''); setUnmappedOnly(false);
    applyRange(null); setSoldOnly(false);
  };
  const filterCount =
    (imprintId ? 1 : 0) + (supplierId ? 1 : 0) + (unmappedOnly ? 1 : 0) +
    (inStock ? 1 : 0) + (neverSold ? 1 : 0) + (tag ? 1 : 0) + (excludeTag ? 1 : 0) + (debouncedSearch ? 1 : 0) +
    (salesRange ? 1 : 0);

  // ----- saved views: apply / build config -----
  const applyConfig = (cfg: ViewConfig) => {
    setSearch(cfg.search ?? '');
    setDebouncedSearch(cfg.search ?? '');
    setTag(cfg.tag ?? '');
    setExcludeTag(cfg.excludeTag ?? '');
    setNeverSold(!!cfg.neverSold);
    setInStock(!!cfg.inStock);
    setImprintId(cfg.imprintId ?? '');
    setSupplierId(cfg.supplierId ?? '');
    setUnmappedOnly(!!cfg.unmappedOnly);
    setSalesRange(cfg.salesFrom && cfg.salesTo ? { from: cfg.salesFrom, to: cfg.salesTo } : null);
    setSoldOnly(!!cfg.soldOnly);
    // 'publisher' is a legacy value from before the imprint split.
    const g = cfg.groupBy === 'publisher' ? 'imprint' : (cfg.groupBy ?? 'none');
    setGroupBy(g as GroupBy);
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
    excludeTag: excludeTag || undefined,
    neverSold: neverSold || undefined,
    inStock: inStock || undefined,
    imprintId: imprintId || undefined,
    supplierId: supplierId || undefined,
    unmappedOnly: unmappedOnly || undefined,
    salesFrom: salesRange?.from,
    salesTo: salesRange?.to,
    soldOnly: soldOnly || undefined,
    groupBy,
    columns: ALL_KEYS.filter(k => visible[k]),
  });

  const onSelectView = (id: string) => {
    setSelectedViewId(id);
    const v = views.find(x => x.id === id);
    if (v) { applyConfig(v.config || {}); setViewName(v.name); }
  };

  const loadViews = useCallback(() => {
    if (!userId) return;
    fetchViews(userId).then(setViews).catch(() => {});
  }, [userId]);
  useEffect(() => { loadViews(); }, [loadViews]);

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
        sort, order, groupBy,
        imprintId: imprintId || undefined,
        supplierId: supplierId || undefined,
        unmappedOnly,
        tag: tag || undefined, excludeTag: excludeTag || undefined, neverSold, inStock,
        search: debouncedSearch || undefined,
        salesFrom: salesRange?.from,
        salesTo: salesRange?.to,
        soldOnly: salesRange ? soldOnly : undefined,
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
        const g = (groupBy === 'imprint' ? r.imprint_name : r.supplier_name) || '— Unmapped —';
        if (g !== lastGroup) {
          lastGroup = g;
          out.push(
            <tr key={`g-${g}`} className="bg-gray-100 dark:bg-gray-800">
              <td className="px-3 py-2 font-semibold" colSpan={colSpan}>
                {g}
                {groupBy === 'imprint' && r.supplier_name && r.supplier_name !== g && (
                  <span className="ml-2 font-normal opacity-60 text-xs">via {r.supplier_name}</span>
                )}
              </td>
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
            <div className="absolute z-20 mt-1 w-48 max-h-72 overflow-auto rounded border bg-white dark:bg-gray-800 dark:border-gray-700 shadow p-2 text-sm">
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

        {/* Imprint = what you evaluate and cull at */}
        <select
          className="border px-2 py-2 rounded text-sm max-w-[16rem] dark:bg-gray-800 dark:text-white"
          value={imprintId}
          onChange={e => setImprintId(e.target.value)}
          title="Imprint — the publishing entity (Ten Speed, Clarkson Potter)"
        >
          <option value="">All imprints</option>
          {directory.imprints
            .filter(i => i.imprint_party_id)
            .map(i => (
              <option key={i.imprint_party_id as string} value={i.imprint_party_id as string}>
                {i.imprint_name} ({i.titles})
              </option>
            ))}
        </select>

        {/* Supplier = the ordering party returns are formed under */}
        <select
          className="border px-2 py-2 rounded text-sm max-w-[16rem] dark:bg-gray-800 dark:text-white"
          value={supplierId}
          onChange={e => setSupplierId(e.target.value)}
          title="Supplier — the ordering party we buy from and return to (PRH)"
        >
          <option value="">All suppliers</option>
          {directory.suppliers.map(s => (
            <option key={s.supplier_party_id} value={s.supplier_party_id}>
              {s.supplier_name ?? '—'} ({s.titles})
            </option>
          ))}
        </select>

        <SalesRangePicker
          value={salesRange}
          onChange={applyRange}
          lastPoDate={lastPoDate}
          lastPoLabel={lastPoLabel}
          soldOnly={soldOnly}
          onSoldOnlyChange={setSoldOnly}
        />

        <input
          type="text"
          placeholder="Tag (e.g. preorder)"
          value={tag}
          onChange={e => setTag(e.target.value)}
          className="px-3 py-2 border rounded text-sm w-40 dark:bg-gray-800 dark:text-white"
        />
        <input
          type="text"
          placeholder="Exclude tag"
          value={excludeTag}
          onChange={e => setExcludeTag(e.target.value)}
          title="Hide variants carrying this tag — e.g. preorder, to see only what can be reordered now"
          className="px-3 py-2 border rounded text-sm w-36 dark:bg-gray-800 dark:text-white"
        />
        <label className="text-sm flex items-center gap-1" title="Shortcut for Exclude tag = preorder">
          <input
            type="checkbox"
            checked={excludeTag === 'preorder'}
            onChange={e => setExcludeTag(e.target.checked ? 'preorder' : '')}
          />
          Hide preorders
        </label>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={inStock} onChange={e => setInStock(e.target.checked)} />
          In stock
        </label>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={neverSold} onChange={e => setNeverSold(e.target.checked)} />
          Never sold (12mo)
        </label>
        <label className="text-sm flex items-center gap-1" title="Titles whose vendor code has no imprint mapped yet — the cleanup list">
          <input type="checkbox" checked={unmappedOnly} onChange={e => setUnmappedOnly(e.target.checked)} />
          Unmapped imprint
        </label>
        <select
          className="border px-2 py-2 rounded text-sm dark:bg-gray-800 dark:text-white"
          value={groupBy}
          onChange={e => setGroupBy(e.target.value as GroupBy)}
        >
          <option value="none">No grouping</option>
          <option value="imprint">Group by imprint</option>
          <option value="supplier">Group by supplier</option>
        </select>
        {filterCount > 0 && (
          <button className="text-sm text-blue-600 hover:underline" onClick={clearFilters}>
            Clear filters ({filterCount})
          </button>
        )}
      </div>

      <div className="text-xs opacity-60">
        Sorted by <b>{ALL_COLUMNS.find(c => c.key === sort)?.label ?? sort}</b> {order === 'asc' ? 'ascending' : 'descending'}
        {groupBy !== 'none' && <> · within each {groupBy}</>}
        {salesRange && <> · sales counted {salesRange.from} to {salesRange.to}</>}
        {excludeTag && <> · excluding “{excludeTag}”</>}
        {' '}· click any column header to change
      </div>

      {error && (
        <div className="text-sm rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2">
          {error}
        </div>
      )}

      {/* max-h + sticky thead keeps the header visible while scrolling the rows */}
      <div className="overflow-auto border rounded-md max-h-[70vh]">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {visibleColumns.map(c => {
                const label = c.key === 'sales_12mo' && salesProvisional ? `${c.label} *` : c.label;
                return (
                  <th
                    key={c.key}
                    className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 px-3 py-2 text-left border-b border-r border-gray-200 dark:border-gray-700 whitespace-nowrap cursor-pointer select-none"
                    onClick={() => onSort(c.key)}
                    title={c.key === 'sales_12mo' ? 'Provisional until full history loads' : `Sort by ${c.label}`}
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
