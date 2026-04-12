import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReportDefinition, DeliveryMethod, ReportFormat } from './registry';
import { useAuth } from '../auth/AuthProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Job {
  id: string;
  status: string;
  created_at: string;
  completed_at?: string;
}

export interface RunParameters {
  start_date?:     string;
  end_date?:       string;
  delivery_method: DeliveryMethod;
  formats:         ReportFormat[];
}

interface ScheduleOverride {
  id:             string;
  start_date:     string;
  end_date:       string;
  label:          string | null;
  scheduled_date: string;
}

interface Props {
  report: ReportDefinition;
  onRun: (reportId: string, params: RunParameters) => Promise<{ id: string }>;
}

// ─── Business calendar helpers (mirrors business_calendar.py) ─────────────────

const SPECIAL_OPEN_SUNDAYS: Record<number, Set<string>> = {
  2025: new Set(['2025-12-07', '2025-12-14', '2025-12-21']),
  2026: new Set(['2026-12-06', '2026-12-13', '2026-12-20']),
};
const HOLIDAY_CLOSURES: Record<number, Set<string>> = {
  2025: new Set(['2025-05-24','2025-05-26','2025-07-04','2025-09-01','2025-11-28','2025-12-25','2025-12-26']),
  2026: new Set(['2026-01-01','2026-05-23','2026-05-24','2026-07-04','2026-09-07','2026-11-26','2026-12-25','2026-12-26']),
};

function toISO(d: Date): string {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isBusinessDay(dStr: string): boolean {
  const year = parseInt(dStr.slice(0, 4));
  const holidays = HOLIDAY_CLOSURES[year];
  const specials  = SPECIAL_OPEN_SUNDAYS[year];
  if (holidays?.has(dStr)) return false;
  const dow = parseLocal(dStr).getDay();
  if (dow === 0) return specials?.has(dStr) ?? false;
  return dow >= 1 && dow <= 6;
}

function findLastOpen(dStr: string): string {
  const d = parseLocal(dStr);
  d.setDate(d.getDate() - 1);
  while (!isBusinessDay(toISO(d))) d.setDate(d.getDate() - 1);
  return toISO(d);
}

function getNextScheduledDate(report: ReportDefinition): Date | null {
  if (report.scheduledDays.length === 0) return null;
  const now = new Date();
  // Look ahead up to 14 days
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dStr = toISO(d);
    if (report.scheduledDays.includes(d.getDay()) && isBusinessDay(dStr)) {
      return d;
    }
  }
  return null;
}

function getDefaultWindow(scheduledDate: Date): { start: string; end: string } {
  const dStr  = toISO(scheduledDate);
  const yesterday = new Date(scheduledDate);
  yesterday.setDate(scheduledDate.getDate() - 1);
  return {
    start: findLastOpen(dStr),
    end:   toISO(yesterday),
  };
}

