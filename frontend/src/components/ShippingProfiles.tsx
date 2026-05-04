import { useState, useEffect, useCallback, useMemo } from 'react';
import ConfirmModal from './ConfirmModal';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface ProfileProduct {
  product_gid: string;
  product_id: number;
  title: string;
  variants: { variant_gid: string; variant_title: string }[];
}

interface ShippingProfile {
  profile_gid: string;
  profile_id: number;
  name: string;
  is_default: boolean;
  pub_date: string | null;
  product_count: number;
  products: ProfileProduct[];
}

interface ReconcileReport {
  summary: {
    correctly_assigned: number;
    wrong_profile: number;
    missing_from_profile: number;
    should_be_removed: number;
    no_pub_date: number;
  };
  report: {
    correctly_assigned: { product_id: number; pub_date: string; profile: string }[];
    wrong_profile: { product_id: number; pub_date: string; expected_profile: string; current_profile: string }[];
    missing_from_profile: { product_id: number; pub_date: string; expected_profile: string }[];
    should_be_removed: { product_id: number; pub_date: string; current_profile: string }[];
    no_pub_date: { product_id: number; status: string }[];
  };
}

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────

const PREORDER_SERVICE_URL = import.meta.env.VITE_PREORDER_SERVICE_URL;
const ADMIN_TOKEN = import.meta.env.VITE_PREORDER_ADMIN_TOKEN;

