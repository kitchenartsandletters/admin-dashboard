// src/pages/preorders/OrderTaggingPage.tsx
// Route: /preorders/tagging
// Add to sidebar under Preorders alongside Release Management + Shipping Profiles

import { useEffect, useState, useCallback } from "react";

const API_BASE  = import.meta.env.VITE_PREORDER_SERVICE_URL as string;
const API_TOKEN = import.meta.env.VITE_PREORDER_ADMIN_TOKEN as string;

const headers = {
  "X-Admin-Token": API_TOKEN,
  "Content-Type": "application/json",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface TaggerRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "success" | "partial" | "error";
  orders_fetched: number;
  orders_skipped: number;
  orders_tagged: number;
  preorder_count: number;
  mixed_count: number;
  errors: Array<{ order_gid?: string; order_name?: string; error: string; fatal?: boolean }>;
  tagger_version: string | null;
}

interface ProcessedOrder {
  id: number;
  order_gid: string;
  order_name: string;
  tags_applied: string[];
  processed_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
    timeZoneName: "short",
  });
}

function duration(start: string, end: string | null) {
  if (!end) return "running…";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s  = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const STATUS_COLORS: Record<string, string> = {
  success: "text-green-700 bg-green-50 border-green-200",
  partial: "text-yellow-700 bg-yellow-50 border-yellow-200",
  error:   "text-red-700   bg-red-50   border-red-200",
  running: "text-blue-700  bg-blue-50  border-blue-200",
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[status] ?? "text-gray-600 bg-gray-50 border-gray-200"}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function RunOrdersDrawer({
  run,
  onClose,
}: {
  run: TaggerRun;
  onClose: () => void;
}) {
  const [orders, setOrders]   = useState<ProcessedOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/tagger/runs/${run.id}/orders`, { headers })
      .then(r => r.json())
      .then(d => setOrders(d.orders ?? []))
      .finally(() => setLoading(false));
  }, [run.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <div className="relative z-10 w-full max-w-lg h-full bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <p className="text-sm font-medium text-gray-900">Run details</p>
            <p className="text-xs text-gray-400 mt-0.5">{fmt(run.started_at)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-px bg-gray-100 border-b border-gray-200">
          {[
            ["Fetched",  run.orders_fetched],
            ["Tagged",   run.orders_tagged],
            ["Skipped",  run.orders_skipped],
          ].map(([label, val]) => (
            <div key={label as string} className="bg-white px-4 py-3 text-center">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-lg font-semibold text-gray-900">{val}</p>
            </div>
          ))}
        </div>

        {/* Errors (if any) */}
        {run.errors.length > 0 && (
          <div className="px-5 pt-4">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-2">
              {run.errors.length} error{run.errors.length !== 1 ? "s" : ""}
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {run.errors.map((e, i) => (
                <div key={i} className="text-xs bg-red-50 border border-red-100 rounded px-3 py-2 text-red-700">
                  {e.order_name && <span className="font-medium">{e.order_name}: </span>}
                  {e.error}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orders list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Orders tagged this run
          </p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-gray-400">No orders tagged this run.</p>
          ) : (
            <div className="space-y-2">
              {orders.map(o => (
                <div key={o.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{o.order_name}</p>
                    <p className="text-xs text-gray-400">{fmt(o.processed_at)}</p>
                  </div>
                  <div className="flex gap-1">
                    {o.tags_applied.map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OrderTaggingPage() {
  const [runs,       setRuns]       = useState<TaggerRun[]>([]);
  const [latestRun,  setLatestRun]  = useState<TaggerRun | null>(null);
  const [stats,      setStats]      = useState<Record<string, unknown> | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [selected,   setSelected]   = useState<TaggerRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [runsRes, latestRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/tagger/runs?limit=25`, { headers }),
        fetch(`${API_BASE}/tagger/runs/latest`,   { headers }),
        fetch(`${API_BASE}/tagger/stats`,         { headers }),
      ]);
      const [runsData, latestData, statsData] = await Promise.all([
        runsRes.json(), latestRes.json(), statsRes.json(),
      ]);
      setRuns(runsData.runs ?? []);
      setLatestRun(latestData.run ?? null);
      setStats(statsData);
    } catch (err) {
      setError("Failed to load tagger data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading tagger data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={load} className="text-xs text-gray-500 underline">Retry</button>
      </div>
    );
  }

  const l30 = stats?.last_30_days as { orders_tagged: number; preorder_count: number; mixed_count: number } | undefined;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Order Tagging</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Automations › Order Tagging
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs text-gray-500 border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {/* Latest run banner */}
      {latestRun && (
        <div className={`mb-6 rounded-lg border p-4 ${STATUS_COLORS[latestRun.status]}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={latestRun.status} />
                <span className="text-xs font-medium">Last run</span>
              </div>
              <p className="text-sm">{fmt(latestRun.completed_at)}</p>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <p>{latestRun.orders_tagged} tagged ({latestRun.preorder_count} preorder · {latestRun.mixed_count} mixed)</p>
              <p>{latestRun.orders_fetched} fetched · {latestRun.orders_skipped} skipped</p>
              <p className="opacity-70">Duration: {duration(latestRun.started_at, latestRun.completed_at)}</p>
            </div>
          </div>
          {latestRun.errors.length > 0 && (
            <p className="text-xs mt-2 opacity-80">
              {latestRun.errors.length} error{latestRun.errors.length !== 1 ? "s" : ""} — click the run below to see details
            </p>
          )}
        </div>
      )}

      {/* 30-day stat cards */}
      {l30 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard label="Tagged (30d)"   value={l30.orders_tagged}  />
          <StatCard label="Preorder (30d)" value={l30.preorder_count} />
          <StatCard label="Mixed (30d)"    value={l30.mixed_count}    />
        </div>
      )}

      {/* Run history table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Run history</p>
        </div>

        {runs.length === 0 ? (
          <p className="text-sm text-gray-400 px-4 py-8 text-center">No runs recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left px-4 py-2 font-medium">Started</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Fetched</th>
                <th className="text-right px-4 py-2 font-medium">Tagged</th>
                <th className="text-right px-4 py-2 font-medium">Errors</th>
                <th className="text-right px-4 py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr
                  key={run.id}
                  onClick={() => setSelected(run)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2.5 text-gray-700">{fmt(run.started_at)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={run.status} /></td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{run.orders_fetched}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900">{run.orders_tagged}</td>
                  <td className="px-4 py-2.5 text-right">
                    {run.errors.length > 0 ? (
                      <span className="text-red-600 font-medium">{run.errors.length}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                    {duration(run.started_at, run.completed_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Run detail drawer */}
      {selected && (
        <RunOrdersDrawer run={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}