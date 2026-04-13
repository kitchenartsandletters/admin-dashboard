import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Exclusion {
  id:            string;
  product_id:    string;
  product_title: string | null;
  reason:        string | null;
  created_at:    string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function numericId(gid: string): string {
  // gid://shopify/Product/123456 → 123456
  return gid.split('/').pop() ?? gid;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReportExclusionsPage() {
  const { role } = useAuth();
  const canEdit  = role === 'admin' || role === 'editor';

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  const token   = import.meta.env.VITE_ADMIN_TOKEN;

  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Add form state
  const [addProductId, setAddProductId]       = useState('');
  const [addProductTitle, setAddProductTitle] = useState('');
  const [addReason, setAddReason]             = useState('');
  const [adding, setAdding]                   = useState(false);
  const [addMsg, setAddMsg]                   = useState<string | null>(null);

  // Remove state
  const [removing, setRemoving] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState('');

  const fetchExclusions = useCallback(async () => {
    if (!apiBase || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/reports/exclusions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setExclusions(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Failed to load exclusions.');
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => { fetchExclusions(); }, [fetchExclusions]);

  async function handleAdd() {
    const pid = addProductId.trim();
    if (!pid) { setAddMsg('Product ID is required.'); return; }

    // Accept numeric ID and convert to GID
    const gid = pid.startsWith('gid://') ? pid : `gid://shopify/Product/${pid}`;

    setAdding(true); setAddMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/reports/exclusions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_id:    gid,
          product_title: addProductTitle.trim() || null,
          reason:        addReason.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAddProductId(''); setAddProductTitle(''); setAddReason('');
      setAddMsg('Added.');
      await fetchExclusions();
    } catch (e: any) {
      setAddMsg(e?.message || 'Failed to add.');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setRemoving(id);
    try {
      const res = await fetch(`${apiBase}/api/reports/exclusions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setExclusions(prev => prev.filter(e => e.id !== id));
    } catch (e: any) {
      setError(e?.message || 'Failed to remove.');
    } finally {
      setRemoving(null);
    }
  }

  const filtered = exclusions.filter(e =>
    !search ||
    (e.product_title?.toLowerCase().includes(search.toLowerCase())) ||
    e.product_id.includes(search) ||
    (e.reason?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Report exclusions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Products excluded from daily sales reports. Separate from the request-service
          blacklist — this only affects report output.
        </p>
      </header>

      {/* Add form — admins and editors */}
      {canEdit && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Add exclusion</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400">
                Product ID <span className="text-gray-400">(numeric or full GID)</span>
              </label>
              <input
                type="text"
                value={addProductId}
                onChange={e => setAddProductId(e.target.value)}
                placeholder="123456789 or gid://shopify/Product/..."
                className="w-full rounded border px-2 py-1.5 text-sm
                  bg-white text-gray-900 border-gray-300
                  dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                  focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400">
                Product title <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={addProductTitle}
                onChange={e => setAddProductTitle(e.target.value)}
                placeholder="e.g. Cookbook Club Subscription"
                className="w-full rounded border px-2 py-1.5 text-sm
                  bg-white text-gray-900 border-gray-300
                  dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                  focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400">
                Reason <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={addReason}
                onChange={e => setAddReason(e.target.value)}
                placeholder="e.g. Internal use only"
                className="w-full rounded border px-2 py-1.5 text-sm
                  bg-white text-gray-900 border-gray-300
                  dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                  focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAdd}
              disabled={adding || !addProductId.trim()}
              className="px-4 py-1.5 rounded text-sm font-medium
                bg-gray-900 text-white hover:bg-gray-700
                dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300
                disabled:opacity-40 transition-colors"
            >
              {adding ? 'Adding…' : 'Add exclusion'}
            </button>
            {addMsg && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{addMsg}</p>
            )}
          </div>
        </div>
      )}

      {/* Search + list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {exclusions.length} {exclusions.length === 1 ? 'product' : 'products'} excluded
          </p>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, ID, or reason…"
            className="rounded border px-2 py-1.5 text-sm w-64
              bg-white text-gray-900 border-gray-300
              dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
              focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {search ? 'No results for that search.' : 'No exclusions defined.'}
          </p>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Product
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Product ID
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Reason
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    Added
                  </th>
                  {canEdit && (
                    <th className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700" />
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((ex, i) => (
                  <tr
                    key={ex.id}
                    className={`${i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/40'} border-b border-gray-100 dark:border-gray-800 last:border-0`}
                  >
                    <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">
                      {ex.product_title || <span className="text-gray-400 dark:text-gray-500 italic">—</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                      <a
                        href={`https://admin.shopify.com/store/kitchenartsandletters/products/${numericId(ex.product_id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                        title={ex.product_id}
                      >
                        {numericId(ex.product_id)}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 text-xs">
                      {ex.reason || <span className="text-gray-300 dark:text-gray-600 italic">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">
                      {fmtDate(ex.created_at)}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleRemove(ex.id)}
                          disabled={removing === ex.id}
                          className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40"
                        >
                          {removing === ex.id ? 'Removing…' : 'Remove'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}