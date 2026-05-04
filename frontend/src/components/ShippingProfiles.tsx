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
  summary: Record<string, number>;
  report: {
    correctly_assigned: { product_id: number; title: string; pub_date: string; profile: string }[];
    wrong_profile: { product_id: number; title: string; pub_date: string; expected_profile: string; current_profile: string }[];
    missing_from_profile: { product_id: number; title: string; pub_date: string; expected_profile: string }[];
    should_be_removed: { product_id: number; title: string; pub_date: string; current_profile: string }[];
    exempt: { product_id: number; title: string; pub_date: string; status: string; inventory: number; current_profile: string; reason: string }[];
    no_pub_date: { product_id: number; title: string; status: string }[];
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
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const future = new Date(today); future.setDate(future.getDate() + days);
  return d >= today && d <= future;
}

function isPast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
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

  const [actionLoading, setActionLoading] = useState<Record<number | string, boolean>>({});
  const [actionResults, setActionResults] = useState<Record<number | string, string>>({});
  const [expandedProfile, setExpandedProfile] = useState<number | null>(null);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    productId: number;
    pubDate: string;
    title: string;
    action: 'assign' | 'remove';
    profileName?: string;
  }>({ open: false, productId: 0, pubDate: '', title: '', action: 'assign' });

  // Rename modal
  const [renameModal, setRenameModal] = useState<{
    open: boolean;
    profileId: number;
    currentName: string;
    newName: string;
  }>({ open: false, profileId: 0, currentName: '', newName: '' });

  // ── Fetch profiles ──
  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${PREORDER_SERVICE_URL}/admin/preorders/shipping/profiles`, { headers: apiHeaders() });
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
      const res = await fetch(`${PREORDER_SERVICE_URL}/admin/preorders/shipping/profiles/reconcile`, { method: 'POST', headers: apiHeaders() });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data: ReconcileReport = await res.json();
      setReconcile(data);
    } catch (e: any) {
      console.error('Reconcile failed:', e);
    } finally {
      setReconciling(false);
    }
  }, []);

  useEffect(() => { fetchProfiles(); runReconcile(); }, [fetchProfiles, runReconcile]);

  // ── Assign ──
  const assignProduct = async (productId: number, pubDate: string) => {
    setActionLoading((p) => ({ ...p, [productId]: true }));
    try {
      const res = await fetch(`${PREORDER_SERVICE_URL}/admin/preorders/shipping/profiles/assign/${productId}`, {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify({ pub_date: pubDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed');
      setActionResults((p) => ({ ...p, [productId]: `→ ${data.profile_name}` }));
      await fetchProfiles(); await runReconcile();
    } catch (e: any) {
      setActionResults((p) => ({ ...p, [productId]: `Error: ${e.message}` }));
    } finally {
      setActionLoading((p) => ({ ...p, [productId]: false }));
    }
  };

  // ── Remove ──
  const removeProduct = async (productId: number) => {
    setActionLoading((p) => ({ ...p, [productId]: true }));
    try {
      const res = await fetch(`${PREORDER_SERVICE_URL}/admin/preorders/shipping/profiles/remove/${productId}`, { method: 'POST', headers: apiHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed');
      setActionResults((p) => ({ ...p, [productId]: '→ General' }));
      await fetchProfiles(); await runReconcile();
    } catch (e: any) {
      setActionResults((p) => ({ ...p, [productId]: `Error: ${e.message}` }));
    } finally {
      setActionLoading((p) => ({ ...p, [productId]: false }));
    }
  };

  // ── Rename ──
  const renameProfile = async (profileId: number, newName: string) => {
    const key = `rename-${profileId}`;
    setActionLoading((p) => ({ ...p, [key]: true }));
    try {
      const res = await fetch(`${PREORDER_SERVICE_URL}/admin/preorders/shipping/profiles/${profileId}/rename`, {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify({ new_name: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed');
      setActionResults((p) => ({ ...p, [key]: `Renamed to ${newName}` }));
      await fetchProfiles(); await runReconcile();
    } catch (e: any) {
      setActionResults((p) => ({ ...p, [key]: `Error: ${e.message}` }));
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  };

  // ── Profile categorization ──
  const sortedProfiles = useMemo(() =>
    [...profiles].filter((p) => !p.is_default).sort((a, b) => {
      if (a.pub_date && b.pub_date) return a.pub_date.localeCompare(b.pub_date);
      if (a.pub_date) return -1;
      if (b.pub_date) return 1;
      return a.name.localeCompare(b.name);
    }), [profiles]);

  const dateProfiles = sortedProfiles.filter((p) => p.pub_date !== null && p.product_count > 0);
  const nonStandardProfiles = sortedProfiles.filter((p) => p.pub_date === null && p.product_count > 0);
  const emptyProfiles = sortedProfiles.filter((p) => p.product_count === 0);

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
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

  // ── Issue row renderer ──
  const IssueRow = ({ item, variant, onAction, actionLabel }: {
    item: { product_id: number; title: string; pub_date?: string };
    variant: 'amber' | 'red' | 'blue';
    onAction: () => void;
    actionLabel: string;
  }) => {
    const borderCls = variant === 'amber' ? 'border-amber-100 dark:border-amber-800/50' : variant === 'red' ? 'border-red-100 dark:border-red-800/50' : 'border-blue-100 dark:border-blue-800/50';
    const btnCls = variant === 'amber' ? 'bg-amber-600 hover:bg-amber-700' : variant === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';
    return (
      <div className={`flex items-center justify-between gap-3 text-sm bg-white dark:bg-gray-800 rounded px-3 py-2 border ${borderCls}`}>
        <div className="min-w-0">
          <span className="text-gray-900 dark:text-gray-100 font-medium truncate">{item.title}</span>
          {item.pub_date && <span className="ml-2 text-xs text-gray-400">{formatDate(item.pub_date)}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actionResults[item.product_id] && (
            <span className="text-xs text-green-600 dark:text-green-400">{actionResults[item.product_id]}</span>
          )}
          <button onClick={onAction} disabled={!!actionLoading[item.product_id]}
            className={`px-2.5 py-1 text-xs rounded text-white disabled:opacity-50 ${btnCls}`}>
            {actionLoading[item.product_id] ? 'Working…' : actionLabel}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Shipping Profiles</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {dateProfiles.length} active · {nonStandardProfiles.length} non-standard · {emptyProfiles.length} reusable
        </p>
      </div>

      {/* ── Summary Cards ── */}
      {reconcile && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {([
            ['correctly_assigned', 'Correct', 'green'],
            ['wrong_profile', 'Wrong Profile', 'amber'],
            ['missing_from_profile', 'Missing', 'red'],
            ['should_be_removed', 'Should Remove', 'blue'],
            ['exempt', 'Exempt', 'purple'],
            ['no_pub_date', 'No Date', 'gray'],
          ] as [string, string, string][]).map(([key, label, color]) => (
            <div key={key} className={`rounded-lg border border-${color}-200 dark:border-${color}-800 bg-${color}-50 dark:bg-${color}-900/20 p-3`}>
              <div className={`text-2xl font-bold text-${color}-700 dark:text-${color}-300`}>{reconcile.summary[key] || 0}</div>
              <div className={`text-xs text-${color}-600 dark:text-${color}-400 mt-0.5`}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Wrong Profile ── */}
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
                  <span className="text-gray-900 dark:text-gray-100 font-medium">{item.title}</span>
                  <span className="ml-2 text-xs text-gray-400">{formatDate(item.pub_date)}</span>
                  <span className="ml-2 text-xs">
                    <span className="text-amber-700 dark:text-amber-300">{item.current_profile}</span>
                    {' → '}
                    <span className="text-green-700 dark:text-green-300">{item.expected_profile}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {actionResults[item.product_id] && <span className="text-xs text-green-600 dark:text-green-400">{actionResults[item.product_id]}</span>}
                  <button
                    onClick={() => setConfirmModal({ open: true, productId: item.product_id, pubDate: item.pub_date, title: item.title, action: 'assign', profileName: item.expected_profile })}
                    disabled={!!actionLoading[item.product_id]}
                    className="px-2.5 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
                    {actionLoading[item.product_id] ? 'Moving…' : 'Fix'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Missing from Profile ── */}
      {reconcile && reconcile.report.missing_from_profile.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4">
          <h3 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-3">
            Missing from Profile ({reconcile.report.missing_from_profile.length})
          </h3>
          <div className="space-y-2">
            {reconcile.report.missing_from_profile.map((item) => (
              <IssueRow key={item.product_id} item={item} variant="red"
                actionLabel="Assign"
                onAction={() => setConfirmModal({ open: true, productId: item.product_id, pubDate: item.pub_date, title: item.title, action: 'assign', profileName: item.expected_profile })} />
            ))}
          </div>
        </div>
      )}

      {/* ── Should Be Removed ── */}
      {reconcile && reconcile.report.should_be_removed.length > 0 && (
        <div className="mb-6 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 p-4">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-3">
            Should Be Removed ({reconcile.report.should_be_removed.length})
          </h3>
          <div className="space-y-2">
            {reconcile.report.should_be_removed.map((item) => (
              <IssueRow key={item.product_id} item={item} variant="blue"
                actionLabel="Remove"
                onAction={() => setConfirmModal({ open: true, productId: item.product_id, pubDate: item.pub_date, title: item.title, action: 'remove', profileName: item.current_profile })} />
            ))}
          </div>
        </div>
      )}

      {/* ── Exempt (Early Stock) ── */}
      {reconcile && reconcile.report.exempt.length > 0 && (
        <div className="mb-6 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/10 p-4">
          <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-3">
            Exempt — Early Stock ({reconcile.report.exempt.length})
          </h3>
          <div className="space-y-2">
            {reconcile.report.exempt.map((item) => (
              <div key={item.product_id}
                className="flex items-center justify-between gap-3 text-sm bg-white dark:bg-gray-800 rounded px-3 py-2 border border-purple-100 dark:border-purple-800/50">
                <div className="min-w-0">
                  <span className="text-gray-900 dark:text-gray-100 font-medium">{item.title}</span>
                  <span className="ml-2 text-xs text-gray-400">{formatDate(item.pub_date)}</span>
                  <span className="ml-2 text-xs text-purple-600 dark:text-purple-400">
                    {item.inventory} in stock · {item.current_profile}
                  </span>
                </div>
                <span className="text-xs text-purple-500 dark:text-purple-400 italic shrink-0">Fulfillable</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active Profiles Table ── */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Date Profiles ({dateProfiles.length})</h3>
        <button onClick={runReconcile} disabled={reconciling}
          className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
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
            {dateProfiles.map((profile) => {
              const isExpanded = expandedProfile === profile.profile_id;
              const upcoming = isUpcoming(profile.pub_date, 7);
              const past = isPast(profile.pub_date);
              return (
                <>{/* Fragment needed for expand row */}
                  <tr key={profile.profile_id}
                    onClick={() => setExpandedProfile(isExpanded ? null : profile.profile_id)}
                    className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400 mr-1.5">{isExpanded ? '▾' : '▸'}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{profile.name}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={past ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}>{formatDate(profile.pub_date)}</span>
                      {upcoming && <span className="ml-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">soon</span>}
                      {past && <span className="ml-1.5 text-xs text-gray-400">past</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{profile.product_count}</span>
                    </td>
                    <td className="px-4 py-3">
                      {past ? <span className="text-xs text-amber-600 dark:text-amber-400">needs cleanup</span>
                        : <span className="text-xs text-green-600 dark:text-green-400">active</span>}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${profile.profile_id}-exp`} className="bg-gray-50/50 dark:bg-gray-800/30">
                      <td colSpan={4} className="px-8 py-3">
                        <div className="space-y-1.5">
                          {profile.products.map((prod) => (
                            <div key={prod.product_id} className="flex items-center justify-between text-xs">
                              <span className="text-gray-900 dark:text-gray-100">{prod.title}</span>
                              <span className="text-gray-400">{prod.product_id}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {dateProfiles.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">No date-based profiles with products.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Non-Standard Profiles ── */}
      {nonStandardProfiles.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Non-Standard Profiles ({nonStandardProfiles.length})
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            These profiles use custom names — typically for oversized items, special packaging, or print-on-demand products. Tracked but not reconciled.
          </p>
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm border-collapse">
              <tbody>
                {nonStandardProfiles.map((profile) => {
                  const isExpanded = expandedProfile === profile.profile_id;
                  return (
                    <>{/* Fragment needed for expand row */}
                      <tr key={profile.profile_id}
                        onClick={() => setExpandedProfile(isExpanded ? null : profile.profile_id)}
                        className="border-t first:border-t-0 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-gray-400 mr-1.5">{isExpanded ? '▾' : '▸'}</span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">{profile.name}</span>
                          <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">
                            {profile.product_count} products
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${profile.profile_id}-exp`} className="bg-gray-50/50 dark:bg-gray-800/30">
                          <td className="px-8 py-3">
                            <div className="space-y-1.5">
                              {profile.products.map((prod) => (
                                <div key={prod.product_id} className="text-xs text-gray-700 dark:text-gray-300">{prod.title}</div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty Profiles ── */}
      {emptyProfiles.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Empty Profiles — Reusable ({emptyProfiles.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {emptyProfiles.map((p) => (
              <button key={p.profile_id}
                onClick={() => setRenameModal({ open: true, profileId: p.profile_id, currentName: p.name, newName: '' })}
                className="px-2.5 py-1 rounded text-xs border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="Click to rename">
                {p.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Click a profile to rename it for a new pub date.</p>
        </div>
      )}

      {/* ── Confirm Modal ── */}
      <ConfirmModal
        open={confirmModal.open}
        onCancel={() => setConfirmModal((p) => ({ ...p, open: false }))}
        onConfirm={async () => {
          setConfirmModal((p) => ({ ...p, open: false }));
          if (confirmModal.action === 'assign') await assignProduct(confirmModal.productId, confirmModal.pubDate);
          else await removeProduct(confirmModal.productId);
        }}
        title={confirmModal.action === 'assign' ? 'Assign to Shipping Profile' : 'Remove from Shipping Profile'}
        variant="primary"
        confirmLabel={confirmModal.action === 'assign' ? 'Assign' : 'Remove'}
      >
        {confirmModal.action === 'assign' ? (
          <>
            <p>Assign <span className="font-medium">{confirmModal.title}</span> to the <span className="font-medium">{confirmModal.profileName}</span> shipping profile.</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">If no profile exists for this date, an empty profile will be repurposed.</p>
          </>
        ) : (
          <>
            <p>Remove <span className="font-medium">{confirmModal.title}</span> from <span className="font-medium">{confirmModal.profileName}</span>.</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">The product will fall back to the General shipping profile.</p>
          </>
        )}
      </ConfirmModal>

      {/* ── Rename Modal ── */}
      {renameModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Rename Profile</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Current name: <span className="font-medium text-gray-700 dark:text-gray-300">{renameModal.currentName}</span>
            </p>
            <input
              type="text"
              value={renameModal.newName}
              onChange={(e) => setRenameModal((p) => ({ ...p, newName: e.target.value }))}
              placeholder="e.g. October 15, 2026"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRenameModal((p) => ({ ...p, open: false }))}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!renameModal.newName.trim()) return;
                  setRenameModal((p) => ({ ...p, open: false }));
                  await renameProfile(renameModal.profileId, renameModal.newName.trim());
                }}
                disabled={!renameModal.newName.trim()}
                className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShippingProfiles;