import React, { useEffect, useState, useCallback } from 'react';
import { DamagedBooksService, DamagedRow } from '../components/DamagedBooksService';
import RightSidebar from '../components/RightSidebar';

const SHOPIFY_ADMIN_PREFIX = 'https://admin.shopify.com/store/castironbooks/products/';
const ONLINE_STORE_PREFIX  = 'https://www.kitchenartsandletters.com/products/';

// ─────────────────────────────────────────────────────────────────────────────
// Types for live Shopify enrichment (Phase 6B)
// ─────────────────────────────────────────────────────────────────────────────

type ChannelStatus = {
  name: string;
  is_published: boolean;
  publish_date: string | null;
};

type ProductCategory = {
  id: string;
  name: string;
  full_name: string;
} | null;

type VariantDetail = {
  id: string;
  title: string;
  inventory_quantity: number;
  weight: number | null;
  weight_unit: string;
};

type ProductDetails = {
  product_id: string;
  status: 'active' | 'draft' | 'archived' | string;
  published_at: string | null;
  online_store_published: boolean;
  channels: ChannelStatus[];
  category: ProductCategory;
  weight: number | null;
  weight_unit: string | null;
  variants: VariantDetail[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar enrichment sub-components
// ─────────────────────────────────────────────────────────────────────────────

function EnrichmentSpinner() {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 py-2">
      <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Loading live data…
    </div>
  );
}

function EnrichmentError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-red-500 dark:text-red-400">Could not fetch live data</span>
      <button
        onClick={onRetry}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        Retry
      </button>
    </div>
  );
}

function PublishStatusSection({ details }: { details: ProductDetails }) {
  const statusColor =
    details.status === 'active'   ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
    details.status === 'archived' ? 'bg-gray-100  text-gray-600  dark:bg-gray-800      dark:text-gray-400'  :
                                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';

  return (
    <div className="space-y-2.5">
      {/* Product status */}
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Product Status</label>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold capitalize ${statusColor}`}>
          {details.status}
        </span>
      </div>

      {/* Per-channel rows */}
      {details.channels.length > 0 ? (
        <div className="space-y-1.5">
          {details.channels.map((ch, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">{ch.name}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${ch.is_published ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                {ch.is_published ? (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Published
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    Unpublished
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No channel data returned.</p>
      )}

      {/* Online Store summary when channels don't surface it separately */}
      {details.channels.length === 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600 dark:text-gray-400">Online Store</span>
          <span className={`text-xs font-medium ${details.online_store_published ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
            {details.online_store_published ? '✓ Published' : '✗ Unpublished'}
          </span>
        </div>
      )}
    </div>
  );
}

