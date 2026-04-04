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
} from "../../../api/preorderApi"

type ViewMode = "overview" | "historical" | "release-review"

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

  useEffect(() => {
    const loadData = async () => {
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
        setUpcoming(upcomingData)
        setReportable(reportableData)
      } catch (err) {
        console.error("Failed to load preorder data", err)
      }
    }
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

  const LEDGER_CUTOVER_DATE = "2026-02-11"

  const filteredHistorical = useMemo(() => {
    const val = searchFilter.toLowerCase()
    return historicalProducts
      .filter((row) => {
        if (historicalFilter === "all") return true

        if (historicalFilter === "late_arrival") {
          return row.arrival_timing === "late_arrival"
            && row.arrival_record_is_live === true
        }

        return row.arrival_timing === historicalFilter
      })
      .filter((row) =>
        (row.title?.toLowerCase() || "").includes(val) ||
        (row.isbn?.toLowerCase() || "").includes(val) ||
        String(row.product_id).includes(val)
      )
  }, [historicalProducts, searchFilter, historicalFilter])

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
          <PreorderTable
            data={filteredActive}
            onRowClick={setSelectedRow}
          />
        )}

        {viewMode === "historical" && (
          <PreorderTable
            data={filteredHistorical}
            onRowClick={setSelectedRow}
            isHistorical
          />
        )}

        {viewMode === "release-review" && (
          <ReleaseReviewTable
            upcoming={upcoming}
            reportable={reportable}
          />
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