import { useEffect, useState, useMemo } from "react"
import PreorderTable from "./PreorderTable"
import PreorderDetailSidebar from "./PreorderDetailSidebar"
import PreorderSummaryCards from "../../components/preorder/PreorderSummaryCards"
import ReleaseReviewTable from "../../components/preorder/ReleaseReviewTable"
import { PreorderRow, ReleaseReviewRow, PreorderSummaryMetrics } from "../../types/preorderTypes"
import mockData from "../../data/mockPreorders.json"

function PreorderService() {
  const [preorders, setPreorders] = useState<PreorderRow[]>([])
  const [searchFilter, setSearchFilter] = useState("")
  const [selectedRow, setSelectedRow] = useState<PreorderRow | null>(null)
  const [viewMode, setViewMode] = useState<"overview" | "release-review">("overview")

  useEffect(() => {
    setPreorders(mockData as PreorderRow[])
  }, [])

  const filteredData = useMemo(() => {
    const val = searchFilter.toLowerCase()
    return preorders.filter((row) => 
      (row.title?.toLowerCase() || "").includes(val) ||
      (row.isbn?.toLowerCase() || "").includes(val) ||
      String(row.product_id).includes(val)
    )
  }, [searchFilter, preorders])

  const releaseReviewData: ReleaseReviewRow[] = useMemo(() => {
    return preorders
      .filter(p => p.classification_status === 'active_preorder' || p.released_to_reporting)
      .map(p => ({
        product_id: p.product_id,
        title: p.title,
        isbn: p.isbn,
        target_report_week_start: p.release_report_week_start || "TBD",
        presales_banked: p.presale_commitment_total || 0,
        weekly_sales: 0, 
        reporting_quantity: p.presale_commitment_total || 0,
        already_reported: p.released_to_reporting,
      }))
  }, [preorders])

  const metrics: PreorderSummaryMetrics = {
    active_preorders: preorders.filter(p => p.classification_status === "active_preorder").length,
    early_stock_arrivals: preorders.filter(p => p.arrival_timing === "early_arrival").length,
    anomalies: preorders.filter(p => p.anomaly_type !== null).length,
    eligible_for_reporting_this_week: preorders.filter(p => !p.released_to_reporting).length,
    already_reported_this_week: preorders.filter(p => p.released_to_reporting).length
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white dark:bg-gray-950 min-h-screen">
      {/* Responsive Header */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Preorder Pipeline</h1>
            <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400">Manage lifecycle and reporting.</p>
          </div>
          <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-800 rounded-md border dark:border-gray-700 shadow-sm">
            <button
              className={`px-3 py-1 text-xs sm:text-sm font-medium rounded transition-all ${
                viewMode === "overview" ? "bg-white dark:bg-gray-700 text-blue-600 shadow-sm" : "text-gray-500"
              }`}
              onClick={() => setViewMode("overview")}
            >
              Overview
            </button>
            <button
              className={`px-3 py-1 text-xs sm:text-sm font-medium rounded transition-all ${
                viewMode === "release-review" ? "bg-white dark:bg-gray-700 text-blue-600 shadow-sm" : "text-gray-500"
              }`}
              onClick={() => setViewMode("release-review")}
            >
              Review
            </button>
          </div>
        </div>

        <PreorderSummaryCards metrics={metrics} />

        {viewMode === "overview" && (
          <input
            type="text"
            placeholder="Search title, ISBN..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
          />
        )}
      </div>

      <div>
        {viewMode === "overview" ? (
          <PreorderTable data={filteredData} onRowClick={setSelectedRow} />
        ) : (
          <ReleaseReviewTable data={releaseReviewData} />
        )}
      </div>

      <PreorderDetailSidebar row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  )
}

export default PreorderService