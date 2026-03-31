import { useEffect, useState, useMemo } from "react"
import PreorderTable from "./PreorderTable"
import PreorderDetailSidebar from "./PreorderDetailSidebar"
import PreorderSummaryCards from "../../components/preorder/PreorderSummaryCards"
import ReleaseReviewTable from "../../components/preorder/ReleaseReviewTable"
import { PreorderRow, ReleaseReviewRow, PreorderSummaryMetrics } from "../../types/preorderTypes"
import { fetchPreorderProducts, fetchPreorderReleaseQueue, fetchPreorderMetrics } from "../../../api/preorderApi"

function PreorderService() {
  const [products, setProducts] = useState<PreorderRow[]>([])
  const [releaseQueue, setReleaseQueue] = useState<ReleaseReviewRow[]>([])
  const [metrics, setMetrics] = useState<PreorderSummaryMetrics | null>(null)
  const [searchFilter, setSearchFilter] = useState("")
  const [selectedRow, setSelectedRow] = useState<PreorderRow | null>(null)
  const [viewMode, setViewMode] = useState<"overview" | "release-review">("overview")

  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, queueData, metricsData] = await Promise.all([
          fetchPreorderProducts(),
          fetchPreorderReleaseQueue(),
          fetchPreorderMetrics()
        ])

        setProducts(productsData)
        setReleaseQueue(queueData)
        setMetrics(metricsData)
      } catch (err) {
        console.error("Failed to load preorder data", err)
      }
    }

    loadData()
  }, [])

  const filteredData = useMemo(() => {
    const val = searchFilter.toLowerCase()
    return products.filter((row) => 
      (row.title?.toLowerCase() || "").includes(val) ||
      (row.isbn?.toLowerCase() || "").includes(val) ||
      String(row.product_id).includes(val)
    )
  }, [searchFilter, products])

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

        <PreorderSummaryCards metrics={metrics ?? {
          active_preorders: 0,
          early_arrivals: 0,
          releases_due_for_review: 0,
          releases_this_week: 0,
          total_live_presold_units: 0,
          total_estimated_presold_units: 0,
        }} />

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
          <ReleaseReviewTable data={releaseQueue} />
        )}
      </div>

      <PreorderDetailSidebar row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  )
}

export default PreorderService