import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReportDefinition, DeliveryMethod, ReportFormat } from './registry';
import { useAuth } from '../auth/AuthProvider';

interface Job {
  id: string;
  status: string;
  created_at: string;
  completed_at?: string;
}

export interface RunParameters {
  start_date?: string;
  end_date?: string;
  delivery_method: DeliveryMethod;
  formats: ReportFormat[];
}

interface Props {
  report: ReportDefinition;
  onRun: (reportId: string, params: RunParameters) => Promise<{ id: string }>;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function statusColor(status: string) {
  switch (status) {
    case 'success':  return 'text-green-600 dark:text-green-400';
    case 'failed':   return 'text-red-600 dark:text-red-400';
    case 'running':  return 'text-yellow-600 dark:text-yellow-400';
    default:         return 'text-gray-400 dark:text-gray-500';
  }
}

function cadenceBadge(cadence: string) {
  const base = 'inline-block px-2 py-0.5 rounded text-xs font-medium';
  switch (cadence) {
    case 'daily':     return `${base} bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`;
    case 'weekly':    return `${base} bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300`;
    case 'on_demand': return `${base} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300`;
    default:          return `${base} bg-gray-100 text-gray-600`;
  }
}

export default function ReportCard({ report, onRun }: Props) {
  const { role } = useAuth();
  const navigate = useNavigate();

  const [isRunning, setIsRunning]         = useState(false);
  const [message, setMessage]             = useState<string | null>(null);
  const [jobs, setJobs]                   = useState<Job[]>([]);
  const [showConfig, setShowConfig]       = useState(false);

  // Parameters state
  const [startDate, setStartDate]         = useState(sevenDaysAgoISO());
  const [endDate, setEndDate]             = useState(todayISO());
  const [delivery, setDelivery]           = useState<DeliveryMethod>(
    report.supportedDeliveryMethods[0] ?? 'email'
  );
  const [formats, setFormats]             = useState<ReportFormat[]>(
    report.supportedFormats.slice()
  );

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  const token   = import.meta.env.VITE_ADMIN_TOKEN;

  const fetchJobs = async () => {
    if (!apiBase || !token) return;
    const res = await fetch(`${apiBase}/api/reports/jobs?report_id=${report.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setJobs(await res.json());
  };

  useEffect(() => {
    if (report?.id) fetchJobs();
  }, [report.id]);

  function toggleFormat(fmt: ReportFormat) {
    setFormats(prev =>
      prev.includes(fmt)
        ? prev.filter(f => f !== fmt)
        : [...prev, fmt]
    );
  }

  const handleRun = async () => {
    if (formats.length === 0) {
      setMessage('Select at least one output format.');
      return;
    }
    try {
      setIsRunning(true);
      setMessage(null);
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
  };

  const canRun = !isRunning && formats.length > 0;

  return (
    <div className="border rounded-md bg-white dark:bg-gray-900 dark:border-gray-700 flex flex-col">

      {/* Header */}
      <div className="p-4 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-medium text-gray-900 dark:text-gray-100 leading-snug">
            {report.title}
          </h2>
          <span className={cadenceBadge(report.cadence)}>
            {report.cadence.replace('_', ' ')}
          </span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{report.description}</p>
      </div>

      <div className="border-t dark:border-gray-700" />

      {/* Config toggle */}
      <div className="px-4 pt-3 pb-1">
        <button
          onClick={() => setShowConfig(v => !v)}
          className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1"
        >
          <span>{showConfig ? '▾' : '▸'}</span>
          <span>Run options</span>
        </button>
      </div>

      {/* Collapsible config panel */}
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

          {/* Output format */}
          {report.supportedFormats.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Format
              </label>
              <div className="flex gap-2">
                {report.supportedFormats.map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => toggleFormat(fmt)}
                    className={`px-3 py-1 rounded text-xs border transition-colors ${
                      formats.includes(fmt)
                        ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
                    }`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Delivery method */}
          {report.supportedDeliveryMethods.length > 1 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Delivery
              </label>
              <div className="flex gap-2">
                {report.supportedDeliveryMethods.map(method => (
                  <button
                    key={method}
                    onClick={() => setDelivery(method)}
                    className={`px-3 py-1 rounded text-xs border transition-colors ${
                      delivery === method
                        ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
                    }`}
                  >
                    {method === 'email' ? 'Email' : 'View in dashboard'}
                  </button>
                ))}
              </div>
              {delivery === 'email' && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Report will be sent to the configured recipients.
                </p>
              )}
              {delivery === 'table' && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Results will open in the dashboard when ready.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer: run + history */}
      <div className="mt-auto border-t dark:border-gray-700 px-4 py-3 space-y-3">
        <div className="flex items-center gap-3">
          <button
            disabled={!canRun}
            onClick={handleRun}
            className="px-4 py-1.5 rounded text-sm font-medium
              bg-gray-900 text-white hover:bg-gray-700
              dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300
              disabled:opacity-40 transition-colors"
          >
            {isRunning ? 'Queuing…' : 'Run now'}
          </button>

          {/* Admin-only: schedule link (Phase 2) */}
          {role === 'admin' && (
            <button
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => navigate('/reports/calendar')}
              title="Manage schedule"
            >
              Schedule →
            </button>
          )}
        </div>

        {message && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{message}</p>
        )}

        {/* Recent job history */}
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