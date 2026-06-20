// ReceivingDashboard.tsx
// Route: /receiving
//
// Groups receipts by PO — a PO is the unit of work, receipts are attempts.
// Shows submitted/confirmed/partial POs awaiting receipt above the history table.
// Lines column shows completion breakdown: complete / partial / pending.
//
// Status column semantics:
//   canonical_status is derived from the PO's own status (received, partial, etc.)
//   NOT from the receipt's status (applied, test_applied, etc.).
//   Receipt-level status (applied, test_applied, failed) is shown only in the
//   expanded attempt rows — the top-level badge always reflects PO state so
//   a partially-received PO always shows "Partial", never "Received".

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import PODetailSidebar from '../purchase-orders/PODetailSidebar'
import {
  fetchPurchaseOrderDetail,
  fetchPurchaseOrders,
  fetchReceiptHistory,
} from '../../api/supplyChainApi'
import { PurchaseOrder, PurchaseOrderDetail } from '../purchase-orders/purchaseOrderTypes'
import { SortConfig, SortIcon } from '../../utils/tableUtils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReceiptAttempt {
  id: string
  status: 'pending' | 'applied' | 'failed' | 'partial' | 'cancelled' | 'test_applied'
  received_at: string
  notes: string | null
  line_count: number
  units_received: number
}

interface POReceivingGroup {
  po_id: string
  po_number: string
  is_ad_hoc: boolean
  informal_ref: string | null
  supplier_name: string
  account_label: string
  canonical_status: string
  canonical_receipt: ReceiptAttempt | null
  attempts: ReceiptAttempt[]
  total_units: number
  total_lines: number
  lines_full:    number
  lines_partial: number
  lines_open:    number
  lines_total:   number
  is_test: boolean
}

interface RawReceiptRow {
  id: string
  status: string
  po_status?: string
  received_at: string
  notes: string | null
  po_id: string
  po_number: string
  is_ad_hoc: boolean
  informal_ref: string | null
  supplier_name: string
  account_label: string
  line_count: number
  units_received: number
  lines_full?:    number
  lines_partial?: number
  lines_open?:    number
  lines_total?:   number
  is_test?: boolean
}

