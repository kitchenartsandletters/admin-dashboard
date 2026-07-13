// File: frontend/src/pages/WelcomePage.tsx
//
// Role-aware home for the KAL admin dashboard (P1).
// Three zones: a greeting, a "Needs attention" triage strip that only shows
// non-zero signals, and curated quick-launch tiles + a recent-activity feed.
//
// Signals are fetched client-side in parallel from existing endpoints. Each
// fetch is retried a couple of times on transient failure; if it still fails
// we surface a small "couldn't load" notice with Retry rather than silently
// showing all-clear, so a backend hiccup never masquerades as "nothing to do".

import { useCallback, useEffect, useMemo, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, Role } from '../auth/AuthProvider';
import { useStaff } from '../auth/StaffProvider';
import {
  fetchPurchaseOrders,
  fetchTransfers,
  fetchReceiptHistory,
  fetchUnrecognizedVendors,
  fetchFlaggedSnapshots,
  fetchSupplierSyncLog,
} from '../api/supplyChainApi';
import { fetchBackorderSummary } from '../api/backorderApi';
import { fetchPreorderMetrics } from '../../api/preorderApi';

const GARAMOND =
  'Garamond, "EB Garamond", "Adobe Garamond Pro", "Apple Garamond", "Times New Roman", Georgia, serif';

const PO_PAGE_LIMIT = 250;
const AWAITING_RECEIVING = new Set(['submitted', 'confirmed', 'partial']);

type Tone = 'info' | 'amber' | 'red';

interface TriageCard {
  key: string;
  icon: IconName;
  tone: Tone;
  count: number;
  capped?: boolean;
  label: string;
  sub?: string;
  cta: string;
  route: string;
}

interface ActivityRow {
  id: string;
  text: string;
  time: string;
  dotColor: string;
}

// Minimal shape of the receipt-history rows we read.
interface HistoryRow {
  id: string;
  po_number: string;
  supplier_name: string | null;
  units_received: number;
  received_at: string;
  status: string;
}

// Result of a resilient fetch: `failed` distinguishes a real failure (after
// retries) from a legitimately empty/zero result, so the UI can tell the
// difference between "nothing to do" and "couldn't check".
interface Attempt<T> {
  data: T | null;
  failed: boolean;
}

async function attempt<T>(fn: () => Promise<T>, retries = 2, backoff = 400): Promise<Attempt<T>> {
  for (let i = 0; ; i++) {
    try {
      return { data: await fn(), failed: false };
    } catch {
      if (i >= retries) return { data: null, failed: true };
      await new Promise(r => setTimeout(r, backoff * (i + 1)));
    }
  }
}

// Count of open (New) service requests, via the same interest endpoint the
// Requests screen uses. Reads the total from the x-total-count header (or
// meta.total), so limit=1 keeps it cheap rather than pulling every row.
async function fetchOpenRequestCount(): Promise<number> {
  const base = import.meta.env.VITE_API_BASE_URL;
  const token = import.meta.env.VITE_ADMIN_TOKEN;
  const res = await fetch(`${base}/api/interest?token=${token}&page=1&limit=1&statuses=${encodeURIComponent('New')}`);
  if (!res.ok) throw new Error(`[${res.status}] interest`);
  const header = res.headers.get('x-total-count');
  const fromHeader = header ? parseInt(header, 10) : NaN;
  if (Number.isFinite(fromHeader)) return fromHeader;
  const json = await res.json();
  if (typeof json?.meta?.total === 'number') return json.meta.total;
  return Array.isArray(json?.data) ? json.data.length : 0;
}

function greetingPart(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23',
    }).format(new Date())
  );
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const today = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'short' });
  const isToday = today.format(d) === today.format(new Date());
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    ...(isToday ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' }),
  }).format(d);
}

// ---------------------------------------------------------------------------
// Signals hook
// ---------------------------------------------------------------------------