function WeightCategorySection({ details }: { details: ProductDetails }) {
  const CONDITION_COLORS: Record<string, string> = {
    'Light Damage':    'text-amber-600 dark:text-amber-400',
    'Moderate Damage': 'text-orange-600 dark:text-orange-400',
    'Heavy Damage':    'text-red-600 dark:text-red-400',
  };

  const formatWeight = (val: number | null, unit: string | null) => {
    if (val === null || val === undefined) return '—';
    const u = (unit || 'g').toLowerCase();
    // Convert to most readable unit
    if (u === 'g' && val >= 1000) return `${(val / 1000).toFixed(2)} kg`;
    if (u === 'kg' && val < 1)    return `${(val * 1000).toFixed(0)} g`;
    return `${val} ${u}`;
  };

  return (
    <div className="space-y-3">
      {/* Weight */}
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Weight</label>
        <span className="text-sm text-gray-900 dark:text-white">
          {formatWeight(details.weight, details.weight_unit)}
        </span>
      </div>

      {/* Taxonomy category */}
      <div>
        <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold block mb-1">Category</label>
        {details.category ? (
          <div className="text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1.5 rounded font-mono break-all">
            {details.category.full_name ?? details.category.name}
          </div>
        ) : (
          <span className="text-xs text-yellow-600 dark:text-yellow-400 italic">
            No taxonomy category set
          </span>
        )}
      </div>

      {/* Stock by condition */}
      {details.variants.length > 0 && (
        <div>
          <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold block mb-2">
            Stock by Condition
          </label>
          <div className="space-y-1.5">
            {details.variants.map((v, i) => {
              const color = CONDITION_COLORS[v.title ?? ''] ?? 'text-gray-600 dark:text-gray-400';
              const inStock = (v.inventory_quantity ?? 0) > 0;
              return (
                <div key={i} className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${color}`}>{v.title}</span>
                  <div className="flex items-center gap-1.5">
                    {/* Mini stock bar */}
                    <div className="flex gap-0.5">
                      {Array.from({ length: Math.min(v.inventory_quantity ?? 0, 5) }).map((_, j) => (
                        <div key={j} className="w-1.5 h-3 rounded-sm bg-green-400 dark:bg-green-500" />
                      ))}
                      {!inStock && (
                        <div className="w-1.5 h-3 rounded-sm bg-gray-200 dark:bg-gray-700" />
                      )}
                    </div>
                    <span className={`text-xs font-semibold ${inStock ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {inStock ? `${v.inventory_quantity}` : 'Out'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function DamagedBooksTable() {
  const [rows,        setRows]        = useState<DamagedRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState<DamagedRow | null>(null);
  const [status,      setStatus]      = useState<{ at: string; inspected: number; updated: number; skipped: number } | null>(null);
  const [searchTerm,  setSearchTerm]  = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [sortConfig,  setSortConfig]  = useState<{ key: keyof DamagedRow; direction: 'asc' | 'desc' } | null>({
    key: 'title', direction: 'asc',
  });

  // ── Phase 6B: live enrichment state ──────────────────────────────────────
  const [productDetails,  setProductDetails]  = useState<ProductDetails | null>(null);
  const [detailsLoading,  setDetailsLoading]  = useState(false);
  const [detailsError,    setDetailsError]    = useState(false);

  // ── Data load ─────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [inventory, reconcileStatus] = await Promise.all([
          DamagedBooksService.listDamagedInventory(),
          DamagedBooksService.status(),
        ]);
        setRows(inventory.data);
        setStatus(reconcileStatus);
      } catch (e) {
        console.error('Failed to load', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Fetch live Shopify details when sidebar opens ─────────────────────────
  const fetchDetails = useCallback(async (productId: string) => {
    setProductDetails(null);
    setDetailsError(false);
    setDetailsLoading(true);
    try {
      const details = await DamagedBooksService.getProductDetails(productId);
      setProductDetails(details);
    } catch (e) {
      console.error('[ProductDetails]', e);
      setDetailsError(true);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected?.product_id) {
      fetchDetails(String(selected.product_id));
    } else {
      setProductDetails(null);
      setDetailsError(false);
    }
  }, [selected, fetchDetails]);

  // ── Sort / filter ─────────────────────────────────────────────────────────

  const handleSort = (key: keyof DamagedRow) => {
    setSortConfig(prev =>
      prev?.key === key && prev.direction === 'asc'
        ? { key, direction: 'desc' }
        : { key, direction: 'asc' }
    );
  };

  const filteredRows = rows
    .filter(r => {
      const q = searchTerm.toLowerCase();
      return r.title?.toLowerCase().includes(q) || r.barcode?.toLowerCase().includes(q);
    })
    .filter(r => stockFilter === 'all' || r.stock_status === stockFilter);

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortConfig) return 0;
    const aVal = a[sortConfig.key] ?? '';
    const bVal = b[sortConfig.key] ?? '';
    const order = sortConfig.direction === 'asc' ? 1 : -1;
    if (sortConfig.key === 'stock_status') {
      const score = (s: string) => s === 'in_stock' ? 1 : 0;
      return (score(String(aVal)) - score(String(bVal))) * order;
    }
    return String(aVal).localeCompare(String(bVal)) * order;
  });

  if (loading) return <div className="text-sm text-gray-700 dark:text-gray-300">Loading damaged inventory…</div>;

  // ── Sidebar content ───────────────────────────────────────────────────────

  const renderSidebarContent = () => {
    if (!selected) return null;

    return (
      <div className="space-y-6">

        {/* ── Existing fields ── */}
        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Title</label>
            <div className="text-base font-medium text-gray-900 dark:text-white">{selected.title}</div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Handle</label>
            <div className="font-mono text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1 break-all">
              {selected.handle ?? '—'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Condition</label>
              <div className="capitalize text-gray-900 dark:text-white">{selected.condition_raw ?? selected.condition_key}</div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Quantity</label>
              <div className="text-gray-900 dark:text-white">{selected.available}</div>
            </div>
          </div>
        </div>

        <hr className="border-gray-200 dark:border-gray-700" />

        {/* ── Phase 6B: Shopify Status ── */}
        <div>
          <h4 className="text-sm font-bold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
            Shopify Status
            {detailsLoading && (
              <svg className="w-3.5 h-3.5 animate-spin text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </h4>
          {detailsLoading && <EnrichmentSpinner />}
          {detailsError && !detailsLoading && (
            <EnrichmentError onRetry={() => selected?.product_id && fetchDetails(String(selected.product_id))} />
          )}
          {productDetails && !detailsLoading && (
            <PublishStatusSection details={productDetails} />
          )}
        </div>

        <hr className="border-gray-200 dark:border-gray-700" />

        {/* ── Phase 6B: Product Details ── */}
        <div>
          <h4 className="text-sm font-bold mb-3 text-gray-900 dark:text-white">Product Details</h4>
          {detailsLoading && <EnrichmentSpinner />}
          {detailsError && !detailsLoading && (
            <EnrichmentError onRetry={() => selected?.product_id && fetchDetails(String(selected.product_id))} />
          )}
          {productDetails && !detailsLoading && (
            <WeightCategorySection details={productDetails} />
          )}
        </div>

        <hr className="border-gray-200 dark:border-gray-700" />

        {/* ── See it Live ── */}
        <div>
          <h4 className="text-sm font-bold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">See it Live</h4>
          <div className="space-y-2">
            <a
              href={`${SHOPIFY_ADMIN_PREFIX}${selected.product_id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
            >
              <div>
                <div className="font-medium text-blue-600 dark:text-blue-400 group-hover:underline">Shopify Admin</div>
                <div className="text-xs text-gray-500">Edit product settings</div>
              </div>
              <span className="text-gray-400">↗</span>
            </a>
            <a
              href={`${ONLINE_STORE_PREFIX}${selected.handle}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
            >
              <div>
                <div className="font-medium text-blue-600 dark:text-blue-400 group-hover:underline">Website PDP</div>
                <div className="text-xs text-gray-500">View public product page</div>
              </div>
              <span className="text-gray-400">↗</span>
            </a>
          </div>
        </div>
      </div>
    );
  };

  // ── Table ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 w-full max-w-[100vw]">

      {/* Header & Reconcile */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-row items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold dark:text-white">Damaged Inventory</h2>
            <span className="text-sm opacity-70 dark:text-gray-400">{rows.length} rows</span>
          </div>
          <button
            className="hidden sm:block bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm w-auto transition-colors"
            onClick={async () => {
              await DamagedBooksService.reconcileNow();
              const [invRes, statusRes] = await Promise.all([
                DamagedBooksService.listDamagedInventory(),
                DamagedBooksService.status(),
              ]);
              setRows(invRes.data);
              setStatus(statusRes);
            }}
          >
            Reconcile Now
          </button>
        </div>

        {status && (
          <div className="hidden sm:block text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-2 rounded">
            Last reconcile: {new Date(status.at).toLocaleString()}
            <span className="hidden sm:inline"> — </span>
            <span className="block sm:inline mt-1 sm:mt-0">
              Inspected: {status.inspected}, Updated: {status.updated}, Skipped: {status.skipped}
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 py-3 -mt-2 flex flex-col sm:flex-row gap-3 border-b dark:border-gray-800 sm:border-none">
        <input
          type="text"
          placeholder="Search title..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-auto flex-1 shadow-sm"
        />
        <select
          className="border px-3 py-2 rounded text-sm dark:bg-gray-800 dark:text-white dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-auto shadow-sm"
          value={stockFilter}
          onChange={e => setStockFilter(e.target.value as any)}
        >
          <option value="all">All Stock Status</option>
          <option value="in_stock">In Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-md dark:border-gray-700">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3 text-left font-medium border-b dark:border-gray-700 cursor-pointer" onClick={() => handleSort('title')}>Title</th>
              <th className="px-3 py-3 text-left font-medium border-b dark:border-gray-700 hidden sm:table-cell">Condition</th>
              <th className="px-3 py-3 text-center font-medium border-b dark:border-gray-700 w-16">Avail</th>
              <th className="px-3 py-3 text-left font-medium border-b dark:border-gray-700 hidden md:table-cell">Author</th>
              <th className="px-3 py-3 text-left font-medium border-b dark:border-gray-700 cursor-pointer" onClick={() => handleSort('stock_status')}>Status</th>
              <th className="px-3 py-3 text-right font-medium border-b dark:border-gray-700">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
            {sortedRows.map(r => (
              <tr key={r.inventory_item_id} className="even:bg-gray-50 dark:even:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <td className="px-3 py-3 max-w-[150px] sm:max-w-xs truncate font-medium text-gray-900 dark:text-white">
                  {r.title ?? r.handle}
                </td>
                <td className="px-3 py-3 capitalize text-gray-600 dark:text-gray-300 hidden sm:table-cell">
                  {r.condition_raw ?? r.condition_key ?? '—'}
                </td>
                <td className="px-3 py-3 text-center text-gray-900 dark:text-white">
                  {r.available}
                </td>
                <td className="px-3 py-3 hidden md:table-cell text-gray-500 dark:text-gray-400 max-w-[150px] truncate">
                  {r.sku ?? '—'}
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    r.stock_status === 'in_stock'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                  }`}>
                    {r.stock_status === 'in_stock' ? 'In Stock' : 'Out'}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                    onClick={() => setSelected(r)}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={6}>
                  No items found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Right Sidebar */}
      <RightSidebar
        row={selected}
        onClose={() => {
          setSelected(null);
          setProductDetails(null);
          setDetailsError(false);
        }}
        renderRowContent={renderSidebarContent}
      />
    </div>
  );
}