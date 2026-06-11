// BackorderService.tsx
// Definitive overview of products/orders owed to customers (committed sales
// deficit). Urgency heatmap + product table + order view + action tracking.
// Backend: backorder-service /admin/backorders/* via backorderApi.ts.
import { useEffect, useMemo, useState } from 'react'
import BackorderTable from './BackorderTable'
import BackorderHeatmap from './BackorderHeatmap'
import BackorderDetailSidebar from './BackorderDetailSidebar'
import type {
  BackorderProductRow,
  BackorderOrderRow,
  BackorderSummary,
  UrgencyBucket,
} from '../../types/backorderTypes'
import {
  fetchBackorderSummary,
  fetchBackorderProducts,
  fetchBackorderOrders,
} from '../../api/backorderApi'

type ViewMode = 'overview' | 'orders'

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '\u2014'

function TableSkeleton() {
  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {['w-48', 'w-16', 'w-16', 'w-24', 'w-24', 'w-20'].map((w, i) => (
              <th key={i} className="px-4 py-3 border-b dark:border-gray-700">
                <div className={`h-3 ${w} bg-gray-200 dark:bg-gray-700 rounded animate-pulse`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="even:bg-gray-50/50 dark:even:bg-gray-800/50">
              {['w-40', 'w-10', 'w-10', 'w-20', 'w-20', 'w-16'].map((w, j) => (
                <td key={j} className="px-4 py-3">
                  <div className={`h-3 ${w} bg-gray-200 dark:bg-gray-700 rounded animate-pulse`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SummaryCards({ summary, loading }: { summary: BackorderSummary | null; loading: boolean }) {
  const cards = [
    { label: 'Titles owed', value: summary?.open_products },
    { label: 'Units owed', value: summary?.units_owed },
    { label: 'Orders affected', value: summary?.orders_affected },
    { label: 'Not yet ordered', value: summary?.not_on_order, alert: (summary?.not_on_order ?? 0) > 0 },
    { label: 'Critical', value: summary?.buckets?.critical, alert: (summary?.buckets?.critical ?? 0) > 0 },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{c.label}</div>
          {loading ? (
            <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1" />
          ) : (
            <div className={`text-xl font-bold tabular-nums ${c.alert ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {c.value ?? '\u2014'}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const BUCKET_FILTERS: { key: UrgencyBucket | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
]

function BackorderService() {
  const [summary, setSummary] = useState<BackorderSummary | null>(null)
  const [products, setProducts] = useState<BackorderProductRow[]>([])
  const [orders, setOrders] = useState<BackorderOrderRow[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [bucketFilter, setBucketFilter] = useState<UrgencyBucket | 'all'>('all')
  const [searchFilter, setSearchFilter] = useState('')
  const [selectedRow, setSelectedRow] = useState<BackorderProductRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [summaryData, productsData, ordersData] = await Promise.all([
        fetchBackorderSummary(),
        fetchBackorderProducts(),
        fetchBackorderOrders({ openOnly: true }),
      ])
      setSummary(summaryData)
      setProducts(productsData)
      setOrders(ordersData)
    } catch (err) {
      console.error('Failed to load backorder data', err)
      setError(err instanceof Error ? err.message : 'Failed to load backorder data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredProducts = useMemo(() => {
    const val = searchFilter.toLowerCase()
    return products
      .filter((row) => bucketFilter === 'all' || row.urgency_bucket === bucketFilter)
      .filter(
        (row) =>
          (row.title?.toLowerCase() || '').includes(val) ||
          (row.sku?.toLowerCase() || '').includes(val) ||
          String(row.product_id).includes(val)
      )
  }, [products, bucketFilter, searchFilter])

  const VIEW_TABS: { key: ViewMode; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'orders', label: 'Orders' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white dark:bg-gray-950 min-h-screen">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              Backorders
            </h1>
            <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400">
              Quantities owed to customers \u2014 ordering status, ETAs, and customer notifications.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-800 rounded-md border dark:border-gray-700 shadow-sm">
              {VIEW_TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`px-3 py-1 text-xs sm:text-sm font-medium rounded transition-all ${
                    viewMode === tab.key
                      ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  onClick={() => setViewMode(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={loadData}
              className="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
            {error} \u2014 check VITE_BACKORDER_BASE_URL / VITE_BACKORDER_ADMIN_TOKEN.
          </div>
        )}

        <SummaryCards summary={summary} loading={loading} />

        {viewMode === 'overview' && (
          <>
            {/* Heatmap */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Urgency heatmap</h2>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  days open \u00b7 units owed \u00b7 on-order/overdue \u00b7 un-notified customers
                </span>
              </div>
              {loading ? (
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="w-44 h-12 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
                  ))}
                </div>
              ) : (
                <BackorderHeatmap rows={filteredProducts} onSelect={setSelectedRow} />
              )}
            </div>

            {/* Filter strip */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="inline-flex p-0.5 bg-gray-100 dark:bg-gray-800 rounded border dark:border-gray-700 text-xs">
                {BUCKET_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setBucketFilter(f.key)}
                    className={`px-3 py-1.5 rounded font-medium transition-all ${
                      bucketFilter === f.key
                        ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {f.label}
                    {f.key !== 'all' && summary && (summary.buckets?.[f.key] ?? 0) > 0 && (
                      <span className="ml-1 px-1 rounded bg-gray-200 dark:bg-gray-600 text-[9px] font-bold tabular-nums">
                        {summary.buckets[f.key]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search title, SKU, product ID..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="flex-1 px-3 py-1.5 border rounded text-xs dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
              />
            </div>

            {/* Product table */}
            {loading ? <TableSkeleton /> : (
              <BackorderTable data={filteredProducts} onRowClick={setSelectedRow} />
            )}
          </>
        )}

        {viewMode === 'orders' && (
          loading ? <TableSkeleton /> : (
            <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {['Order', 'Customer', 'Lines', 'Open qty', 'Days open', 'Placed', 'Last notified'].map((h) => (
                      <th key={h} className="px-4 py-3 border-b dark:border-gray-700 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        No orders currently carry open backorder lines.
                      </td>
                    </tr>
                  )}
                  {orders.map((o) => (
                    <tr key={o.order_id} className="even:bg-gray-50/50 dark:even:bg-gray-800/50">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{o.order_name ?? o.order_id}</td>
                      <td className="px-4 py-3 max-w-[180px] truncate">{o.customer_email ?? '\u2014'}</td>
                      <td className="px-4 py-3 tabular-nums">{o.backorder_lines}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold">{o.open_qty}</td>
                      <td className="px-4 py-3 tabular-nums">{o.days_open}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDate(o.order_created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDate(o.last_customer_notified_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <BackorderDetailSidebar
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        onChanged={loadData}
      />
    </div>
  )
}

export default BackorderService
