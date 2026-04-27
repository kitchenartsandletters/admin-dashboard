import { useState, useEffect, useCallback } from 'react';
import ConfirmModal from './ConfirmModal';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface PreorderProduct {
  product_id: number;
  title: string;
  isbn: string | null;
  pub_date: string | null;
  classification: string;
  inventory: number;
  total_presale_qty: number;
  data_confidence: string;
  preorder_tag_present: boolean;
  preorder_collection_present: boolean;
  anomaly_type: string | null;
  last_updated: string | null;
}

interface CleanupState {
  product_id: number;
  product_gid: string;
  title: string;
  description_status: 'enriched' | 'partial' | 'cleaned';
  description_needs_cleaning: boolean;
  has_preamble: boolean;
  has_footer: boolean;
  tags: string[];
  inventory: number;
  barcode: string | null;
  pub_date: string | null;
  in_preorder_collection: boolean;
  published_to_catch_all: boolean;
}

interface CleanupResult {
  product_id: number;
  title: string;
  action: string;
  steps: {
    clean_description: { result: string; errors?: any[] | null };
    remove_from_collection: { result: string; errors?: any[] | null };
    unpublish_catch_all: { result: string; errors?: any[] | null };
  };
  overall: string;
}

type SortKey = keyof PreorderProduct;
type SortDir = 'asc' | 'desc';

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────