function useHomeSignals(role: Role | null) {
  const [cards, setCards] = useState<TriageCard[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    if (!role) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    (async () => {
      const isAdmin = role === 'admin';
      const isEditorOrAdmin = role === 'admin' || role === 'editor';

      const [poR, trR, boR, histR] = await Promise.all([
        attempt(() => fetchPurchaseOrders({ limit: PO_PAGE_LIMIT })),
        attempt(() => fetchTransfers({ status: 'in_transit', limit: PO_PAGE_LIMIT })),
        attempt(() => fetchBackorderSummary()),
        attempt(() => fetchReceiptHistory({ limit: 6 }) as Promise<HistoryRow[]>),
      ]);

      // Editor + admin signals
      let reqR: Attempt<number> = { data: null, failed: false };
      let preR: Attempt<Awaited<ReturnType<typeof fetchPreorderMetrics>>> = { data: null, failed: false };
      if (isEditorOrAdmin) {
        [reqR, preR] = await Promise.all([
          attempt(() => fetchOpenRequestCount()),
          attempt(() => fetchPreorderMetrics()),
        ]);
      }

      let unrecR: Attempt<Awaited<ReturnType<typeof fetchUnrecognizedVendors>>> = { data: null, failed: false };
      let flagR: Attempt<unknown[]> = { data: null, failed: false };
      let syncR: Attempt<Awaited<ReturnType<typeof fetchSupplierSyncLog>>> = { data: null, failed: false };
      if (isAdmin) {
        [unrecR, flagR, syncR] = await Promise.all([
          attempt(() => fetchUnrecognizedVendors()),
          attempt(() => fetchFlaggedSnapshots()),
          attempt(() => fetchSupplierSyncLog(1)),
        ]);
      }
      if (cancelled) return;

      const next: TriageCard[] = [];
      const pos = poR.data ?? [];
      const transfers = trR.data ?? [];
      const backorder = boR.data;

      // POs awaiting receiving
      const awaiting = pos.filter(p => AWAITING_RECEIVING.has(p.status)).length;
      if (awaiting > 0) {
        next.push({
          key: 'po-awaiting', icon: 'inbox', tone: 'info',
          count: awaiting, capped: pos.length >= PO_PAGE_LIMIT,
          label: 'POs awaiting receiving', cta: 'Open receiving', route: '/receiving',
        });
      }

      // Transfers arriving
      const arriving = transfers.length;
      if (arriving > 0) {
        next.push({
          key: 'transfers', icon: 'truck', tone: 'info',
          count: arriving, capped: transfers.length >= PO_PAGE_LIMIT,
          label: 'Transfers arriving', cta: 'Open transfers', route: '/transfers',
        });
      }

      // Backorders not yet on any PO
      if (backorder && backorder.not_on_order > 0) {
        const critical = backorder.buckets?.critical ?? 0;
        next.push({
          key: 'backorders', icon: 'clock', tone: critical > 0 ? 'red' : 'amber',
          count: backorder.not_on_order,
          sub: critical > 0 ? `${critical} critical` : undefined,
          label: 'Backorders not on order', cta: 'Open backorders', route: '/backorders',
        });
      }

      // Editor + admin signals
      if (isEditorOrAdmin) {
        const openReq = reqR.data ?? 0;
        if (openReq > 0) {
          next.push({
            key: 'requests', icon: 'bell', tone: 'info', count: openReq,
            label: 'Open service requests', cta: 'Open requests', route: '/requests',
          });
        }
        const due = preR.data?.releases_due_for_review ?? 0;
        if (due > 0) {
          next.push({
            key: 'preorders', icon: 'calendar', tone: 'info', count: due,
            label: 'Preorder releases due', cta: 'Open releases', route: '/preorders/release',
          });
        }
      }

      // Admin-only health signals
      if (isAdmin) {
        const flags = Array.isArray(flagR.data) ? flagR.data.length : 0;
        if (flags > 0) {
          next.push({
            key: 'recon', icon: 'alert', tone: 'red', count: flags,
            sub: 'inventory discrepancies', label: 'Reconciliation flags',
            cta: 'Review flags', route: '/status',
          });
        }
        const unrec = unrecR.data?.unrecognized_count ?? 0;
        if (unrec > 0) {
          next.push({
            key: 'vendors', icon: 'users', tone: 'amber', count: unrec,
            sub: 'from last Shopify sync', label: 'Unrecognized vendors',
            cta: 'Map vendors', route: '/suppliers',
          });
        }
        const lastSync = Array.isArray(syncR.data) ? syncR.data[0] : undefined;
        if (lastSync && lastSync.error_message) {
          next.push({
            key: 'sync', icon: 'status', tone: 'red', count: 1,
            sub: 'last supplier sync failed', label: 'Supplier sync errored',
            cta: 'Open system status', route: '/status',
          });
        }
      }

      setCards(next);

      // Recent activity from receipt history
      const rows: ActivityRow[] = (histR.data ?? []).slice(0, 5).map((r, i) => {
        const label =
          r.status === 'partial' ? 'partially received'
          : r.status === 'failed' ? 'receipt failed'
          : 'received';
        const dot =
          r.status === 'partial' ? '#f59e0b'
          : r.status === 'failed' ? '#ef4444'
          : '#22c55e';
        const supplier = r.supplier_name ? ` — ${r.supplier_name}` : '';
        const units = typeof r.units_received === 'number' ? `, ${r.units_received} units` : '';
        return {
          id: r.id ?? String(i),
          text: `PO ${r.po_number} ${label}${supplier}${units}`,
          time: fmtTime(r.received_at),
          dotColor: dot,
        };
      });
      setActivity(rows);

      // Flag if any signal ultimately failed, so we don't imply all-clear.
      setError(poR.failed || trR.failed || boR.failed || histR.failed || reqR.failed || preR.failed || unrecR.failed || flagR.failed || syncR.failed);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [role, nonce]);

  return { cards, activity, loading, error, reload };
}

// ---------------------------------------------------------------------------
// Quick-launch tiles (curated per role)
// ---------------------------------------------------------------------------

type IconName =
  | 'box' | 'inbox' | 'truck' | 'clock' | 'search' | 'vendors'
  | 'calendar' | 'bell' | 'bar' | 'status' | 'grid' | 'megaphone'
  | 'alert' | 'users' | 'arrow' | 'check';

interface Tile { key: string; label: string; icon: IconName; route: string }

const TILES: Record<string, Tile> = {
  po:         { key: 'po',         label: 'Purchase Orders',    icon: 'box',       route: '/purchase-orders' },
  receiving:  { key: 'receiving',  label: 'Receiving',          icon: 'inbox',     route: '/receiving' },
  transfers:  { key: 'transfers',  label: 'Transfers',          icon: 'truck',     route: '/transfers' },
  backorders: { key: 'backorders', label: 'Backorders',         icon: 'clock',     route: '/backorders' },
  edelweiss:  { key: 'edelweiss',  label: 'Edelweiss Lookup',   icon: 'search',    route: '/tools/edelweiss-lookup' },
  vendors:    { key: 'vendors',    label: 'Vendors / Publishers', icon: 'vendors', route: '/suppliers' },
  preorders:  { key: 'preorders',  label: 'Preorders',          icon: 'calendar',  route: '/preorders' },
  requests:   { key: 'requests',   label: 'Request Service',    icon: 'bell',      route: '/requests' },
  reports:    { key: 'reports',    label: 'Reports',            icon: 'bar',       route: '/reports' },
  status:     { key: 'status',     label: 'System Status',      icon: 'status',    route: '/status' },
  catalog:    { key: 'catalog',    label: 'Catalog Gaps',       icon: 'grid',      route: '/suppliers/catalog-gaps' },
  campaigns:  { key: 'campaigns',  label: 'Campaigns',          icon: 'megaphone', route: '/campaigns' },
};

const LAUNCH: Record<Role, string[]> = {
  user:   ['po', 'receiving', 'transfers', 'backorders', 'edelweiss', 'vendors'],
  editor: ['po', 'receiving', 'transfers', 'backorders', 'preorders', 'requests', 'reports', 'edelweiss'],
  admin:  ['po', 'receiving', 'transfers', 'backorders', 'preorders', 'requests', 'reports', 'status', 'catalog', 'campaigns'],
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    box: <><path d="M3 7.5 12 3l9 4.5v9L12 21 3 16.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
    inbox: <><path d="M3 12h5l2 3h4l2-3h5" /><path d="M4 12 6 5h12l2 7v7H4z" /></>,
    truck: <><path d="M2 6h11v10H2z" /><path d="M13 9h4l3 3v4h-7z" /><circle cx="6.5" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.5-3.5" /></>,
    vendors: <><path d="M4 9.5 12 4l8 5.5" /><path d="M5 10v9h14v-9" /><path d="M9.5 19v-5h5v5" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" /></>,
    bell: <><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
    bar: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    status: <><path d="M3 12h4l2 6 4-14 2 8 2-4h4" /></>,
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    megaphone: <><path d="M3 11v2l11 4V7z" /><path d="M14 8.5c2 0 3.5 1.2 3.5 3.5S16 15.5 14 15.5" /><path d="M6 13v4" /></>,
    alert: <><path d="M12 3.5 22 20H2z" /><path d="M12 10v4" /><circle cx="12" cy="17.2" r=".6" fill="currentColor" stroke="none" /></>,
    users: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M16 6.5a3 3 0 0 1 0 6M17 14c2.5.4 4 2.3 4 5" /></>,
    arrow: <><path d="M5 12h13M13 6l6 6-6 6" /></>,
    check: <><path d="M4 12.5 9.5 18 20 6.5" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

const TONE_CLASSES: Record<Tone, { border: string; ic: string }> = {
  info:  { border: 'border-l-blue-500',  ic: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  amber: { border: 'border-l-amber-500', ic: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  red:   { border: 'border-l-red-500',   ic: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WelcomePage() {
  const { user, role } = useAuth();
  const { activeStaff } = useStaff();
  const navigate = useNavigate();
  const { cards, activity, loading, error, reload } = useHomeSignals(role);

  const name = useMemo(() => {
    if (activeStaff?.name) return activeStaff.name;
    const local = user?.email?.split('@')[0] ?? '';
    if (!local) return 'there';
    return local.charAt(0).toUpperCase() + local.slice(1);
  }, [activeStaff, user]);

  const dateLine = useMemo(
    () => new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
    }).format(new Date()),
    []
  );

  const tiles = (role ? LAUNCH[role] : []).map(k => TILES[k]).filter(Boolean);

  return (
    <div className="px-6 sm:px-8 py-6 max-w-5xl">
      {/* Greeting */}
      <div className="mb-7">
        <h1 className="text-3xl leading-tight text-gray-900 dark:text-white" style={{ fontFamily: GARAMOND }}>
          Good {greetingPart()}, {name}
        </h1>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
          {dateLine} · Kitchen Arts &amp; Letters
        </p>
      </div>

      {/* Needs attention */}
      <section className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
            Needs attention{!loading && cards.length > 0 ? ` · ${cards.length}` : ''}
          </h2>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
        </div>

        {loading ? (
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(232px,1fr))]">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-[92px] rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-3 flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                <Icon name="alert" className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-[13px] text-amber-800 dark:text-amber-300 flex-1">
                  Some live data couldn&apos;t load, so a card may be missing.
                </span>
                <button
                  onClick={reload}
                  className="text-[12px] font-semibold text-amber-700 dark:text-amber-300 hover:underline shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {cards.length > 0 ? (
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(232px,1fr))]">
                {cards.map(c => {
                  const t = TONE_CLASSES[c.tone];
                  return (
                    <button
                      key={c.key}
                      onClick={() => navigate(c.route)}
                      className={`text-left flex gap-3 items-start px-4 py-4 rounded-xl border border-l-[3px] ${t.border}
                                  border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm
                                  hover:-translate-y-px hover:border-blue-400 transition-all`}
                    >
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${t.ic}`}>
                        <Icon name={c.icon} className="w-[18px] h-[18px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-2xl font-extrabold leading-none tabular-nums text-gray-900 dark:text-white">
                          {c.count}{c.capped ? '+' : ''}
                        </span>
                        <span className="block text-[13px] font-semibold mt-1 text-gray-800 dark:text-gray-200">{c.label}</span>
                        {c.sub && <span className="block text-[11px] text-gray-400 mt-0.5">{c.sub}</span>}
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-2">
                          {c.cta} <Icon name="arrow" className="w-3.5 h-3.5" />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              !error && (
                <div className="flex items-center gap-4 px-5 py-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 flex items-center justify-center">
                    <Icon name="check" className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">All clear</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      Nothing needs your attention right now. New alerts show up here as they come in.
                    </p>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </section>

      {/* Quick launch */}
      <section className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Jump back in</h2>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
        </div>
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
          {tiles.map(t => (
            <button
              key={t.key}
              onClick={() => navigate(t.route)}
              className="flex flex-col gap-2.5 p-4 rounded-xl border border-gray-200 dark:border-gray-800
                         bg-white dark:bg-gray-900 shadow-sm hover:-translate-y-px hover:border-blue-400 transition-all text-left"
            >
              <span className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center justify-center">
                <Icon name={t.icon} className="w-[19px] h-[19px]" />
              </span>
              <span className="text-[13.5px] font-semibold text-gray-800 dark:text-gray-200">{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      {(loading || activity.length > 0) && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Recent activity</h2>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            {loading ? (
              [0, 1, 2].map(i => (
                <div key={i} className="h-11 border-t first:border-t-0 border-gray-100 dark:border-gray-800 animate-pulse bg-gray-50 dark:bg-gray-900" />
              ))
            ) : (
              activity.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-t first:border-t-0 border-gray-100 dark:border-gray-800 text-[13px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.dotColor }} />
                  <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-300">{r.text}</span>
                  <span className="text-[11.5px] text-gray-400 whitespace-nowrap tabular-nums">{r.time}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
