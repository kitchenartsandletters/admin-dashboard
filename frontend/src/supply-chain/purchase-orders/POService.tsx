// POService.tsx
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import POTable from './POTable'
import PODetailSidebar from './PODetailSidebar'
import POBuilder from './POBuilder'
import { PurchaseOrder, PurchaseOrderDetail, POStatus } from './purchaseOrderTypes'
import { fetchPurchaseOrders, fetchPurchaseOrderDetail, cancelPurchaseOrder, archiveTestPOs } from '../../api/supplyChainApi'
import { SortConfig, nextSortDirection } from '../../utils/tableUtils'

const STATUS_FILTERS: { key: POStatus | 'all' | 'open' | 'test'; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'open',      label: 'Open' },
  { key: 'draft',     label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'confirmed', label: 'Confirmed' },
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
          <tr>{['w-32','w-20','w-28','w-28','w-28'].map((w,i)=>(
            <th key={i} className="px-4 py-3 border-b dark:border-gray-700">
              <div className={`h-3 ${w} bg-gray-200 dark:bg-gray-700 rounded animate-pulse`}/>
            </th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({length:8}).map((_,i)=>(
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

  const [showBuilder, setShowBuilder] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [archiving, setArchiving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch broadly — client-side filter handles 'open' meta-status
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

  const handleSort = (key: keyof PurchaseOrder) => {
    setSortConfig(prev => ({ key, direction: nextSortDirection(prev, key) }))
  }

  const handleDeleteDraft = async (order: PurchaseOrder) => {
    if (!window.confirm(`Delete draft PO ${order.po_number}? This cannot be undone.`)) return
    setDeletingId(order.id)
    try {
      await cancelPurchaseOrder(order.id)
      // Remove from local state immediately — don't reload (load() would bring it back in 'all' view)
      setOrders(prev => prev.filter(o => o.id !== order.id))
      // If this PO was selected in the sidebar, close it
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
      // Remove archived POs from local state immediately
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
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Purchase Orders</h1>
          <button
            onClick={() => setShowBuilder(true)}
            className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            + New PO
          </button>
             {statusFilter === 'test' && filtered.length > 0 && (
                <button
                  onClick={handleArchiveTestPOs}
                  disabled={archiving}
                  className="px-3 py-2 rounded-md border border-yellow-300 dark:border-yellow-700
                              text-yellow-700 dark:text-yellow-300 text-sm font-semibold
                              hover:bg-yellow-50 dark:hover:bg-yellow-900/20 disabled:opacity-50
                              transition-colors"
                >
                  {archiving ? 'Archiving…' : `Archive all test POs (${filtered.length})`}
                </button>
              )}
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {loading ? 'Loading…' : `${orders.length} total orders`}
          </p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <input
          type="text"
          placeholder="Search PO number, supplier, ISBN…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none flex-1"
        />
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => {
                setStatusFilter(f.key)
                try {
                  localStorage.setItem(PO_STATUS_FILTER_KEY, f.key)
                } catch {}
              }}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors whitespace-nowrap
                ${statusFilter === f.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-600">
          {filtered.length} order{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

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

      <PODetailSidebar
        detail={detail}
        onClose={() => setSelectedOrder(null)}
        onReceive={poId => navigate(`/receiving/new?po=${poId}`)}
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
            const detail = await fetchPurchaseOrderDetail(poId)
            setSelectedOrder(detail.order)
          }}
        />
      )}
    </div>
  )
}
