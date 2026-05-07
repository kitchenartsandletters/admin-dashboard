import React, { useEffect, useState, useCallback } from 'react';
import { DamagedBooksService } from '../DamagedBooksService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type VariantInfo = {
  condition: string;
  variant_id?: string | null;
  quantity_set?: number | null;
  price?: number | null;
  sku?: string | null;
  barcode?: string | null;
};

type LogRow = {
  id: number;
  canonical_handle: string;
  damaged_handle: string | null;
  damaged_product_id: string | null;
  variants_json: VariantInfo[] | null;
  operator: string | null;
  dry_run: boolean;
  status: 'created' | 'updated' | 'error' | 'dry-run' | string;
  message: string | null;
  created_at: string;
};

type StatusFilter = 'all' | 'created' | 'updated' | 'error' | 'dry-run';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SHOPIFY_ADMIN_PREFIX = 'https://admin.shopify.com/store/castironbooks/products/';

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; pill: string }> = {
  created: {
    label: 'Created',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
      </svg>
    ),
    pill: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  updated: {
    label: 'Updated',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    pill: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  error: {
    label: 'Error',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    pill: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  },
  'dry-run': {
    label: 'Dry Run',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    pill: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
};

const CONDITIONS: Record<string, { color: string }> = {
  'Light Damage':    { color: 'text-amber-600 dark:text-amber-400' },
  'Moderate Damage': { color: 'text-orange-600 dark:text-orange-400' },
  'Heavy Damage':    { color: 'text-red-600 dark:text-red-400' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function displayHandle(handle: string): string {
  return handle
    .replace(/-damaged$/, '')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    icon: null,
    pill: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.pill}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function VariantTable({ variants }: { variants: VariantInfo[] }) {
  if (!variants || variants.length === 0) return (
    <p className="text-xs text-gray-400 italic">No variant data recorded.</p>
  );
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-gray-400 uppercase tracking-wider text-left">
          <th className="pb-1.5 font-semibold">Condition</th>
          <th className="pb-1.5 font-semibold text-center">Qty</th>
          <th className="pb-1.5 font-semibold text-right">Price</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {variants.map((v, i) => {
          const condMeta = CONDITIONS[v.condition] ?? { color: 'text-gray-600 dark:text-gray-400' };
          return (
            <tr key={i}>
              <td className={`py-1.5 font-medium ${condMeta.color}`}>{v.condition}</td>
              <td className="py-1.5 text-center text-gray-700 dark:text-gray-300">{v.quantity_set ?? '—'}</td>
              <td className="py-1.5 text-right text-gray-700 dark:text-gray-300">
                {v.price != null ? `$${Number(v.price).toFixed(2)}` : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LogRowExpanded({ row }: { row: LogRow }) {
  const adminUrl = row.damaged_product_id
    ? `${SHOPIFY_ADMIN_PREFIX}${row.damaged_product_id}`
    : null;

  return (
    <div className="px-4 pb-4 pt-3 bg-gray-50 dark:bg-gray-800/50 border-t dark:border-gray-700 space-y-4">

      {/* Handles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Canonical</p>
          <p className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">{row.canonical_handle}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Damaged</p>
          <p className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">{row.damaged_handle ?? '—'}</p>
        </div>
      </div>

      {/* Message */}
      {row.message && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Message</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{row.message}</p>
        </div>
      )}

      {/* Variants */}
      {row.variants_json && row.variants_json.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Variants Created</p>
          <VariantTable variants={row.variants_json} />
        </div>
      )}

      {/* Footer: timestamp + admin link */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-gray-400">
          {new Date(row.created_at).toLocaleString()}
          {row.operator && ` · ${row.operator}`}
          {row.dry_run && <span className="ml-2 text-gray-400 italic">dry run</span>}
        </p>
        {adminUrl && (
          <a
            href={adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Shopify Admin
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function CreationLogPage() {
  const [rows,        setRows]        = useState<LogRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [search,      setSearch]      = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await DamagedBooksService.getCreationLog(200);
      setRows(resp.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load creation log.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || r.canonical_handle.toLowerCase().includes(q)
      || (r.damaged_handle ?? '').toLowerCase().includes(q)
      || (r.message ?? '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 w-full">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold dark:text-white">Creation Log</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Audit history of all bulk create wizard runs.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Summary pills ── */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_META).map(([key, meta]) =>
            counts[key] ? (
              <button
                key={key}
                onClick={() => setStatusFilter(prev => prev === key ? 'all' : key as StatusFilter)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all
                  ${statusFilter === key
                    ? `${meta.pill} ring-2 ring-offset-1 ring-current`
                    : meta.pill}`}
              >
                {meta.icon}
                {counts[key]} {meta.label}
              </button>
            ) : null
          )}
          {statusFilter !== 'all' && (
            <button
              onClick={() => setStatusFilter('all')}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2"
            >
              Clear filter ×
            </button>
          )}
        </div>
      )}

      {/* ── Search + filter bar ── */}
      <div className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by handle or message…"
          className="flex-1 px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:text-white dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm placeholder-gray-400"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="border px-3 py-2 rounded-lg text-sm dark:bg-gray-800 dark:text-white dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
        >
          <option value="all">All statuses</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="error">Error</option>
          <option value="dry-run">Dry Run</option>
        </select>
      </div>

      {/* ── States ── */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-8 justify-center">
          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Loading…
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" />
          </svg>
          {error}
        </div>
      )}

      {/* ── Log table ── */}
      {!loading && !error && (
        <>
          <div className="border dark:border-gray-700 rounded-xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                {rows.length === 0 ? 'No creation log entries yet.' : 'No entries match your filters.'}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map(row => {
                  const isExpanded = expandedId === row.id;
                  const variantCount = (row.variants_json ?? []).filter(v => (v.quantity_set ?? 0) > 0).length;

                  return (
                    <div key={row.id} className="bg-white dark:bg-gray-900">

                      {/* Row header — click to expand */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                      >
                        <div className="flex items-center gap-3">

                          {/* Expand chevron */}
                          <svg
                            className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>

                          {/* Title + handles */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {displayHandle(row.canonical_handle)}
                              </span>
                              <StatusPill status={row.status} />
                              {row.dry_run && (
                                <span className="text-xs text-gray-400 italic">dry run</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5 truncate">
                              {row.canonical_handle}
                            </p>
                          </div>

                          {/* Right side: variant count + time */}
                          <div className="flex-shrink-0 text-right">
                            {variantCount > 0 && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {variantCount} variant{variantCount !== 1 ? 's' : ''}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {timeAgo(row.created_at)}
                            </p>
                          </div>
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && <LogRowExpanded row={row} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {filtered.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
              Showing {filtered.length} of {rows.length} entries
            </p>
          )}
        </>
      )}
    </div>
  );
}