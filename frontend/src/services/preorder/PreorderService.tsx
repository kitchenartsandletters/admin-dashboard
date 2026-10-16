import { useEffect, useState, useMemo } from "react"
import PreorderTable from "./PreorderTable"
import PreorderDetailSidebar from "./PreorderDetailSidebar"
import PreorderSummaryCards from "../../components/preorder/PreorderSummaryCards"
import ReleaseReviewTable from "../../components/preorder/ReleaseReviewTable"
import {
  PreorderRow,
  ReleaseReviewRow,
  PreorderSummaryMetrics,
  ReportablePreorderRow,
} from "../../types/preorderTypes"
import {
  fetchPreorderProducts,
  fetchPreorderReleaseQueue,
  fetchPreorderMetrics,
  fetchUpcomingReleases,
  fetchReportablePreorders,
  fetchLateArrivals,
  fetchNoArrivalTitles,
} from "../../../api/preorderApi"
import { withHoldFields } from "../../utils/preorderFlags"

type ViewMode = "overview" | "historical" | "release-review"

function TableSkeleton() {
  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {["w-48", "w-24", "w-28", "w-20", "w-16"].map((w, i) => (
              <th key={i} className="px-4 py-3 border-b dark:border-gray-700">
                <div className={`h-3 ${w} bg-gray-200 dark:bg-gray-700 rounded animate-pulse`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="even:bg-gray-50/50 dark:even:bg-gray-800/50">
              <td className="px-4 py-3">
                <div className="h-3 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1.5" />
                <div className="h-2 w-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              </td>
              <td className="px-4 py-3">
                <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </td>
              <td className="px-4 py-3">
                <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ml-auto" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="h-3 w-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PreorderService() {
  const [products, setProducts] = useState<PreorderRow[]>([])
  const [releaseQueue, setReleaseQueue] = useState<ReleaseReviewRow[]>([])
  const [metrics, setMetrics] = useState<PreorderSummaryMetrics | null>(null)
  const [upcoming, setUpcoming] = useState<ReleaseReviewRow[]>([])
  const [reportable, setReportable] = useState<ReportablePreorderRow[]>([])
  const [searchFilter, setSearchFilter] = useState("")
  const [classFilter, setClassFilter] = useState<string>("all")
  const [historicalFilter, setHistoricalFilter] = useState<string>("all")
  const [selectedRow, setSelectedRow] = useState<PreorderRow | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("overview")
  const [loading, setLoading] = useState(true)
  // Alert list membership, straight from the views behind the pill counts.
  // undefined = still loading; null = failed (the list says so rather than guessing).
  type AlertIds = Set<number> | null | undefined
  const [alertIds, setAlertIds] = useState<{ no_arrival: AlertIds; late_arrival: AlertIds }>({
    no_arrival: undefined,
    late_arrival: undefined,
  })

  const HISTORICAL_FILTERS = [
    { key: "all", label: "All Historical" },
    { key: "late_arrival", label: "Late Arrivals" },
    { key: "on_time_arrival", label: "On Time" },
    { key: "early_arrival", label: "Early" },
    { key: "no_arrival", label: "No Record" },
  ]

  const handleViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    setSearchFilter("")
    if (mode !== "historical") setHistoricalFilter("all")
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [productsData, queueData, metricsData, upcomingData, reportableData] =
        await Promise.all([
          fetchPreorderProducts(),
          fetchPreorderReleaseQueue(),
          fetchPreorderMetrics(),
          fetchUpcomingReleases(),
          fetchReportablePreorders(),
        ])
      setProducts(productsData)
      setReleaseQueue(queueData)
      setMetrics(metricsData)
      // /upcoming now carries its own hold columns; this only fills them from
      // /products if a response lacks them (e.g. an older backend).
      setUpcoming(withHoldFields(upcomingData, productsData))
      setReportable(reportableData)
    } catch (err) {
      console.error("Failed to load preorder data", err)
    } finally {
      setLoading(false)
    }
    loadAlertIds()
  }

  // Separate from the main load so a failing alert endpoint can't blank the page.
  const loadAlertIds = async () => {
    const [noArrival, late] = await Promise.allSettled([fetchNoArrivalTitles(), fetchLateArrivals()])
    const ids = (r: PromiseSettledResult<Array<{ product_id: number }>>) =>
      r.status === "fulfilled" ? new Set(r.value.map((row) => row.product_id)) : null
    if (noArrival.status === "rejected") console.error("Failed to load no-arrival titles", noArrival.reason)
    if (late.status === "rejected") console.error("Failed to load late arrivals", late.reason)
    setAlertIds({ no_arrival: ids(noArrival), late_arrival: ids(late) })
  }

  useEffect(() => {
    loadData()
  }, [])

  // Active titles only — historical never mixed in
  const activeProducts = useMemo(() =>
    products.filter((r) =>
      r.classification === "active_preorder" ||
      r.classification === "early_stock_arrival" ||
      (r.classification?.startsWith("anomaly"))
    ), [products])

  const historicalProducts = useMemo(() =>
    products.filter((r) => r.classification === "historical_preorder"),
    [products])

  const filteredActive = useMemo(() => {
    const val = searchFilter.toLowerCase()
    return activeProducts
      .filter((row) => {
        if (classFilter === "all") return true
        if (classFilter === "anomaly") return row.classification?.startsWith("anomaly")
        return row.classification === classFilter
      })
      .filter((row) =>
        (row.title?.toLowerCase() || "").includes(val) ||
        (row.isbn?.toLowerCase() || "").includes(val) ||
        String(row.product_id).includes(val)
      )
  }, [activeProducts, searchFilter, classFilter])

  // Alert pills (No Record, Late Arrivals) list exactly the titles their
  // endpoint returns: the same view the pill count reads. Display columns come
  // from /products, matched by product_id. Other pills are plain views of
  // arrival_timing with no alert count, so they filter client-side.
  const isAlertFilter = historicalFilter === "no_arrival" || historicalFilter === "late_arrival"
  const alertIdSet = isAlertFilter ? alertIds[historicalFilter as "no_arrival" | "late_arrival"] : undefined

  const filteredHistorical = useMemo(() => {
    const val = searchFilter.toLowerCase()
    const pool = isAlertFilter ? products : historicalProducts
    return pool
      .filter((row) => {
        if (historicalFilter === "all") return true
        if (isAlertFilter) return alertIdSet?.has(row.product_id) ?? false
        return row.arrival_timing === historicalFilter
      })
      .filter((row) =>
        (row.title?.toLowerCase() || "").includes(val) ||
        (row.isbn?.toLowerCase() || "").includes(val) ||
        String(row.product_id).includes(val)
      )
  }, [products, historicalProducts, searchFilter, historicalFilter, isAlertFilter, alertIdSet])

  const CLASS_FILTERS = [
    { key: "all", label: "All Active" },
    { key: "active_preorder", label: "Active" },
    { key: "early_stock_arrival", label: "Early Stock" },
    { key: "anomaly", label: "Anomalies" },
  ]

  const VIEW_TABS: { key: ViewMode; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "release-review", label: "Releases" },
    { key: "historical", label: "Historical" },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white dark:bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              Preorder Pipeline
            </h1>
            <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400">
              Lifecycle, fulfillment, and release reporting.
            </p>
          </div>

          {/* View mode tabs */}
          <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-800 rounded-md border dark:border-gray-700 shadow-sm">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.key}
                className={`px-3 py-1 text-xs sm:text-sm font-medium rounded transition-all ${
                  viewMode === tab.key
                    ? "bg-white dark:bg-gray-700 text-blue-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
                onClick={() => handleViewMode(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <PreorderSummaryCards
          metrics={metrics ?? {
            active_preorders: 0,
            early_arrivals: 0,
            releases_due_for_review: 0,
            releases_this_week: 0,
            total_live_presold_units: 0,
            total_estimated_presold_units: 0,
            late_arrivals_unresolved: 0,
            no_arrival_count: 0,
          }}
          loading={loading}
          onFetchLateArrivals={fetchLateArrivals}
        />

        {/* Classification filter strip — overview only */}
        {viewMode === "overview" && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="inline-flex p-0.5 bg-gray-100 dark:bg-gray-800 rounded border dark:border-gray-700 text-xs">
              {CLASS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setClassFilter(f.key)}
                  className={`px-3 py-1.5 rounded font-medium transition-all ${
                    classFilter === f.key
                      ? "bg-white dark:bg-gray-700 text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search title, ISBN, product ID..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="flex-1 px-3 py-1.5 border rounded text-xs dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
          </div>
        )}

        {viewMode === "historical" && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="inline-flex p-0.5 bg-gray-100 dark:bg-gray-800 rounded border dark:border-gray-700 text-xs flex-wrap">
              {HISTORICAL_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setHistoricalFilter(f.key)}
                  className={`px-3 py-1.5 rounded font-medium transition-all ${
                    historicalFilter === f.key
                      ? "bg-white dark:bg-gray-700 text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {f.label}
                  {f.key === "late_arrival" && metrics && metrics.late_arrivals_unresolved > 0 && (
                    <span className="ml-1 px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[9px] font-bold">
                      {metrics.late_arrivals_unresolved}
                    </span>
                  )}
                  {f.key === "no_arrival" && metrics && metrics.no_arrival_count > 0 && (
                    <span className="ml-1 px-1 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[9px] font-bold">
                      {metrics.no_arrival_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search title, ISBN, product ID..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="flex-1 px-3 py-1.5 border rounded text-xs dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
          </div>
        )}

      {/* Content */}
      <div>
        {viewMode === "overview" && (
          loading ? <TableSkeleton /> : <PreorderTable data={filteredActive} onRowClick={setSelectedRow} />
        )}
        {viewMode === "historical" && (
          loading || (isAlertFilter && alertIdSet === undefined) ? <TableSkeleton /> : (
            <>
              {isAlertFilter && alertIdSet === null && (
                <p className="mb-2 text-xs text-red-600 dark:text-red-400">
                  This list couldn't be loaded from preorder-service. Reload the page to try again.
                </p>
              )}
              <PreorderTable data={filteredHistorical} onRowClick={setSelectedRow} isHistorical />
            </>
          )
        )}
        {viewMode === "release-review" && (
          <ReleaseReviewTable upcoming={upcoming} reportable={reportable} onReported={loadData} />
        )}
      </div>

      <PreorderDetailSidebar
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
      />
      </div>
    </div>
  )
}

export default PreorderService
