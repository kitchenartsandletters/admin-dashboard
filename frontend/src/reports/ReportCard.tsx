import { ReportDefinition } from './registry';

interface Props {
  report: ReportDefinition;
}

export default function ReportCard({ report }: Props) {
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
        className="mt-2 px-3 py-1.5 text-sm rounded-md border
                   hover:bg-gray-50 dark:hover:bg-gray-800"
        onClick={() =>
          alert('Manual execution will be enabled in a future release.')
        }
      >
        Run Report
      </button>
    </div>
  );
}