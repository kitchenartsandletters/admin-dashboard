import { useState, useEffect } from 'react';
import { ReportDefinition } from './registry';

interface Job {
  id: string;
  status: string;
  created_at: string;
  completed_at?: string;
}

interface Props {
  report: ReportDefinition;
  onRun: (reportId: string) => Promise<void>;
}

export default function ReportCard({ report, onRun }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  const token = import.meta.env.VITE_ADMIN_TOKEN;

  const fetchJobs = async () => {
    if (!apiBase || !token) return;

    const res = await fetch(
      `${apiBase}/reports/jobs?report_id=${report.id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      setJobs(data);
    }
  };

  useEffect(() => {
    console.log("ReportCard mounted:", report.id);
    console.log("apiBase:", apiBase);
    console.log("token:", token);

    if (report?.id) {
      fetchJobs();
    }
  }, [report.id]);

  const handleRun = async () => {
    try {
      setIsRunning(true);
      setMessage(null);

      await onRun(report.id);

      setMessage('Queued successfully.');
      await fetchJobs();
    } catch (err: any) {
      setMessage(err?.message || 'Failed to queue report.');
    } finally {
      setIsRunning(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'running':
        return 'text-yellow-600';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="border rounded-md p-4 space-y-3 bg-white dark:bg-gray-900">
      <div>
        <h2 className="font-medium">{report.title}</h2>
        <p className="text-sm text-gray-500">{report.description}</p>
      </div>

      <div className="text-xs text-gray-400">
        Cadence: {report.cadence}
      </div>

      <button
        disabled={isRunning}
        className="mt-2 px-3 py-1.5 text-sm rounded-md border
                   hover:bg-gray-50 dark:hover:bg-gray-800
                   disabled:opacity-50"
        onClick={handleRun}
      >
        {isRunning ? 'Queuing...' : 'Run Report'}
      </button>

      {message && (
        <div className="text-xs text-gray-500">
          {message}
        </div>
      )}

      {jobs.length > 0 && (
        <div className="pt-2 border-t text-xs space-y-1">
          <div className="text-gray-400">Recent Runs</div>
          {jobs.map(job => (
            <div key={job.id} className="flex justify-between">
              <span className={statusColor(job.status)}>
                {job.status}
              </span>
              <span className="text-gray-400">
                {new Date(job.created_at).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}