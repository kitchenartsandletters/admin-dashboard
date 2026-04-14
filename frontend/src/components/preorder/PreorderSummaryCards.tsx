// PreorderSummaryCards.tsx
import React from "react"
import { PreorderSummaryMetrics } from "../../types/preorderTypes"

const MetricCard = ({ label, value, sub }: {
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

const MetricCardSkeleton = () => (
  <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md p-3 sm:p-4 shadow-sm">
    <div className="h-2.5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-3" />
    <div className="h-7 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
  </div>
)

const PreorderSummaryCards: React.FC<{
  metrics: PreorderSummaryMetrics
  loading?: boolean
}> = ({ metrics, loading = false }) => {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
      </div>
    )
  }

function currentWeekLabel(): string {
  const today = new Date()
  const dow = today.getDay()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - dow)
  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return `${fmt(sunday)} – ${fmt(saturday)}`
}

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard label="Active Preorders" value={metrics.active_preorders} />
        <MetricCard label="Early Stock" value={metrics.early_arrivals} />
        <MetricCard
          label="This Week's Releases"
          value={metrics.releases_this_week}
          sub={metrics.releases_this_week > 0
            ? `pub dates ${currentWeekLabel}`
            : "no releases this week"
          }
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

      {(metrics.late_arrivals_unresolved > 0 || metrics.no_arrival_count > 0) && (
        <div className="flex flex-col gap-1.5">
          {metrics.no_arrival_count > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <span className="text-red-600 dark:text-red-400 text-sm font-bold">
                {metrics.no_arrival_count}
              </span>
              <span className="text-xs text-red-700 dark:text-red-300">
                {metrics.no_arrival_count === 1 ? "title" : "titles"} published with no inventory received — contact vendor
              </span>
            </div>
          )}
          {metrics.late_arrivals_unresolved > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
              <span className="text-amber-600 dark:text-amber-400 text-sm font-bold">
                {metrics.late_arrivals_unresolved}
              </span>
              <span className="text-xs text-amber-700 dark:text-amber-300">
                {metrics.late_arrivals_unresolved === 1 ? "title" : "titles"} received inventory after pub date with open presale commitments
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PreorderSummaryCards