type SortKey = 'received_at' | 'supplier_name' | 'po_number' | 'canonical_status'

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const PO_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  received:  { label: 'Received',  color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',     dot: 'bg-green-500'  },
  partial:   { label: 'Partial',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',     dot: 'bg-amber-500'  },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',         dot: 'bg-blue-400'   },
  confirmed: { label: 'Confirmed', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', dot: 'bg-indigo-400' },
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',            dot: 'bg-gray-400'   },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',            dot: 'bg-gray-300'   },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',             dot: 'bg-red-500'    },
  pending:   { label: 'Pending',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',         dot: 'bg-blue-400'   },
}

const RECEIPT_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  applied:      { label: 'Applied',   color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',     dot: 'bg-green-500'  },
  test_applied: { label: 'Test run',  color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', dot: 'bg-yellow-500' },
  partial:      { label: 'Partial',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',     dot: 'bg-amber-500'  },
  failed:       { label: 'Failed',    color: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',             dot: 'bg-red-500'    },
  pending:      { label: 'Pending',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',         dot: 'bg-blue-400'   },
  cancelled:    { label: 'Cancelled', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',            dot: 'bg-gray-400'   },
}

function POStatusBadge({ status }: { status: string }) {
  const cfg = PO_STATUS_CONFIG[status] ?? PO_STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function ReceiptStatusBadge({ status }: { status: string }) {
  const cfg = RECEIPT_STATUS_CONFIG[status] ?? RECEIPT_STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Group raw receipt rows by PO
// ---------------------------------------------------------------------------

function groupByPO(rows: RawReceiptRow[]): POReceivingGroup[] {
  const map = new Map<string, POReceivingGroup>()

  for (const row of rows) {
    if (!map.has(row.po_id)) {
      map.set(row.po_id, {
        po_id:             row.po_id,
        po_number:         row.po_number,
        is_ad_hoc:         row.is_ad_hoc,
        informal_ref:      row.informal_ref,
        supplier_name:     row.supplier_name,
        account_label:     row.account_label,
        canonical_status:  row.po_status ?? 'pending',
        canonical_receipt: null,
        attempts:          [],
        total_units:       0,
        total_lines:       0,
        lines_full:        0,
        lines_partial:     0,
        lines_open:        0,
        lines_total:       0,
        is_test:           false,
      })
    }

    const group = map.get(row.po_id)!
    const attempt: ReceiptAttempt = {
      id:             row.id,
      status:         row.status as ReceiptAttempt['status'],
      received_at:    row.received_at,
      notes:          row.notes,
      line_count:     row.line_count,
      units_received: row.units_received,
    }
    group.attempts.push(attempt)

    if (row.status === 'applied' || row.status === 'partial' || row.status === 'test_applied') {
      group.canonical_receipt = attempt
      group.canonical_status  = row.po_status ?? row.status
      group.total_units       = row.units_received
      group.total_lines       = row.line_count
      group.lines_full        = row.lines_full    ?? 0
      group.lines_partial     = row.lines_partial ?? 0
      group.lines_open        = row.lines_open    ?? 0
      group.lines_total       = row.lines_total   ?? 0
      group.is_test           = row.is_test       ?? false
    } else if (!group.canonical_receipt) {
      group.canonical_receipt = attempt
      group.canonical_status  = row.po_status ?? row.status
      group.total_units       = row.units_received
      group.total_lines       = row.line_count
    }
  }

  return Array.from(map.values())
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, alert }: { label: string; value: string | number; sub?: string; alert?: boolean }) {
  return (
    <div className={`border rounded-lg px-4 py-3 ${alert
      ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
      <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${alert ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sortable column header
// ---------------------------------------------------------------------------

function ThSortable({
  label, sortKey, sortConfig, onSort, align = 'left',
}: {
  label: string; sortKey: SortKey
  sortConfig: SortConfig<POReceivingGroup> | null
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortConfig?.key === sortKey
  return (
    <button type="button" onClick={() => onSort(sortKey)}
      className={`text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide
        hover:text-gray-700 dark:hover:text-gray-200 transition-colors select-none
        ${align === 'right' ? 'text-right w-full block' : ''}`}>
      {label}
      <SortIcon active={active} direction={sortConfig?.direction ?? 'asc'} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// PO group row
// ---------------------------------------------------------------------------

function POGroupRow({ group, onRowClick }: { group: POReceivingGroup; onRowClick: (poId: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const hasMultiple  = group.attempts.length > 1
  const nonCanonical = group.attempts.filter(a => a.id !== group.canonical_receipt?.id)

  return (
    <div className="border-b dark:border-gray-800 last:border-0">
      <div
        className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors cursor-pointer"
        onClick={() => onRowClick(group.po_id)}
      >
        <button type="button"
          onClick={e => { e.stopPropagation(); hasMultiple && setExpanded(v => !v) }}
          className={`mt-0.5 w-4 shrink-0 text-gray-400 dark:text-gray-500 text-xs
            ${hasMultiple ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-200' : 'cursor-default opacity-0'}`}>
          {expanded ? '▾' : '▸'}
        </button>

        <div className="w-24 shrink-0">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {group.canonical_receipt ? formatDate(group.canonical_receipt.received_at) : '—'}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {group.canonical_receipt ? formatTime(group.canonical_receipt.received_at) : ''}
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{group.supplier_name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{group.account_label}</p>
        </div>

        <div className="w-52 shrink-0 min-w-0">
          <p className="text-xs font-mono text-gray-700 dark:text-gray-300">{group.po_number}</p>
          {group.is_ad_hoc && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">Ad hoc</span>
          )}
          {group.informal_ref && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate">{group.informal_ref}</p>
          )}
        </div>

        <div className="w-24 shrink-0 flex flex-col items-start gap-1">
          <POStatusBadge status={group.canonical_status} />
          {group.is_test && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 uppercase">
              Test
            </span>
          )}
          {hasMultiple && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{group.attempts.length} attempts</span>
          )}
        </div>

        <div className="w-24 shrink-0 text-right space-y-0.5">
          {group.lines_full > 0 && <p className="text-[11px] text-green-600 dark:text-green-400 tabular-nums">{group.lines_full} complete</p>}
          {group.lines_partial > 0 && <p className="text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">{group.lines_partial} partial</p>}
          {group.lines_open > 0 && <p className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{group.lines_open} pending</p>}
          {group.lines_total === 0 && <p className="text-[11px] text-gray-400 tabular-nums">{group.total_lines} line{group.total_lines !== 1 ? 's' : ''}</p>}
        </div>
      </div>

      {expanded && nonCanonical.length > 0 && (
        <div className="ml-7 mr-4 mb-2 border dark:border-gray-800 rounded-md overflow-hidden bg-gray-50/50 dark:bg-gray-900/30">
          {nonCanonical.map(attempt => (
            <div key={attempt.id}
              className="flex items-center gap-3 px-3 py-2 border-b dark:border-gray-800 last:border-0 opacity-60">
              <ReceiptStatusBadge status={attempt.status} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(attempt.received_at)} {formatTime(attempt.received_at)}
              </span>
              {attempt.notes && (
                <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1">
                  {attempt.notes.slice(0, 100)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export default function ReceivingDashboard() {
  const navigate = useNavigate()
  const [groups, setGroups]             = useState<POReceivingGroup[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortConfig, setSortConfig]     = useState<SortConfig<POReceivingGroup> | null>({
    key: 'received_at' as keyof POReceivingGroup, direction: 'desc',
  })
  const [searchQuery, setSearchQuery]   = useState('')
  const [searching, setSearching]       = useState(false)
  const [selectedPODetail, setSelectedPODetail] = useState<PurchaseOrderDetail | null>(null)
  const [submittedPOs, setSubmittedPOs] = useState<PurchaseOrder[]>([])
  const [posLoading, setPosLoading]     = useState(true)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initial load
  useEffect(() => {
    fetchReceiptHistory({ limit: 100 })
      .then(rows => setGroups(groupByPO(rows as RawReceiptRow[])))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  // Awaiting receipt POs
  useEffect(() => {
    fetchPurchaseOrders({ status: 'submitted,confirmed,partial', limit: 50 })
      .then(orders => setSubmittedPOs(orders))
      .catch(() => {})
      .finally(() => setPosLoading(false))
  }, [])

  // Debounced search — fires against the backend with the search param
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const rows = await fetchReceiptHistory({ limit: 100, search: searchQuery || undefined })
        setGroups(groupByPO(rows as RawReceiptRow[]))
      } catch { /* keep existing results on error */ }
      finally { setSearching(false) }
    }, 300)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [searchQuery])

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key: key as keyof POReceivingGroup,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const filtered = useMemo(() => {
    let list = statusFilter === 'all'
      ? groups
      : groups.filter(g => g.canonical_status === statusFilter)

    if (sortConfig) {
      const { key, direction } = sortConfig
      list = [...list].sort((a, b) => {
        const av = key === 'received_at'
          ? (a.canonical_receipt?.received_at ?? '')
          : (a[key as keyof POReceivingGroup] as string) ?? ''
        const bv = key === 'received_at'
          ? (b.canonical_receipt?.received_at ?? '')
          : (b[key as keyof POReceivingGroup] as string) ?? ''
        const cmp = av.localeCompare(bv)
        return direction === 'asc' ? cmp : -cmp
      })
    }

    return list
  }, [groups, statusFilter, sortConfig])

  const totalUnits    = groups.filter(g => ['received','partial'].includes(g.canonical_status)).reduce((s,g) => s+g.total_units, 0)
  const failedGroups  = groups.filter(g => g.canonical_status === 'failed')
  const pendingGroups = groups.filter(g => g.canonical_status === 'pending')

  const counts = {
    all:      groups.length,
    received: groups.filter(g => g.canonical_status === 'received').length,
    partial:  groups.filter(g => g.canonical_status === 'partial').length,
    pending:  pendingGroups.length,
    failed:   failedGroups.length,
  }

  const handleRowClick = async (poId: string) => {
    try {
      const detail = await fetchPurchaseOrderDetail(poId)
      setSelectedPODetail(detail)
    } catch { /* ignore */ }
  }

  const sortKey = sortConfig?.key as SortKey | undefined

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Receiving</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Incoming stock history and receipt management.</p>
        </div>
        <button onClick={() => navigate('/receiving/new')}
          className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors active:scale-[0.97] flex items-center gap-2">
          <span className="text-lg leading-none">+</span>
          New Receipt
        </button>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Orders received" value={counts.received} />
          <StatCard label="Units received" value={totalUnits.toLocaleString()} sub="received + partial" />
          <StatCard label="Failed" value={failedGroups.length}
            sub={failedGroups.length > 0 ? 'need attention' : 'all clear'} alert={failedGroups.length > 0} />
          <StatCard label="Pending" value={pendingGroups.length}
            sub={pendingGroups.length > 0 ? 'in progress' : 'none open'} />
        </div>
      )}

      {/* Failed alert */}
      {failedGroups.length > 0 && (
        <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
            {failedGroups.length} failed receipt{failedGroups.length !== 1 ? 's' : ''} need attention
          </p>
          {failedGroups.map(g => (
            <p key={g.po_id} className="text-xs text-red-600 dark:text-red-400">
              {g.po_number} · {g.supplier_name} · {g.canonical_receipt ? formatDate(g.canonical_receipt.received_at) : '—'}
            </p>
          ))}
        </div>
      )}

      {/* Awaiting receipt */}
      {(posLoading || submittedPOs.length > 0) && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Awaiting receipt</h3>
            <span className="text-xs text-gray-400">{submittedPOs.length} PO{submittedPOs.length !== 1 ? 's' : ''}</span>
          </div>
          {posLoading ? (
            <div className="p-4 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}
            </div>
          ) : submittedPOs.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">No POs awaiting receipt.</p>
          ) : (
            <div className="divide-y dark:divide-gray-800">
              {submittedPOs.map(po => (
                <button key={po.id} onClick={() => navigate(`/receiving/wizard?po=${po.id}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase shrink-0
                      ${po.status === 'confirmed' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                        : po.status === 'partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                      {po.status}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {po.supplier_name ?? po.account_label}
                    </span>
                    {(po as any).is_test && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 uppercase shrink-0">Test</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-xs font-mono text-gray-400">{po.po_number}</span>
                    {po.expected_at && (
                      <span className="text-xs text-gray-400">
                        due {new Date(po.expected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <span className="text-xs text-blue-500">Receive →</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search bar (#21) */}
      <div className="relative">
        <input
          type="search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by PO number, supplier, or reference…"
          className="w-full pl-9 pr-4 py-2 border dark:border-gray-700 rounded-lg text-sm
                     bg-white dark:bg-gray-900 dark:text-white
                     focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-400 dark:placeholder-gray-500"
        />
        <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        {searching && (
          <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b dark:border-gray-800">
        {([
          { key: 'all',      label: `All (${counts.all})` },
          { key: 'received', label: `Received (${counts.received})` },
          { key: 'partial',  label: `Partial (${counts.partial})` },
          { key: 'pending',  label: `Pending (${counts.pending})` },
          { key: 'failed',   label: `Failed (${counts.failed})` },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors
              ${statusFilter === key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            {searchQuery ? `No receipts match "${searchQuery}"` : 'No receipts found.'}
          </p>
          {!searchQuery && (
            <button onClick={() => navigate('/receiving/new')} className="mt-3 text-sm text-blue-500 hover:underline">
              Start your first receipt →
            </button>
          )}
        </div>
      )}

      {/* PO-grouped receipt list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
            <div className="w-4 shrink-0" />
            <div className="w-24 shrink-0">
              <ThSortable label="Date" sortKey="received_at"
                sortConfig={sortConfig ? { ...sortConfig, key: sortKey as keyof POReceivingGroup } : null}
                onSort={handleSort} />
            </div>
            <div className="flex-1">
              <ThSortable label="Supplier" sortKey="supplier_name"
                sortConfig={sortConfig ? { ...sortConfig, key: sortKey as keyof POReceivingGroup } : null}
                onSort={handleSort} />
            </div>
            <div className="w-52 shrink-0">
              <ThSortable label="PO" sortKey="po_number"
                sortConfig={sortConfig ? { ...sortConfig, key: sortKey as keyof POReceivingGroup } : null}
                onSort={handleSort} />
            </div>
            <div className="w-24 shrink-0">
              <ThSortable label="Status" sortKey="canonical_status"
                sortConfig={sortConfig ? { ...sortConfig, key: sortKey as keyof POReceivingGroup } : null}
                onSort={handleSort} />
            </div>
            <div className="w-24 shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">
              Lines
            </div>
          </div>
          {filtered.map(group => (
            <POGroupRow key={group.po_id} group={group} onRowClick={handleRowClick} />
          ))}
        </div>
      )}

      <PODetailSidebar
        detail={selectedPODetail}
        onClose={() => setSelectedPODetail(null)}
        onReceive={poId => navigate(`/receiving/wizard?po=${poId}`)}
        wide={true}
      />
    </div>
  )
}
