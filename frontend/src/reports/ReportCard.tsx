import { useState } from 'react';
import { ReportDefinition } from './registry';

interface Props {
  report: ReportDefinition;
  onRun: (reportId: string) => Promise<void>;
}

export default function ReportCard({ report, onRun }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleRun = async () => {
    try {
      setIsRunning(true);
      setMessage(null);

      await onRun(report.id);

      setMessage('Queued successfully.');
    } catch (err: any) {
      setMessage(err?.message || 'Failed to queue report.');
    } finally {
      setIsRunning(false);
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
    </div>
  );
}