const PREORDER_SERVICE_URL = import.meta.env.VITE_PREORDER_BASE_URL;
const ADMIN_TOKEN = import.meta.env.VITE_PREORDER_ADMIN_TOKEN;

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Admin-Token': ADMIN_TOKEN,
});

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function classificationBadge(classification: string): { label: string; classes: string } {
  switch (classification) {
    case 'active_preorder':
      return { label: 'Active', classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' };
    case 'early_stock_arrival':
      return { label: 'Early Stock', classes: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' };
    case 'historical_preorder':
      return { label: 'Historical', classes: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
    default:
      if (classification.startsWith('anomaly_'))
        return { label: classification.replace('anomaly_', '').replace(/_/g, ' '), classes: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' };
      return { label: classification, classes: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
  }
}

function descriptionBadge(status: string): { label: string; classes: string } {
  switch (status) {
    case 'enriched':
      return { label: 'Enriched', classes: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
    case 'partial':
      return { label: 'Partial', classes: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' };
    case 'cleaned':
      return { label: 'Cleaned', classes: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
    default:
      return { label: status, classes: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
  }
}

function stripArticle(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '');
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

const ReleaseManagement = () => {
  // Data
  const [products, setProducts] = useState<PreorderProduct[]>([]);
  const [cleanupStates, setCleanupStates] = useState<Record<number, CleanupState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('pub_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Filter
  const [filter, setFilter] = useState<'all' | 'needs_cleanup' | 'active' | 'historical'>('all');
  const [search, setSearch] = useState('');

  // Cleanup action state
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [actionResults, setActionResults] = useState<Record<number, CleanupResult>>({});
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    productId: number;
    title: string;
    action: 'full' | 'description' | 'collection' | 'unpublish';
  }>({ open: false, productId: 0, title: '', action: 'full' });

  // ── Fetch products from Supabase view ──
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${PREORDER_SERVICE_URL}/admin/preorders/products`, {
        headers: headers(),
      });
      if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
      const data: PreorderProduct[] = await res.json();
      setProducts(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ── Fetch cleanup state for a single product ──
  const fetchCleanupState = async (productId: number) => {
    try {
      const res = await fetch(
        `${PREORDER_SERVICE_URL}/admin/preorders/cleanup/state/${productId}`,
        { headers: headers() }
      );
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data: CleanupState = await res.json();
      setCleanupStates((prev) => ({ ...prev, [productId]: data }));
    } catch (e) {
      console.error(`Failed to fetch cleanup state for ${productId}:`, e);
    }
  };

  // ── Run cleanup action ──
  const runCleanup = async (productId: number, action: string) => {
    setActionLoading((prev) => ({ ...prev, [productId]: true }));
    try {
      const res = await fetch(
        `${PREORDER_SERVICE_URL}/admin/preorders/cleanup/${action}/${productId}`,
        { method: 'POST', headers: headers() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Cleanup failed');

      setActionResults((prev) => ({ ...prev, [productId]: data }));

      // Refresh cleanup state for this product
      await fetchCleanupState(productId);
    } catch (e: any) {
      console.error(`Cleanup failed for ${productId}:`, e);
      setActionResults((prev) => ({
        ...prev,
        [productId]: {
          product_id: productId,
          title: '',
          action,
          steps: {} as any,
          overall: 'error',
        },
      }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [productId]: false }));
    }
  };

  // ── Sort ──
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return '⇅';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  // ── Filter + sort products ──
  const filteredProducts = products
    .filter((p) => {
      // Status filter
      if (filter === 'active' && p.classification !== 'active_preorder' && p.classification !== 'early_stock_arrival') return false;
      if (filter === 'historical' && p.classification !== 'historical_preorder') return false;
      if (filter === 'needs_cleanup') {
        const cs = cleanupStates[p.product_id];
        if (!cs) return true; // Not yet loaded — include so user can inspect
        if (cs.description_needs_cleaning || cs.in_preorder_collection || cs.published_to_catch_all) return true;
        return false;
      }
      // Search
      if (search) {
        const term = search.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(term);
        const matchIsbn = (p.isbn || '').includes(term);
        const matchId = p.product_id.toString().includes(term);
        if (!matchTitle && !matchIsbn && !matchId) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];

      // Article-stripping for title sort
      if (sortKey === 'title') {
        aVal = stripArticle(aVal || '');
        bVal = stripArticle(bVal || '');
      }

      // Nulls last
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  // ── Determine if product is past pub date (cleanup candidate) ──
  const isPastPubDate = (pubDate: string | null): boolean => {
    if (!pubDate) return false;
    return new Date(pubDate + 'T00:00:00') <= new Date();
  };

  // ── Render ──
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 dark:text-red-400 p-4">
        <p className="font-semibold">Error loading preorder products</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={fetchProducts}
          className="mt-3 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Release Management
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {products.length} preorder products · Inspect and clean up products at pub date
        </p>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          type="text"
          placeholder="Search by title, ISBN, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[240px]"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="all">All Products</option>
          <option value="active">Active / Early Stock</option>
          <option value="historical">Historical</option>
          <option value="needs_cleanup">Needs Cleanup</option>
        </select>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Showing {filteredProducts.length} of {products.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 text-left">
              <th
                onClick={() => handleSort('title')}
                className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-white"
              >
                Title {sortIcon('title')}
              </th>
              <th
                onClick={() => handleSort('pub_date')}
                className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-white whitespace-nowrap"
              >
                Pub Date {sortIcon('pub_date')}
              </th>
              <th
                onClick={() => handleSort('classification')}
                className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-white"
              >
                Status {sortIcon('classification')}
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                Body HTML
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                Collection
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                Catch All
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => {
              const cs = cleanupStates[product.product_id];
              const isLoading = actionLoading[product.product_id];
              const result = actionResults[product.product_id];
              const pastPub = isPastPubDate(product.pub_date);
              const badge = classificationBadge(product.classification);

              return (
                <tr
                  key={product.product_id}
                  className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  {/* Title */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100 max-w-[300px] truncate">
                      {product.title}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {product.isbn || product.product_id}
                    </div>
                  </td>

                  {/* Pub Date */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={pastPub ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}>
                      {formatDate(product.pub_date)}
                    </span>
                    {pastPub && (
                      <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">past</span>
                    )}
                  </td>

                  {/* Classification */}
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.classes}`}>
                      {badge.label}
                    </span>
                  </td>

                  {/* Body HTML status */}
                  <td className="px-4 py-3">
                    {cs ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${descriptionBadge(cs.description_status).classes}`}>
                        {descriptionBadge(cs.description_status).label}
                      </span>
                    ) : (
                      <button
                        onClick={() => fetchCleanupState(product.product_id)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Inspect
                      </button>
                    )}
                  </td>

                  {/* Collection */}
                  <td className="px-4 py-3 text-center">
                    {cs ? (
                      cs.in_preorder_collection ? (
                        <span className="text-green-600 dark:text-green-400 text-xs font-medium">In</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">Out</span>
                      )
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>

                  {/* Catch All */}
                  <td className="px-4 py-3 text-center">
                    {cs ? (
                      cs.published_to_catch_all ? (
                        <span className="text-green-600 dark:text-green-400 text-xs font-medium">On</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">Off</span>
                      )
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {!cs && (
                        <button
                          onClick={() => fetchCleanupState(product.product_id)}
                          className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600
                                     text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800
                                     hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Inspect
                        </button>
                      )}

                      {cs && pastPub && (cs.description_needs_cleaning || cs.in_preorder_collection || cs.published_to_catch_all) && (
                        <button
                          onClick={() =>
                            setConfirmModal({
                              open: true,
                              productId: product.product_id,
                              title: product.title,
                              action: 'full',
                            })
                          }
                          disabled={isLoading}
                          className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white
                                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isLoading ? 'Running…' : 'Full Cleanup'}
                        </button>
                      )}

                      {cs && !pastPub && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                          Not yet due
                        </span>
                      )}

                      {cs && pastPub && !cs.description_needs_cleaning && !cs.in_preorder_collection && !cs.published_to_catch_all && (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          ✓ Clean
                        </span>
                      )}

                      {/* Step-level results */}
                      {result && result.overall && (
                        <span
                          className={`text-xs font-medium ${
                            result.overall === 'success'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {result.overall === 'success' ? '✓ Done' : '⚠ Partial'}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                  No products match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmModal.open}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={async () => {
          setConfirmModal((prev) => ({ ...prev, open: false }));
          await runCleanup(confirmModal.productId, confirmModal.action);
        }}
        title="Run Full Cleanup"
        variant="primary"
        confirmLabel="Run Cleanup"
      >
        <p>
          This will clean the Body HTML, remove from the Preorder collection, and unpublish from
          Catch All for:
        </p>
        <p className="font-medium mt-2">{confirmModal.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Each step is independent — already-clean steps will be skipped.
        </p>
      </ConfirmModal>
    </div>
  );
};

export default ReleaseManagement;