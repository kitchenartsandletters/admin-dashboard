// POService.tsx
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import POTable from './POTable'
import PODetailSidebar from './PODetailSidebar'
import RightSidebar from '../../components/RightSidebar'
import POBuilder from './POBuilder'
import POCSVImport from './POCSVImport'
import { PurchaseOrder, PurchaseOrderDetail, POStatus } from './purchaseOrderTypes'
import { fetchPurchaseOrders, fetchPurchaseOrderDetail, cancelPurchaseOrder, archiveTestPOs } from '../../api/supplyChainApi'
import { SortConfig, nextSortDirection } from '../../utils/tableUtils'

const STATUS_FILTERS: { key: POStatus | 'all' | 'open' | 'test'; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'open',      label: 'Open' },
  { key: 'draft',     label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'partial',   label: 'Partial' },
  { key: 'received',  label: 'Received' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'test',      label: 'Test' },
]

function TableSkeleton() {
  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {['w-32','w-20','w-28','w-28','w-28'].map((w,i)=>(
              <th key={i} className="px-4 py-3 border-b dark:border-gray-700">
                <div className={`h-3 ${w} bg-gray-200 dark:bg-gray-700 rounded animate-pulse`}/>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({length: 8}).map((_,i)=>(
            <tr key={i}>
              <td className="px-4 py-3"><div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"/></td>
              <td className="px-4 py-3"><div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"/></td>
              <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"/></td>
              <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"/></td>
              <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function POService() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const PO_STATUS_FILTER_KEY = 'sc_po_status_filter'

  function getInitialPOFilter(): string {
     try {
       return localStorage.getItem(PO_STATUS_FILTER_KEY) ?? 'all'
     } catch {
       return 'all'
     }
   }
  const [statusFilter, setStatusFilter] = useState<string>(getInitialPOFilter)
  const [search, setSearch] = useState('')
  const [sortConfig, setSortConfig] = useState<SortConfig<PurchaseOrder> | null>({
    key: 'created_at', direction: 'desc',
  })

  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showBuilder,   setShowBuilder]   = useState(false)
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [docsFilePath, setDocsFilePath] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPurchaseOrders({ limit: 250 })
      setOrders(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selectedOrder) { setDetail(null); return }
    setDetailLoading(true)
    fetchPurchaseOrderDetail(selectedOrder.id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))
  }, [selectedOrder])

  const filtered = useMemo(() => {
    let list = orders
    list = list.filter(o => !o.archived_at)

    if (statusFilter === 'open') {
      list = list.filter(o => !['received','cancelled'].includes(o.status))
    } else if (statusFilter === 'test') {
      list = list.filter(o => o.is_test && !o.archived_at)
    } else if (statusFilter !== 'all') {
      list = list.filter(o => o.status === statusFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        o.po_number.toLowerCase().includes(q) ||
        (o.informal_ref ?? '').toLowerCase().includes(q) ||
        (o.notes ?? '').toLowerCase().includes(q)
      )
    }

    if (sortConfig) {
      list = [...list].sort((a, b) => {
        const av = a[sortConfig.key] as string | null
        const bv = b[sortConfig.key] as string | null
        if (!av) return 1
        if (!bv) return -1
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortConfig.direction === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [orders, statusFilter, search, sortConfig])

  // Count helper functions for dynamic badges modeled from ReceivingDashboard
  const counts = useMemo(() => {
    const activeOrders = orders.filter(o => !o.archived_at)
    return {
      all: activeOrders.length,
      open: activeOrders.filter(o => !['received','cancelled'].includes(o.status)).length,
      draft: activeOrders.filter(o => o.status === 'draft').length,
      submitted: activeOrders.filter(o => o.status === 'submitted').length,
      partial: activeOrders.filter(o => o.status === 'partial').length,
      received: activeOrders.filter(o => o.status === 'received').length,
      cancelled: activeOrders.filter(o => o.status === 'cancelled').length,
      test: activeOrders.filter(o => o.is_test).length,
    }
  }, [orders])

  const handleSort = (key: keyof PurchaseOrder) => {
    setSortConfig(prev => ({ key, direction: nextSortDirection(prev, key) }))
  }

  const handleDeleteDraft = async (order: PurchaseOrder) => {
    if (!window.confirm(`Delete draft PO ${order.po_number}? This cannot be undone.`)) return
    setDeletingId(order.id)
    try {
      await cancelPurchaseOrder(order.id)
      setOrders(prev => prev.filter(o => o.id !== order.id))
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(null)
        setDetail(null)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const handleArchiveTestPOs = async () => {
    if (!window.confirm(
      `Archive all ${filtered.length} test PO${filtered.length !== 1 ? 's' : ''}? `+
      `They will be hidden from all views. This cannot be easily undone.`
    )) return
    setArchiving(true)
    try {
      const result = await archiveTestPOs()
      setOrders(prev => prev.filter(o => !o.is_test || o.archived_at))
      setSelectedOrder(null)
      setDetail(null)
      alert(`${result.archived_count} test PO${result.archived_count !== 1 ? 's' : ''} archived.`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Archive failed')
    } finally {
      setArchiving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white dark:bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Purchase Orders
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {loading ? 'Loading pipeline…' : `${orders.length} total orders`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setDocsFilePath('/docs/supply-chain-purchase-orders.md')}
            className="px-3 py-2 text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            View Help Guide
          </button>

          <button
            onClick={() => setShowCSVImport(true)}
            className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600
                       text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold
                       hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            ↑ Import from CSV
          </button>

          <button
            onClick={() => setShowBuilder(true)}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold transition-colors shadow-sm"
          >
            + New PO
          </button>

          {statusFilter === 'test' && filtered.length > 0 && (
            <button
              onClick={handleArchiveTestPOs}
              disabled={archiving}
              className="px-3 py-2 rounded-md border border-yellow-300 dark:border-yellow-700
                          text-yellow-700 dark:text-yellow-300 text-xs sm:text-sm font-semibold
                          hover:bg-yellow-50 dark:hover:bg-yellow-900/20 disabled:opacity-50
                          transition-colors whitespace-nowrap"
            >
              {archiving ? 'Archiving…' : `Archive Test POs (${filtered.length})`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Control row with separate filter strip and layout flow */}
      <div className="space-y-4">
        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 border-b dark:border-gray-800/80 scrollbar-none">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => {
                setStatusFilter(f.key)
                try { localStorage.setItem(PO_STATUS_FILTER_KEY, f.key) } catch {}
              }}
              className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                statusFilter === f.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {f.label} ({counts[f.key as keyof typeof counts] ?? 0})
            </button>
          ))}
        </div>

        {/* Search bar with leading icon */}
        <div className="relative w-full sm:max-w-xs">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="search"
            placeholder="Search PO number, supplier, reference or notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 border dark:border-gray-700 rounded-md text-xs sm:text-sm
                     bg-white dark:bg-gray-900 dark:text-white
                     focus:ring-2 focus:ring-blue-500/20 outline-none placeholder-gray-400 dark:placeholder-gray-500 shadow-sm"
          />
        </div>
      </div>

      {!loading && (
        <p className="text-[11px] font-medium text-gray-400 dark:text-gray-600 uppercase tracking-wider">
          Showing {filtered.length} order{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      <div>
        {loading ? <TableSkeleton /> : (
          <POTable
            orders={filtered}
            sortConfig={sortConfig}
            onSort={handleSort}
            onRowClick={o => setSelectedOrder(prev => prev?.id === o.id ? null : o)}
            selectedId={selectedOrder?.id ?? null}
            onDeleteDraft={handleDeleteDraft}
            deletingId={deletingId}
          />
        )}
      </div>

      <PODetailSidebar
        detail={detail}
        onClose={() => setSelectedOrder(null)}
        onReceive={poId => navigate(`/receiving/wizard?po=${poId}`)}
        onRefresh={async () => {
          if (!selectedOrder) return
          try {
            const fresh = await fetchPurchaseOrderDetail(selectedOrder.id)
            setDetail(fresh)
            await load()
          } catch { /* ignore */ }
        }}
      />

      {showBuilder && (
        <POBuilder
          onClose={() => setShowBuilder(false)}
          onCreated={async (poId) => {
            setShowBuilder(false)
            await load()
            const d = await fetchPurchaseOrderDetail(poId)
            setSelectedOrder(d.order)
          }}
        />
      )}

      {showCSVImport && (
        <POCSVImport
          onClose={() => setShowCSVImport(false)}
          onCreated={async (poId) => {
            setShowCSVImport(false)
            await load()
            const d = await fetchPurchaseOrderDetail(poId)
            setSelectedOrder(d.order)
          }}
        />
      )}

      {docsFilePath && (
        <RightSidebar
          title="Purchase Orders Guide"
          docsFilePath={docsFilePath}
          onClose={() => setDocsFilePath(null)}
        />
      )}
    </div>
  )
}