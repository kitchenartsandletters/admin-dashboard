import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import RightSidebar from '../components/RightSidebar';
import { getReportsForRole } from './registry';
import ReportCard, { RunParameters } from '../reports/ReportCard';

export default function ReportsPage() {
  const { role } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const reports = role ? getReportsForRole(role) : [];

  const handleRunReport = async (
    reportId: string,
    params: RunParameters,
  ): Promise<{ id: string }> => {
    const token = import.meta.env.VITE_ADMIN_TOKEN;
    if (!token) throw new Error('Missing VITE_ADMIN_TOKEN');

    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (!apiBase) throw new Error('Missing VITE_API_BASE_URL');

    const response = await fetch(`${apiBase}/api/reports/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        report_id: reportId,
        parameters: {
          ...(params.start_date ? { start_date: params.start_date } : {}),
          ...(params.end_date   ? { end_date:   params.end_date   } : {}),
          delivery_method: params.delivery_method,
          formats: params.formats,
          ...(params.recipients        ? { recipients: params.recipients }             : {}),
          ...(params.ignore_exclusions ? { ignore_exclusions: params.ignore_exclusions } : {}),
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to queue report');
    }

    return response.json();
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Run operational reports on demand or review automated delivery schedules.
          </p>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="shrink-0 mt-1 text-xs text-gray-400 hover:text-gray-700
            dark:text-gray-500 dark:hover:text-gray-200
            border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1
            hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
        >
          Help ?
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map(report => (
          <ReportCard
            key={report.id}
            report={report}
            onRun={handleRunReport}
          />
        ))}
      </div>
      {sidebarOpen && (
        <RightSidebar
          docsFilePath="/docs/reports_help_docs.md"
          onClose={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}