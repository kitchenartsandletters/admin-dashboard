import React from "react"
import { PreorderSummaryMetrics } from "../../types/preorderTypes"

const MetricCard = ({ label, value }: { label: string; value: number }) => {
  return (
    <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md p-3 sm:p-4 shadow-sm transition-colors">
      <div className="text-[9px] sm:text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold truncate">
        {label}
      </div>
      <div className="text-xl sm:text-2xl font-bold mt-1 sm:mt-2 text-gray-900 dark:text-white">
        {value?.toLocaleString() ?? "0"}
      </div>
    </div>
  )
}

const PreorderSummaryCards: React.FC<{ metrics: PreorderSummaryMetrics }> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
      <MetricCard label="Active" value={metrics.active_preorders} />
      <MetricCard label="Early" value={metrics.early_stock_arrivals} />
      <MetricCard label="Anomalies" value={metrics.anomalies} />
      <MetricCard label="Eligible" value={metrics.eligible_for_reporting_this_week} />
      <MetricCard label="Reported" value={metrics.already_reported_this_week} />
    </div>
  )
}

export default PreorderSummaryCards