// ET-aware cutoff: returns true if edit window is still open
function isBeforeCutoff(scheduledDate: Date, cutoffMinutes: number, runHourET: number): boolean {
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const cutoffET = new Date(scheduledDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  cutoffET.setHours(runHourET, 0, 0, 0);
  cutoffET.setMinutes(cutoffET.getMinutes() - cutoffMinutes);
  return nowET < cutoffET;
}

function fmtDate(iso: string): string {
  return parseLocal(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(iso: string): string {
  return parseLocal(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return toISO(new Date());
}

function statusColor(status: string): string {
  switch (status) {
    case 'success':  return 'text-green-600 dark:text-green-400';
    case 'failed':   return 'text-red-600 dark:text-red-400';
    case 'running':  return 'text-yellow-600 dark:text-yellow-400';
    default:         return 'text-gray-400 dark:text-gray-500';
  }
}

function cadenceBadge(cadence: string): string {
  const base = 'inline-block px-2 py-0.5 rounded text-xs font-medium';
  switch (cadence) {
    case 'daily':     return `${base} bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`;
    case 'weekly':    return `${base} bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300`;
    case 'on_demand': return `${base} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300`;
    default:          return `${base} bg-gray-100 text-gray-600`;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReportCard({ report, onRun }: Props) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const canEdit  = role === 'admin' || role === 'editor';

  const [isRunning, setIsRunning]   = useState(false);
  const [message, setMessage]       = useState<string | null>(null);
  const [jobs, setJobs]             = useState<Job[]>([]);
  const [showConfig, setShowConfig] = useState(false);

  // On-demand run parameters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState(todayISO());
  const [delivery, setDelivery]   = useState<DeliveryMethod>(
    report.supportedDeliveryMethods[0] ?? 'email'
  );
  const [formats, setFormats] = useState<ReportFormat[]>(report.supportedFormats.slice());

  // Schedule override state
  const nextRunDate    = getNextScheduledDate(report);
  const defaultWindow  = nextRunDate ? getDefaultWindow(nextRunDate) : null;
  const editOpen       = nextRunDate && report.scheduledRunHourET !== null
    ? isBeforeCutoff(nextRunDate, report.editCutoffMinutes, report.scheduledRunHourET)
    : false;

  const [existingOverride, setExistingOverride]     = useState<ScheduleOverride | null>(null);
  const [showOverrideEditor, setShowOverrideEditor] = useState(false);
  const [overrideStart, setOverrideStart]           = useState('');
  const [overrideEnd, setOverrideEnd]               = useState('');
  const [overrideLabel, setOverrideLabel]           = useState('');
  const [overrideSaving, setOverrideSaving]         = useState(false);
  const [overrideMsg, setOverrideMsg]               = useState<string | null>(null);

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  const token   = import.meta.env.VITE_ADMIN_TOKEN;

  // Initialise on-demand date range to the default window
  useEffect(() => {
    if (defaultWindow) {
      setStartDate(defaultWindow.start);
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      setStartDate(toISO(d));
    }
  }, [report.id]);

  const fetchJobs = useCallback(async () => {
    if (!apiBase || !token) return;
    const res = await fetch(`${apiBase}/api/reports/jobs?report_id=${report.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setJobs(await res.json());
  }, [apiBase, token, report.id]);

  const fetchOverride = useCallback(async () => {
    if (!apiBase || !token || !nextRunDate || !report.supportsScheduleOverride) return;
    const res = await fetch(
      `${apiBase}/api/reports/schedule-override?report_id=${report.id}&scheduled_date=${toISO(nextRunDate)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      setExistingOverride(data ?? null);
      if (data) {
        setOverrideStart(data.start_date);
        setOverrideEnd(data.end_date);
        setOverrideLabel(data.label ?? '');
      } else if (defaultWindow) {
        setOverrideStart(defaultWindow.start);
        setOverrideEnd(defaultWindow.end);
      }
    }
  }, [apiBase, token, report.id, nextRunDate]);

  useEffect(() => {
    fetchJobs();
    fetchOverride();
  }, [fetchJobs, fetchOverride]);

  // ── Override save ────────────────────────────────────────────────────────
  async function saveOverride() {
    if (!nextRunDate || !apiBase || !token) return;
    setOverrideSaving(true);
    setOverrideMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/reports/schedule-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          report_id:      report.id,
          scheduled_date: toISO(nextRunDate),
          start_date:     overrideStart,
          end_date:       overrideEnd,
          label:          overrideLabel || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      setExistingOverride(saved);
      setOverrideMsg('Window saved.');
      setShowOverrideEditor(false);
    } catch (e: any) {
      setOverrideMsg(e?.message || 'Failed to save.');
    } finally {
      setOverrideSaving(false);
    }
  }

  async function clearOverride() {
    if (!existingOverride || !apiBase || !token) return;
    setOverrideSaving(true);
    try {
      await fetch(`${apiBase}/api/reports/schedule-override/${existingOverride.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setExistingOverride(null);
      setOverrideMsg('Override cleared — automated window restored.');
      if (defaultWindow) { setOverrideStart(defaultWindow.start); setOverrideEnd(defaultWindow.end); }
      setOverrideLabel('');
    } catch {
      setOverrideMsg('Failed to clear.');
    } finally {
      setOverrideSaving(false);
    }
  }

  // ── On-demand run ────────────────────────────────────────────────────────
  function toggleFormat(fmt: ReportFormat) {
    setFormats(prev => prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt]);
  }

  async function handleRun() {
    if (formats.length === 0) { setMessage('Select at least one format.'); return; }
    try {
      setIsRunning(true); setMessage(null);
      const params: RunParameters = {
        delivery_method: delivery,
        formats,
        ...(report.supportsDateRange ? { start_date: startDate, end_date: endDate } : {}),
      };
      const job = await onRun(report.id, params);
      if (delivery === 'table') {
        navigate(`/reports/jobs/${job.id}`);
      } else {
        setMessage('Queued — report will be delivered by email.');
        await fetchJobs();
      }
    } catch (err: any) {
      setMessage(err?.message || 'Failed to queue report.');
    } finally {
      setIsRunning(false);
    }
  }

  const activeOverrideWindow = existingOverride
    ? { start: existingOverride.start_date, end: existingOverride.end_date }
    : defaultWindow;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 flex flex-col">

      {/* Header */}
      <div className="p-4 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-medium text-gray-900 dark:text-gray-100 leading-snug">{report.title}</h2>
          <span className={cadenceBadge(report.cadence)}>{report.cadence.replace('_', ' ')}</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{report.description}</p>
      </div>

      <div className="border-t dark:border-gray-700" />

      {/* ── Next report panel (admins + editors, scheduled reports only) ── */}
      {canEdit && nextRunDate && report.supportsScheduleOverride && (
        <div className="px-4 py-3 space-y-2 bg-gray-50 dark:bg-gray-800/40">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Next report
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {fmtDateShort(toISO(nextRunDate))}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {existingOverride ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    ✎ Overridden: {fmtDate(existingOverride.start_date)} → {fmtDate(existingOverride.end_date)}
                    {existingOverride.label && ` · ${existingOverride.label}`}
                  </span>
                ) : activeOverrideWindow ? (
                  <>Window: {fmtDate(activeOverrideWindow.start)} → {fmtDate(activeOverrideWindow.end)}</>
                ) : null}
              </p>
            </div>

            {/* Edit / lock controls */}
            {editOpen ? (
              <button
                onClick={() => setShowOverrideEditor(v => !v)}
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600
                  text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 shrink-0"
              >
                {showOverrideEditor ? 'Cancel' : 'Edit window'}
              </button>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                Locked · {report.scheduledRunHourET}:00 AM ET
              </span>
            )}
          </div>

          {/* Override editor */}
          {showOverrideEditor && editOpen && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={overrideStart}
                  max={overrideEnd}
                  onChange={e => setOverrideStart(e.target.value)}
                  className="flex-1 rounded border px-2 py-1.5 text-xs
                    bg-white text-gray-900 border-gray-300
                    dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                    focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                <span className="text-xs text-gray-400">→</span>
                <input
                  type="date"
                  value={overrideEnd}
                  min={overrideStart}
                  onChange={e => setOverrideEnd(e.target.value)}
                  className="flex-1 rounded border px-2 py-1.5 text-xs
                    bg-white text-gray-900 border-gray-300
                    dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                    focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
              <input
                type="text"
                placeholder="Label (optional) — e.g. Extended weekend window"
                value={overrideLabel}
                onChange={e => setOverrideLabel(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-xs
                  bg-white text-gray-900 border-gray-300
                  dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                  focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={saveOverride}
                  disabled={overrideSaving}
                  className="px-3 py-1.5 rounded text-xs font-medium
                    bg-gray-900 text-white hover:bg-gray-700
                    dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300
                    disabled:opacity-40"
                >
                  {overrideSaving ? 'Saving…' : 'Save window'}
                </button>
                {existingOverride && (
                  <button
                    onClick={clearOverride}
                    disabled={overrideSaving}
                    className="px-3 py-1.5 rounded text-xs border border-gray-300 dark:border-gray-600
                      text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800
                      disabled:opacity-40"
                  >
                    Clear override
                  </button>
                )}
              </div>
              {overrideMsg && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{overrideMsg}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* On-demand run config */}
      <div className="px-4 pt-3 pb-1">
        <button
          onClick={() => setShowConfig(v => !v)}
          className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1"
        >
          <span>{showConfig ? '▾' : '▸'}</span>
          <span>Run on demand</span>
        </button>
      </div>

      {showConfig && (
        <div className="px-4 pb-4 space-y-4">

          {/* Date range */}
          {report.supportsDateRange && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Date range
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="flex-1 rounded border px-2 py-1.5 text-sm
                    bg-white text-gray-900 border-gray-300
                    dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                    focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="flex-1 rounded border px-2 py-1.5 text-sm
                    bg-white text-gray-900 border-gray-300
                    dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                    focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
            </div>
          )}

          {/* Format */}
          {report.supportedFormats.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Format</label>
              <div className="flex gap-2">
                {report.supportedFormats.map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => toggleFormat(fmt)}
                    className={`px-3 py-1 rounded text-xs border transition-colors ${
                      formats.includes(fmt)
                        ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
                    }`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Delivery */}
          {report.supportedDeliveryMethods.length > 1 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Delivery</label>
              <div className="flex gap-2">
                {report.supportedDeliveryMethods.map(method => (
                  <button
                    key={method}
                    onClick={() => setDelivery(method)}
                    className={`px-3 py-1 rounded text-xs border transition-colors ${
                      delivery === method
                        ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
                    }`}
                  >
                    {method === 'email' ? 'Email' : 'View in dashboard'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {delivery === 'email'
                  ? 'Report will be sent to configured recipients.'
                  : 'Results will open in the dashboard when ready.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto border-t dark:border-gray-700 px-4 py-3 space-y-3">
        <div className="flex items-center gap-3">
          {showConfig && (
            <button
              disabled={!showConfig || isRunning || formats.length === 0}
              onClick={handleRun}
              className="px-4 py-1.5 rounded text-sm font-medium
                bg-gray-900 text-white hover:bg-gray-700
                dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300
                disabled:opacity-40 transition-colors"
            >
              {isRunning ? 'Queuing…' : 'Run now'}
            </button>
          )}
          {canEdit && (
            <button
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => navigate('/reports/calendar')}
            >
              Calendar →
            </button>
          )}
        </div>

        {message && <p className="text-xs text-gray-500 dark:text-gray-400">{message}</p>}

        {jobs.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              Recent runs
            </p>
            {jobs.slice(0, 3).map(job => (
              <div
                key={job.id}
                className="flex items-center justify-between text-xs cursor-pointer
                  hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-1 -mx-1"
                onClick={() => navigate(`/reports/jobs/${job.id}`)}
              >
                <span className="text-gray-400 dark:text-gray-500">
                  {new Date(job.created_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  })}
                </span>
                <span className={statusColor(job.status)}>{job.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}