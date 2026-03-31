// PreorderSummaryCards.tsx
import React from "react"
import { PreorderSummaryMetrics } from "../../types/preorderTypes"

const MetricCard = ({
  label,
  value,
  sub,
}: {
  label: string
  value: number | string
  sub?: string
}) => (
  <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md p-3 sm:p-4 shadow-sm transition-colors">
    <div className="text-[9px] sm:text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold truncate">
      {label}
    </div>
    <div className="text-xl sm:text-2xl font-bold mt-1 sm:mt-2 text-gray-900 dark:text-white font-mono">
      {typeof value === "number" ? value.toLocaleString() : value}
    </div>
    {sub && (
      <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{sub}</div>
    )}
  </div>
)

const PreorderSummaryCards: React.FC<{ metrics: PreorderSummaryMetrics }> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      <MetricCard
        label="Active Preorders"
        value={metrics.active_preorders}
      />
      <MetricCard
        label="Early Stock"
        value={metrics.early_arrivals}
      />
      <MetricCard
        label="Releasing This Week"
        value={metrics.releases_this_week}
      />
      <MetricCard
        label="Live Presales"
        value={metrics.total_live_presold_units}
        sub={
          metrics.total_estimated_presold_units > metrics.total_live_presold_units
            ? `${metrics.total_estimated_presold_units.toLocaleString()} incl. estimated`
            : "all verified"
        }
      />
    </div>
  )
}

export default PreorderSummaryCards