const apiHeaders = () => ({
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

function isUpcoming(dateStr: string | null, days: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const future = new Date(today);
  future.setDate(future.getDate() + days);
  return d >= today && d <= future;
}

function isPast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

const ShippingProfiles = () => {
  const [profiles, setProfiles] = useState<ShippingProfile[]>([]);
  const [reconcile, setReconcile] = useState<ReconcileReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [actionResults, setActionResults] = useState<Record<number, string>>({});
  const [expandedProfile, setExpandedProfile] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    productId: number;
    pubDate: string;
    title: string;
    action: 'assign' | 'remove';
    profileName?: string;
  }>({ open: false, productId: 0, pubDate: '', title: '', action: 'assign' });

  // ── Fetch profiles ──
  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${PREORDER_SERVICE_URL}/admin/preorders/shipping/profiles`, {
        headers: apiHeaders(),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setProfiles(data.profiles || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Reconcile ──
  const runReconcile = useCallback(async () => {
    try {
      setReconciling(true);
      const res = await fetch(`${PREORDER_SERVICE_URL}/admin/preorders/shipping/profiles/reconcile`, {
        method: 'POST',
        headers: apiHeaders(),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data: ReconcileReport = await res.json();
      setReconcile(data);
    } catch (e: any) {
      console.error('Reconcile failed:', e);
    } finally {
      setReconciling(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
    runReconcile();
  }, [fetchProfiles, runReconcile]);

  // ── Assign product ──
  const assignProduct = async (productId: number, pubDate: string) => {
    setActionLoading((prev) => ({ ...prev, [productId]: true }));
    try {
      const res = await fetch(
        `${PREORDER_SERVICE_URL}/admin/preorders/shipping/profiles/assign/${productId}`,
        {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ pub_date: pubDate }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Assign failed');
      setActionResults((prev) => ({ ...prev, [productId]: `Assigned to ${data.profile_name}` }));
      await fetchProfiles();
      await runReconcile();
    } catch (e: any) {
      setActionResults((prev) => ({ ...prev, [productId]: `Error: ${e.message}` }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [productId]: false }));
    }
  };

  // ── Remove product ──
  const removeProduct = async (productId: number) => {
    setActionLoading((prev) => ({ ...prev, [productId]: true }));
    try {
      const res = await fetch(
        `${PREORDER_SERVICE_URL}/admin/preorders/shipping/profiles/remove/${productId}`,
        { method: 'POST', headers: apiHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Remove failed');
      setActionResults((prev) => ({ ...prev, [productId]: 'Removed to General' }));
      await fetchProfiles();
      await runReconcile();
    } catch (e: any) {
      setActionResults((prev) => ({ ...prev, [productId]: `Error: ${e.message}` }));
    } finally {
      setActionLoading((prev) => ({ ...prev, [productId]: false }));
    }
  };

  // ── Sorted profiles ──
  const sortedProfiles = useMemo(() => {
    return [...profiles]
      .filter((p) => !p.is_default)
      .sort((a, b) => {
        if (a.pub_date && b.pub_date) return a.pub_date.localeCompare(b.pub_date);
        if (a.pub_date) return -1;
        if (b.pub_date) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [profiles]);

  const activeProfiles = sortedProfiles.filter((p) => p.product_count > 0);
  const emptyProfiles = sortedProfiles.filter((p) => p.product_count === 0);

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 dark:text-red-400 p-4">
        <p className="font-semibold">Error loading shipping profiles</p>
        <p className="text-sm mt-1">{error}</p>
        <button onClick={fetchProfiles} className="mt-3 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm">Retry</button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Shipping Profiles</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {activeProfiles.length} active profiles · {emptyProfiles.length} empty (reusable)
        </p>
      </div>

      {/* ── Reconciliation Summary ── */}
      {reconcile && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{reconcile.summary.correctly_assigned}</div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">Correctly Assigned</div>
          </div>
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{reconcile.summary.wrong_profile}</div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Wrong Profile</div>
          </div>
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">{reconcile.summary.missing_from_profile}</div>
            <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">Missing Profile</div>
          </div>
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{reconcile.summary.should_be_removed}</div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Should Remove</div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{reconcile.summary.no_pub_date}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">No Pub Date</div>
          </div>
        </div>
      )}

      {/* ── Issues: Wrong Profile ── */}
      {reconcile && reconcile.report.wrong_profile.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-4">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-3">
            Wrong Profile ({reconcile.report.wrong_profile.length})
          </h3>
          <div className="space-y-2">
            {reconcile.report.wrong_profile.map((item) => (
              <div key={item.product_id}
                className="flex items-center justify-between gap-3 text-sm bg-white dark:bg-gray-800 rounded px-3 py-2 border border-amber-100 dark:border-amber-800/50">
                <div className="min-w-0">
                  <span className="text-gray-500 dark:text-gray-400 text-xs">{item.product_id}</span>
                  <span className="mx-2 text-gray-900 dark:text-gray-100">·</span>
                  <span className="text-xs">
                    On <span className="font-medium text-amber-700 dark:text-amber-300">{item.current_profile}</span>
                    {' → '}
                    <span className="font-medium text-green-700 dark:text-green-300">{item.expected_profile}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {actionResults[item.product_id] && (
                    <span className="text-xs text-green-600 dark:text-green-400">{actionResults[item.product_id]}</span>
                  )}
                  <button
                    onClick={() => setConfirmModal({
                      open: true,
                      productId: item.product_id,
                      pubDate: item.pub_date,
                      title: `Product ${item.product_id}`,
                      action: 'assign',
                      profileName: item.expected_profile,
                    })}
                    disabled={actionLoading[item.product_id]}
                    className="px-2.5 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {actionLoading[item.product_id] ? 'Moving…' : 'Fix'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Issues: Missing from Profile ── */}
      {reconcile && reconcile.report.missing_from_profile.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4">
          <h3 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-3">
            Missing from Profile ({reconcile.report.missing_from_profile.length})
          </h3>
          <div className="space-y-2">
            {reconcile.report.missing_from_profile.map((item) => (
              <div key={item.product_id}
                className="flex items-center justify-between gap-3 text-sm bg-white dark:bg-gray-800 rounded px-3 py-2 border border-red-100 dark:border-red-800/50">
                <div className="min-w-0">
                  <span className="text-gray-500 dark:text-gray-400 text-xs">{item.product_id}</span>
                  <span className="mx-2 text-gray-900 dark:text-gray-100">·</span>
                  <span className="text-xs">
                    Needs <span className="font-medium text-red-700 dark:text-red-300">{item.expected_profile}</span>
                  </span>
                  <span className="ml-2 text-xs text-gray-400">({formatDate(item.pub_date)})</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {actionResults[item.product_id] && (
                    <span className="text-xs text-green-600 dark:text-green-400">{actionResults[item.product_id]}</span>
                  )}
                  <button
                    onClick={() => setConfirmModal({
                      open: true,
                      productId: item.product_id,
                      pubDate: item.pub_date,
                      title: `Product ${item.product_id}`,
                      action: 'assign',
                      profileName: item.expected_profile,
                    })}
                    disabled={actionLoading[item.product_id]}
                    className="px-2.5 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {actionLoading[item.product_id] ? 'Assigning…' : 'Assign'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Issues: Should Be Removed ── */}
      {reconcile && reconcile.report.should_be_removed.length > 0 && (
        <div className="mb-6 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 p-4">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-3">
            Should Be Removed ({reconcile.report.should_be_removed.length})
          </h3>
          <div className="space-y-2">
            {reconcile.report.should_be_removed.map((item) => (
              <div key={item.product_id}
                className="flex items-center justify-between gap-3 text-sm bg-white dark:bg-gray-800 rounded px-3 py-2 border border-blue-100 dark:border-blue-800/50">
                <div className="min-w-0">
                  <span className="text-gray-500 dark:text-gray-400 text-xs">{item.product_id}</span>
                  <span className="mx-2 text-gray-900 dark:text-gray-100">·</span>
                  <span className="text-xs">
                    Past pub date ({formatDate(item.pub_date)}), on <span className="font-medium">{item.current_profile}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {actionResults[item.product_id] && (
                    <span className="text-xs text-green-600 dark:text-green-400">{actionResults[item.product_id]}</span>
                  )}
                  <button
                    onClick={() => setConfirmModal({
                      open: true,
                      productId: item.product_id,
                      pubDate: item.pub_date,
                      title: `Product ${item.product_id}`,
                      action: 'remove',
                      profileName: item.current_profile,
                    })}
                    disabled={actionLoading[item.product_id]}
                    className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {actionLoading[item.product_id] ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active Profiles Table ── */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Active Profiles ({activeProfiles.length})
        </h3>
        <button
          onClick={runReconcile}
          disabled={reconciling}
          className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {reconciling ? 'Reconciling…' : 'Re-Reconcile'}
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 text-left">
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Profile</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Pub Date</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 text-center">Products</th>
              <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {activeProfiles.map((profile) => {
              const isExpanded = expandedProfile === profile.profile_id;
              const upcoming = isUpcoming(profile.pub_date, 7);
              const past = isPast(profile.pub_date);
              const nonStandardName = profile.pub_date === null && !profile.is_default;

              return (
                <>
                  <tr
                    key={profile.profile_id}
                    onClick={() => setExpandedProfile(isExpanded ? null : profile.profile_id)}
                    className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{isExpanded ? '▾' : '▸'}</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{profile.name}</span>
                        {nonStandardName && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">
                            non-standard
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {profile.pub_date ? (
                        <span className={past ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}>
                          {formatDate(profile.pub_date)}
                          {upcoming && <span className="ml-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">soon</span>}
                          {past && <span className="ml-1.5 text-xs text-gray-400">past</span>}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        {profile.product_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {past && profile.product_count > 0 && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">needs cleanup</span>
                      )}
                      {!past && !nonStandardName && (
                        <span className="text-xs text-green-600 dark:text-green-400">active</span>
                      )}
                      {nonStandardName && (
                        <span className="text-xs text-orange-600 dark:text-orange-400">review name</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${profile.profile_id}-expanded`} className="bg-gray-50/50 dark:bg-gray-800/30">
                      <td colSpan={4} className="px-8 py-3">
                        <div className="space-y-1.5">
                          {profile.products.map((prod) => (
                            <div key={prod.product_id} className="flex items-center justify-between text-xs">
                              <div>
                                <span className="text-gray-900 dark:text-gray-100">{prod.title}</span>
                                <span className="ml-2 text-gray-400">{prod.product_id}</span>
                              </div>
                              <span className="text-gray-400">{prod.variants[0]?.variant_gid.split('/').pop()}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {activeProfiles.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">No active shipping profiles.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Empty Profiles ── */}
      {emptyProfiles.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Empty Profiles — Reusable ({emptyProfiles.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {emptyProfiles.map((p) => (
              <span key={p.profile_id}
                className="px-2.5 py-1 rounded text-xs border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Confirm Modal ── */}
      <ConfirmModal
        open={confirmModal.open}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirm={async () => {
          setConfirmModal((prev) => ({ ...prev, open: false }));
          if (confirmModal.action === 'assign') {
            await assignProduct(confirmModal.productId, confirmModal.pubDate);
          } else {
            await removeProduct(confirmModal.productId);
          }
        }}
        title={confirmModal.action === 'assign' ? 'Assign to Profile' : 'Remove from Profile'}
        variant="primary"
        confirmLabel={confirmModal.action === 'assign' ? 'Assign' : 'Remove'}
      >
        {confirmModal.action === 'assign' ? (
          <>
            <p>Assign product <span className="font-medium">{confirmModal.productId}</span> to the <span className="font-medium">{confirmModal.profileName}</span> shipping profile.</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              If no profile exists for this date, an empty historical profile will be repurposed.
            </p>
          </>
        ) : (
          <>
            <p>Remove product <span className="font-medium">{confirmModal.productId}</span> from <span className="font-medium">{confirmModal.profileName}</span>.</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              The product will fall back to the General shipping profile.
            </p>
          </>
        )}
      </ConfirmModal>
    </div>
  );
};

export default ShippingProfiles;