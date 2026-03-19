import { CampaignStats } from "../../types/campaign";

export default function CampaignDashboard({
  data,
}: {
  data: CampaignStats;
}) {
  const { totals, delivery, responses, breakdown } = data;

  const responseRatePct = (responses.rate * 100).toFixed(1);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          NGTBF Email Campaign Metrics
        </h1>
        <p className="text-sm text-gray-500">
          Real-time overview of campaign performance
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Sent" value={totals.sent} />
        <StatCard label="Remaining" value={totals.remaining} />
        <StatCard label="Response Rate" value={`${responseRatePct}%`} />
        <StatCard label="Failures" value={delivery.failed} />
      </div>

      <div className="border rounded-md p-4 bg-white dark:bg-gray-900">
        <h2 className="font-medium mb-4">Response Breakdown</h2>

        <div className="space-y-3 text-sm">
          <BreakdownRow label="Yes" value={breakdown.yes} />
          <BreakdownRow label="No" value={breakdown.no} />
          <BreakdownRow label="Maybe" value={breakdown.maybe} />
          <BreakdownRow
            label="No Response"
            value={breakdown.no_response}
          />
        </div>
      </div>

      {data.meta?.generated_at && (
        <div className="text-xs text-gray-400">
          Last updated:{" "}
          {new Date(data.meta.generated_at * 1000).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="border rounded-md p-4 bg-white dark:bg-gray-900">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex justify-between border-b pb-1">
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}