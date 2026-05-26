// src/components/reports/NytReportPage.tsx
// Route: /reports/nyt
// Shows current week's queued titles, upload history, and manual fallback controls.

import { useEffect, useState, useCallback } from "react";

const API_BASE  = `${import.meta.env.VITE_PREORDER_BASE_URL}/admin/preorders`;
const API_TOKEN = import.meta.env.VITE_PREORDER_ADMIN_TOKEN as string;

const headers = {
  "X-Admin-Token": API_TOKEN,
  "Content-Type": "application/json",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface QueuedTitle {
  product_id: number;
  effective_pub_date: string;
  released_at: string;
  release_report_week_start: string;
  release_report_week_end: string;
  title: string;
  isbn: string;
  author: string;
}

interface LogEntry {
  id: string;
  week_start: string;
  week_end: string;
  csv_filename: string | null;
  titles_count: number;
  upload_status: "success" | "fallback" | "error";
  fallback_reason: string | null;
  notified_at: string | null;
  uploaded_at: string | null;
  created_at: string;
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

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function weekLabel(start: string, end: string) {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

const STATUS_STYLES: Record<string, string> = {
  success: "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/30 dark:border-green-800",
  fallback:"text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/30 dark:border-yellow-800",
  error:   "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800",
};

function StatusBadge({ status }: { status: string }) {
  const label = status === "fallback" ? "manual required" : status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[status] ?? ""}`}>
      {label}
    </span>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function QueuePanel({
  queued,
  weekStart,
  weekEnd,
  onTrigger,
  onMarkUploaded,
  triggering,
}: {
  queued: QueuedTitle[];
  weekStart: string;
  weekEnd: string;
  onTrigger: (dryRun: boolean) => void;
  onMarkUploaded: (ids: number[]) => void;
  triggering: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(prev =>
      prev.size === queued.length ? new Set() : new Set(queued.map(q => q.product_id))
    );

  if (queued.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">No titles queued for this week's report.</p>
        <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
          Titles are queued from Preorders → Releases → Reportable — NYT Eligible.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Queued — {weekLabel(weekStart, weekEnd)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{queued.length} title{queued.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onTrigger(true)}
            disabled={triggering}
            className="text-xs border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Dry Run
          </button>
          <button
            onClick={() => onTrigger(false)}
            disabled={triggering}
            className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded px-3 py-1.5 font-medium"
          >
            {triggering ? "Triggering…" : "Generate & Upload Report"}
          </button>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
            <th className="px-4 py-2 text-left w-8">
              <input
                type="checkbox"
                checked={selected.size === queued.length}
                onChange={toggleAll}
                className="rounded border-gray-300 dark:border-gray-600"
              />
            </th>
            <th className="px-4 py-2 text-left font-medium">ISBN</th>
            <th className="px-4 py-2 text-left font-medium">Title</th>
            <th className="px-4 py-2 text-left font-medium">Author</th>
            <th className="px-4 py-2 text-left font-medium">Pub Date</th>
            <th className="px-4 py-2 text-left font-medium">Queued</th>
          </tr>
        </thead>
        <tbody>
          {queued.map(t => (
            <tr
              key={t.product_id}
              className="border-b border-gray-50 dark:border-gray-700 last:border-0 even:bg-gray-50 dark:even:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <td className="px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(t.product_id)}
                  onChange={() => toggle(t.product_id)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">{t.isbn}</td>
              <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100 font-medium">{t.title}</td>
              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{t.author}</td>
              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{fmtDate(t.effective_pub_date)}</td>
              <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500 text-xs">{fmt(t.released_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Manual fallback footer */}
      {selected.size > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-between">
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            {selected.size} title{selected.size !== 1 ? "s" : ""} selected — use this only if you've uploaded the CSV manually.
          </p>
          <button
            onClick={() => onMarkUploaded(Array.from(selected))}
            className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded px-3 py-1.5 font-medium"
          >
            Mark as Manually Uploaded
          </button>
        </div>
      )}
    </div>
  );
}

function LogPanel({ log, onRefresh }: { log: LogEntry[]; onRefresh: () => void }) {
  const downloadCsv = async (logId: string, filename: string) => {
    const resp = await fetch(`${API_BASE}/nyt/log/${logId}/csv`, { headers });
    if (!resp.ok) return;
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = filename || "nyt_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Upload history</p>
        <button onClick={onRefresh} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">Refresh</button>
      </div>

      {log.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 px-4 py-8 text-center">No report runs recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
              <th className="text-left px-4 py-2 font-medium">Week</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium">Titles</th>
              <th className="text-left px-4 py-2 font-medium">Uploaded</th>
              <th className="text-left px-4 py-2 font-medium">Note</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {log.map(entry => (
              <tr
                key={entry.id}
                className="border-b border-gray-50 dark:border-gray-700 last:border-0 even:bg-gray-50 dark:even:bg-gray-800"
              >
                <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 text-xs">
                  {weekLabel(entry.week_start, entry.week_end)}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={entry.upload_status} />
                </td>
                <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">{entry.titles_count}</td>
                <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500 text-xs">{fmt(entry.uploaded_at)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 max-w-xs truncate">
                  {entry.fallback_reason ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {entry.csv_filename && (
                    <button
                      onClick={() => downloadCsv(entry.id, entry.csv_filename!)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      CSV ↓
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NytReportPage() {
  const [queued,     setQueued]     = useState<QueuedTitle[]>([]);
  const [weekStart,  setWeekStart]  = useState("");
  const [weekEnd,    setWeekEnd]    = useState("");
  const [log,        setLog]        = useState<LogEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [toast,      setToast]      = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [queueRes, logRes] = await Promise.all([
        fetch(`${API_BASE}/nyt/queue`, { headers }),
        fetch(`${API_BASE}/nyt/log?limit=12`, { headers }),
      ]);
      const [queueData, logData] = await Promise.all([queueRes.json(), logRes.json()]);
      setQueued(queueData.queued ?? []);
      setWeekStart(queueData.week_start ?? "");
      setWeekEnd(queueData.week_end ?? "");
      setLog(logData.log ?? []);
    } catch {
      setError("Failed to load NYT reporting data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTrigger = async (dryRun: boolean) => {
    setTriggering(true);
    try {
      const resp = await fetch(`${API_BASE}/nyt/trigger?dry_run=${dryRun}`, {
        method: "POST",
        headers,
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast(dryRun ? "Dry run triggered — check Railway logs." : "Report job triggered. Upload history will update shortly.");
      setTimeout(load, 5000);
    } catch (err) {
      showToast("Failed to trigger report job.");
    } finally {
      setTriggering(false);
    }
  };

  const handleMarkUploaded = async (ids: number[]) => {
    try {
      const resp = await fetch(`${API_BASE}/nyt/mark-uploaded`, {
        method: "POST",
        headers,
        body: JSON.stringify({ product_ids: ids }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast(`${ids.length} title${ids.length !== 1 ? "s" : ""} marked as manually uploaded.`);
      load();
    } catch {
      showToast("Failed to mark titles as uploaded.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500 text-sm">
        Loading NYT reporting data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button onClick={load} className="text-xs text-gray-500 dark:text-gray-400 underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm px-4 py-3 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">NYT Reporting</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Reports › NYT Reporting</p>
        </div>
        <button
          onClick={load}
          className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Refresh
        </button>
      </div>

      {/* Fallback banner if most recent run is fallback */}
      {log[0]?.upload_status === "fallback" && (
        <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/30 p-4">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
            ⚠️ Last upload failed — manual upload required
          </p>
          <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
            {log[0].fallback_reason ?? "Unknown error"}
          </p>
          <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">
            Download the CSV below, upload to{" "}
            <a
              href="https://bestsellers.nytimes.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              bestsellers.nytimes.com
            </a>
            , then select the queued titles and click "Mark as Manually Uploaded."
          </p>
        </div>
      )}

      {/* Queue panel */}
      <QueuePanel
        queued={queued}
        weekStart={weekStart}
        weekEnd={weekEnd}
        onTrigger={handleTrigger}
        onMarkUploaded={handleMarkUploaded}
        triggering={triggering}
      />

      {/* Upload history */}
      <LogPanel log={log} onRefresh={load} />
    </div>
  );
}