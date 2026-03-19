import { CampaignStats } from "../../types/campaign";

export default function CampaignDashboard({ data }: { data: CampaignStats }) {
  const { totals, delivery, responses, breakdown } = data;
  const responseRatePct = (responses.rate * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Sent" value={totals.sent} />
        <StatCard label="Remaining" value={totals.remaining} />
        <StatCard label="Response Rate" value={`${responseRatePct}%`} highlight />
        <StatCard label="Failures" value={delivery.failed} isError={delivery.failed > 0} />
      </div>

      {/* Detailed Breakdown */}
      <div className="border rounded-md p-4 sm:p-6 bg-white dark:bg-gray-900 dark:border-gray-700 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white mb-6 border-l-4 border-blue-500 pl-3">
          Response Breakdown
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4">
          <BreakdownRow label="Keep Order (Yes)" value={breakdown.keep_order} color="text-green-600" />
          <BreakdownRow label="Unsigned Copy (No)" value={breakdown.unsigned_copy} color="text-blue-600" />
          <BreakdownRow label="Cancel Order" value={breakdown.cancel_order} color="text-red-600" />
          <BreakdownRow label="No Response Yet" value={breakdown.no_response} color="text-gray-400" />
        </div>
      </div>

      {data.meta?.generated_at && (
        <div className="text-[10px] font-mono uppercase text-gray-400 text-right">
          Snapshot: {new Date(data.meta.generated_at * 1000).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight, isError }: { label: string; value: any; highlight?: boolean; isError?: boolean }) {
  return (
    <div className="border rounded-md p-4 bg-white dark:bg-gray-900 dark:border-gray-700 shadow-sm">
      <div className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">
        {label}
      </div>
      <div className={`text-xl sm:text-2xl font-bold ${
        isError ? "text-red-600" : highlight ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"
      }`}>
        {value}
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value.toLocaleString()}</span>
    </div>
  );
}