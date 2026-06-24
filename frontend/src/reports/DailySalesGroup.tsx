import { useState } from 'react';
import ReportCard, { RunParameters } from './ReportCard';
import type { ReportDefinition } from './registry';

interface Props {
  reports: ReportDefinition[];
  onRun:   (reportId: string, params: RunParameters) => Promise<{ id: string }>;
}

export default function DailySalesGroup({ reports, onRun }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = reports[activeIdx];

  if (!active) return null;

  return (
    <div className="space-y-3">
      {/* Location tab selector */}
      {reports.length > 1 && (
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700">
          {reports.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setActiveIdx(i)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                i === activeIdx
                  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {r.locationLabel ?? r.title}
            </button>
          ))}
        </div>
      )}

      {/* Active location's report card */}
      <ReportCard
        key={active.id}
        report={active}
        onRun={onRun}
      />
    </div>
  );
}