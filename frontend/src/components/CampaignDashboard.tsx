// ✅ MVP-ready component
// ⚠️ Assumes /api/campaign-stats exists and returns expected shape
// 🧱 Placeholder: Replace polling with SWR/React Query later

import { useEffect, useState } from 'react';

interface CampaignStats {
  totals: {
    recipients: number;
    sent: number;
    remaining: number;
  };
  delivery: {
    sent: number;
    failed: number;
  };
  responses: {
    total: number;
    rate: number;
  };
  breakdown: {
    keep_order: number;
    unsigned_copy: number;
    cancel_order: number;
    no_response: number;
  };
  meta?: {
    generated_at?: number;
    campaign?: string;
  };
}

export default function CampaignDashboard() {
  const [data, setData] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  const token = import.meta.env.VITE_ADMIN_TOKEN;

  const fetchStats = async () => {
    if (!apiBase || !token) return;

    try {
      const res = await fetch(
        `${apiBase}/api/campaign-stats?campaign=ngtbf&token=${token}&_ts=${Date.now()}`
      );

      if (!res.ok) throw new Error('Failed to fetch campaign stats');

      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Campaign stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // 🔁 Auto-refresh every 15s
    const interval = setInterval(fetchStats, 15000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-6">Loading campaign metrics...</div>;
  }

  if (!data) {
    return <div className="p-6 text-red-500">Failed to load data</div>;
  }

  const { totals, delivery, responses, breakdown } = data;

  const responseRatePct = (responses.rate * 100).toFixed(1);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold">
          NGTBF Email Campaign Metrics
        </h1>
        <p className="text-sm text-gray-500">
          Real-time overview of campaign performance
        </p>
      </header>

      {/* Top Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Sent" value={totals.sent} />
        <StatCard label="Remaining" value={totals.remaining} />
        <StatCard label="Response Rate" value={`${responseRatePct}%`} />
        <StatCard label="Failures" value={delivery.failed} />
      </div>

      {/* Breakdown */}
      <div className="border rounded-md p-4 bg-white dark:bg-gray-900">
        <h2 className="font-medium mb-4">Response Breakdown</h2>

        <div className="space-y-3 text-sm">
          <BreakdownRow label="Confirm Order" value={breakdown.keep_order} />
          <BreakdownRow label="Send Unsigned" value={breakdown.unsigned_copy} />
          <BreakdownRow label="Cancel Order" value={breakdown.cancel_order} />
          <BreakdownRow
            label="No Response"
            value={breakdown.no_response}
          />
        </div>
      </div>

      {/* Meta */}
      {data.meta?.generated_at && (
        <div className="text-xs text-gray-400">
          Last updated:{' '}
          {new Date(data.meta.generated_at * 1000).toLocaleTimeString()}
        </div>
      )}
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

// 🧱 Placeholder: Replace with bar chart later
function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-b pb-1">
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}