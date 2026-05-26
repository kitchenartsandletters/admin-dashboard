// ReceivingDashboard.tsx
// Route: /receiving
//
// The receiving home page. Shows:
//   - "Start New Receipt" as the primary action
//   - Recent receipt history with status, supplier, units
//   - Quick-access to in-progress or failed receipts
//
// /receiving/new (ReceivingEntryFlow) is launched from here, not from the nav directly.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchReceiptsForPO, fetchPurchaseOrders } from '../../api/supplyChainApi'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReceiptRow {
  id: string
  status: 'pending' | 'applied' | 'failed' | 'partial' | 'cancelled'
  received_at: string
  notes: string | null
  po_number: string
  is_ad_hoc: boolean
  informal_ref: string | null
  supplier_name: string
  account_label: string
  line_count: number
  units_received: number
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  applied:   { label: 'Applied',   color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',   dot: 'bg-green-500' },
  partial:   { label: 'Partial',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',   dot: 'bg-amber-500' },
  pending:   { label: 'Pending',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       dot: 'bg-blue-400' },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',           dot: 'bg-red-500' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',          dot: 'bg-gray-400' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border dark:border-gray-700 rounded-lg px-4 py-3 bg-white dark:bg-gray-900">
      <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

async function fetchReceiptHistory(): Promise<ReceiptRow[]> {
  const SC_BASE_URL = import.meta.env.VITE_SC_BASE_URL as string
  const SC_TOKEN    = import.meta.env.VITE_SC_ADMIN_TOKEN as string

  const res = await fetch(`${SC_BASE_URL}/api/receiving/history?limit=50`, {
    headers: { 'X-Admin-Token': SC_TOKEN },
  })
  if (!res.ok) throw new Error(`Failed to load receipt history: ${res.status}`)
  return res.json()
}

export default function ReceivingDashboard() {
  const navigate = useNavigate()
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    fetchReceiptHistory()
      .then(setReceipts)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = statusFilter === 'all'
    ? receipts
    : receipts.filter(r => r.status === statusFilter)

  // Stats
  const applied   = receipts.filter(r => r.status === 'applied')
  const failed    = receipts.filter(r => r.status === 'failed')
  const pending   = receipts.filter(r => r.status === 'pending')
  const totalUnits = applied.reduce((s, r) => s + r.units_received, 0)

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Receiving</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Process incoming stock and manage receipt history.
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

      {/* Stats row */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total receipts" value={receipts.length} />
          <StatCard label="Units received" value={totalUnits.toLocaleString()} sub="applied only" />
          <StatCard
            label="Failed"
            value={failed.length}
            sub={failed.length > 0 ? 'need attention' : 'all clear'}
          />
          <StatCard
            label="Pending"
            value={pending.length}
            sub={pending.length > 0 ? 'in progress' : 'none open'}
          />
        </div>
      )}

      {/* Attention: failed receipts */}
      {failed.length > 0 && (
        <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
            {failed.length} failed receipt{failed.length !== 1 ? 's' : ''} need attention
          </p>
          <div className="space-y-1">
            {failed.map(r => (
              <p key={r.id} className="text-xs text-red-600 dark:text-red-400">
                {r.po_number} · {r.supplier_name} · {formatDate(r.received_at)}
                {r.notes && <span className="text-red-400 ml-1">— {r.notes.slice(0, 80)}</span>}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b dark:border-gray-800">
        {['all', 'applied', 'pending', 'partial', 'failed'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors capitalize
              ${statusFilter === s
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            {s === 'all' ? `All (${receipts.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${receipts.filter(r => r.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Receipt list */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
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
          <button
            onClick={() => navigate('/receiving/new')}
            className="mt-3 text-sm text-blue-500 hover:underline"
          >
            Start your first receipt →
          </button>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Supplier</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">PO</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Units</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {filtered.map(r => (
                <tr key={r.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-gray-900 dark:text-gray-100 font-medium">{formatDate(r.received_at)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{formatTime(r.received_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900 dark:text-gray-100 font-medium truncate max-w-[180px]">{r.supplier_name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[180px]">{r.account_label}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-gray-700 dark:text-gray-300">{r.po_number}</p>
                    {r.is_ad_hoc && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">Ad hoc</span>
                    )}
                    {r.informal_ref && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate max-w-[160px]">
                        {r.informal_ref}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {r.units_received}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      {r.line_count} line{r.line_count !== 1 ? 's' : ''}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
