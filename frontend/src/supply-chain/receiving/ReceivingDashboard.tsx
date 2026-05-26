// ReceivingDashboard.tsx
// Route: /receiving
//
// Receiving home page. Groups receipts by PO — a PO is the unit of work,
// receipts are attempts against it. Applied receipt is canonical.
// Failed/pending receipts shown as subordinate history within each PO group.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReceiptAttempt {
  id: string
  status: 'pending' | 'applied' | 'failed' | 'partial' | 'cancelled'
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
  canonical_status: string   // status of the applied receipt, or latest attempt
  canonical_receipt: ReceiptAttempt | null
  attempts: ReceiptAttempt[]
  total_units: number
  total_lines: number
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  applied:   { label: 'Received',  color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',   dot: 'bg-green-500' },
  partial:   { label: 'Partial',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',   dot: 'bg-amber-500' },
  pending:   { label: 'Pending',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       dot: 'bg-blue-400'  },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',           dot: 'bg-red-500'   },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',          dot: 'bg-gray-400'  },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
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

interface RawReceiptRow {
  id: string
  status: string
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
}

function groupByPO(rows: RawReceiptRow[]): POReceivingGroup[] {
  const map = new Map<string, POReceivingGroup>()

  for (const row of rows) {
    if (!map.has(row.po_id)) {
      map.set(row.po_id, {
        po_id: row.po_id,
        po_number: row.po_number,
        is_ad_hoc: row.is_ad_hoc,
        informal_ref: row.informal_ref,
        supplier_name: row.supplier_name,
        account_label: row.account_label,
        canonical_status: 'pending',
        canonical_receipt: null,
        attempts: [],
        total_units: 0,
        total_lines: 0,
      })
    }

    const group = map.get(row.po_id)!
    const attempt: ReceiptAttempt = {
      id: row.id,
      status: row.status as ReceiptAttempt['status'],
      received_at: row.received_at,
      notes: row.notes,
      line_count: row.line_count,
      units_received: row.units_received,
    }
    group.attempts.push(attempt)

    // Applied receipt is always canonical; otherwise use latest
    if (row.status === 'applied' || row.status === 'partial') {
      group.canonical_receipt = attempt
      group.canonical_status = row.status
      group.total_units = row.units_received
      group.total_lines = row.line_count
    } else if (!group.canonical_receipt) {
      group.canonical_receipt = attempt
      group.canonical_status = row.status
      group.total_units = row.units_received
      group.total_lines = row.line_count
    }
  }

  // Sort: applied first, then by most recent date
  return Array.from(map.values()).sort((a, b) => {
    const statusOrder: Record<string, number> = { applied: 0, partial: 1, pending: 2, failed: 3, cancelled: 4 }
    const aOrder = statusOrder[a.canonical_status] ?? 9
    const bOrder = statusOrder[b.canonical_status] ?? 9
    if (aOrder !== bOrder) return aOrder - bOrder
    const aDate = a.canonical_receipt?.received_at ?? ''
    const bDate = b.canonical_receipt?.received_at ?? ''
    return bDate.localeCompare(aDate)
  })
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, alert }: {
  label: string; value: string | number; sub?: string; alert?: boolean
}) {
  return (
    <div className={`border rounded-lg px-4 py-3 ${alert ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
      <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${alert ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PO group row
// ---------------------------------------------------------------------------

function POGroupRow({ group }: { group: POReceivingGroup }) {
  const [expanded, setExpanded] = useState(false)
  const hasMultipleAttempts = group.attempts.length > 1
  const nonCanonical = group.attempts.filter(a => a.id !== group.canonical_receipt?.id)

  return (
    <div className="border-b dark:border-gray-800 last:border-0">
      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">

        {/* Toggle — only shown when there are extra attempts */}
        <button
          type="button"
          onClick={() => hasMultipleAttempts && setExpanded(v => !v)}
          className={`mt-0.5 w-4 shrink-0 text-gray-400 dark:text-gray-500 text-xs
            ${hasMultipleAttempts ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-200' : 'cursor-default opacity-0'}`}
        >
          {expanded ? '▾' : '▸'}
        </button>

        {/* Date */}
        <div className="w-24 shrink-0">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {group.canonical_receipt ? formatDate(group.canonical_receipt.received_at) : '—'}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {group.canonical_receipt ? formatTime(group.canonical_receipt.received_at) : ''}
          </p>
        </div>

        {/* Supplier */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {group.supplier_name}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{group.account_label}</p>
        </div>

        {/* PO */}
        <div className="w-52 shrink-0 min-w-0">
          <p className="text-xs font-mono text-gray-700 dark:text-gray-300">{group.po_number}</p>
          {group.is_ad_hoc && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">Ad hoc</span>
          )}
          {group.informal_ref && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate" title={group.informal_ref}>
              {group.informal_ref}
            </p>
          )}
        </div>

        {/* Status */}
        <div className="w-24 shrink-0 flex flex-col items-start gap-1">
          <StatusBadge status={group.canonical_status} />
          {hasMultipleAttempts && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {group.attempts.length} attempts
            </span>
          )}
        </div>

        {/* Units */}
        <div className="w-16 shrink-0 text-right">
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 tabular-nums">
            {group.total_units}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {group.total_lines} line{group.total_lines !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Expanded: previous attempts */}
      {expanded && nonCanonical.length > 0 && (
        <div className="ml-7 mr-4 mb-2 border dark:border-gray-800 rounded-md overflow-hidden bg-gray-50/50 dark:bg-gray-900/30">
          {nonCanonical.map(attempt => (
            <div key={attempt.id}
              className="flex items-center gap-3 px-3 py-2 border-b dark:border-gray-800 last:border-0 opacity-60">
              <StatusBadge status={attempt.status} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(attempt.received_at)} {formatTime(attempt.received_at)}
              </span>
              {attempt.notes && (
                <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1" title={attempt.notes}>
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

async function fetchReceiptHistory(): Promise<RawReceiptRow[]> {
  const SC_BASE_URL = import.meta.env.VITE_SC_BASE_URL as string
  const SC_TOKEN    = import.meta.env.VITE_SC_ADMIN_TOKEN as string
  const res = await fetch(`${SC_BASE_URL}/api/receiving/history?limit=100`, {
    headers: { 'X-Admin-Token': SC_TOKEN },
  })
  if (!res.ok) throw new Error(`Failed to load receipt history: ${res.status}`)
  return res.json()
}

export default function ReceivingDashboard() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<POReceivingGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    fetchReceiptHistory()
      .then(rows => setGroups(groupByPO(rows)))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = statusFilter === 'all'
    ? groups
    : groups.filter(g => g.canonical_status === statusFilter)

  const totalUnits   = groups.filter(g => g.canonical_status === 'applied' || g.canonical_status === 'partial')
                              .reduce((s, g) => s + g.total_units, 0)
  const failedGroups = groups.filter(g => g.canonical_status === 'failed')
  const pendingGroups = groups.filter(g => g.canonical_status === 'pending')

  const counts = {
    all:     groups.length,
    applied: groups.filter(g => g.canonical_status === 'applied').length,
    pending: pendingGroups.length,
    partial: groups.filter(g => g.canonical_status === 'partial').length,
    failed:  failedGroups.length,
  }

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Receiving</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Incoming stock history and receipt management.
          </p>
        </div>
        <button
          onClick={() => navigate('/receiving/new')}
          className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors active:scale-[0.97] flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span>
          New Receipt
        </button>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Orders received" value={counts.applied} />
          <StatCard label="Units received" value={totalUnits.toLocaleString()} sub="applied only" />
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

      {/* Filter tabs */}
      <div className="flex gap-1 border-b dark:border-gray-800">
        {(['all', 'applied', 'pending', 'partial', 'failed'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors
              ${statusFilter === s
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            {s === 'all' ? `All (${counts.all})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s]})`}
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
          <p className="text-gray-400 dark:text-gray-500 text-sm">No receipts found.</p>
          <button onClick={() => navigate('/receiving/new')}
            className="mt-3 text-sm text-blue-500 hover:underline">
            Start your first receipt →
          </button>
        </div>
      )}

      {/* PO-grouped receipt list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
          {/* Table header */}
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
            <div className="w-4 shrink-0" />
            <div className="w-24 shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</div>
            <div className="flex-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Supplier</div>
            <div className="w-52 shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">PO</div>
            <div className="w-24 shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</div>
            <div className="w-16 shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Units</div>
          </div>
          {filtered.map(group => (
            <POGroupRow key={group.po_id} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}
