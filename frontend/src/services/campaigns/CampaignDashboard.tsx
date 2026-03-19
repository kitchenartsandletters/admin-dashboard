// ✅ MVP-ready component
// ⚠️ Assumes /api/campaign-stats exists and returns expected shape
// 🧱 Placeholder: Replace polling with SWR/React Query later

import { CampaignStats } from '../../types/campaign';

export default function CampaignDashboard({ data }: { data: CampaignStats }) {
  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Campaign Metrics
        </h1>
        <p className="text-sm text-gray-500">
          Overview of campaign performance
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={data.total} />
        <StatCard label="Confirm" value={data.keep_order} />
        <StatCard label="Unsigned" value={data.unsigned_copy} />
        <StatCard label="Cancel" value={data.cancel_order} />
      </div>
    </div>
  );
}

/* -------------------- UI Components -------------------- */

// ✅ Reusable stat card (mirrors ReportCard simplicity)
function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="border rounded-md p-4 bg-white dark:bg-gray-900">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}