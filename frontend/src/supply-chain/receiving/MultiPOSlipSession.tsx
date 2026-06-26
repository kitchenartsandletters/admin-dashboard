// MultiPOSlipSession.tsx
// Dashboard for a single packing slip that fulfills MULTIPLE purchase orders.
//
// Context (#50):
//   A distributor-fulfilled carton (e.g. one Hachette box) routinely satisfies
//   several POs placed against DIFFERENT ordering parties at once — Hachette's
//   own titles, Abrams (ordered via Chesapeake & Hudson), Chronicle, etc.
//   matchSlipToPO already returns multiple ranked candidates keyed purely on
//   ISBN overlap (party-agnostic). This component consumes that result.
//
// Model (chosen): DASHBOARD.
//   - The merged slip is segmented by ISBN: each slip line is attached to the
//     PO whose open lines contain that ISBN. Lines matching no open PO go to an
//     "unassigned" bucket (mis-ships / new titles / not-yet-shipped backorders).
//   - One card per matched PO. Staff receive them in ANY order.
//   - Each card tracks status: pending → received / partial / skipped.
//   - Each PO gets its OWN receipt (separate receipt history per ordering party).
//   - Progress tally ("2 of 3 received · 1 pending") so nothing is dropped.
//
// Receiving a card happens INLINE (SegmentReceivePanel) — the dashboard stays
// mounted and updates as each PO is completed. This deliberately does NOT
// navigate away to the standalone /receiving/wizard route, so session progress
// is preserved.
//
// Hard rule preserved: quantity_received = undamaged copies only.
//   "Total arrived" = received + damaged. Damaged copies are tracked separately
//   and never restocked to Shopify.

import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ParsedSlipLine, SlipMatchCandidate } from '../../api/supplyChainApi'
import { fetchPurchaseOrderDetail, receiveOrder } from '../../api/supplyChainApi'
import type { PurchaseOrderDetail } from '../purchase-orders/purchaseOrderTypes'
import type {
  ReceiveLineInput,
  DamageDisposal,
  DamageResolution,
} from './receivingTypes'

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

type SegmentStatus = 'pending' | 'in_progress' | 'received' | 'partial' | 'skipped'

interface SlipAssignment {
  isbn:       string
  title:      string | null
  slip_qty:   number
}

interface POSegment {
  candidate:   SlipMatchCandidate
  assignments: SlipAssignment[]   // slip lines whose ISBN belongs to this PO
  slip_units:  number             // sum of slip_qty across assignments
  status:      SegmentStatus
  // Populated after a receive completes
  units_received?: number
  units_damaged?:  number
  receipt_id?:     string
}

interface Props {
  slipLines:   ParsedSlipLine[]
  candidates:  SlipMatchCandidate[]
  locationName: (id: string) => string
  onExit:      () => void   // back to PO lookup / receiving home
}

// ---------------------------------------------------------------------------
// Segmentation — assign each slip ISBN to exactly one PO candidate.
//
// A slip ISBN belongs to a candidate if that candidate's reconciliation has a
// `matched` row for it. If multiple candidates claim the same ISBN (rare —
// genuinely duplicated title across POs), the candidate with higher overall
// slip_coverage wins, so the ISBN lands where it fits best. Anything claimed by
// no candidate is unassigned.
// ---------------------------------------------------------------------------

interface Segmentation {
  segments:    POSegment[]
  unassigned:  SlipAssignment[]
}

function segmentSlip(slipLines: ParsedSlipLine[], candidates: SlipMatchCandidate[]): Segmentation {
  // Build ISBN → best-owning-candidate index from each candidate's matched rows.
  const owner = new Map<string, { idx: number; coverage: number }>()
  candidates.forEach((c, idx) => {
    for (const recon of c.reconciliation) {
      if (recon.status !== 'matched' || !recon.isbn) continue
      const isbn = recon.isbn.trim()
      const prev = owner.get(isbn)
      if (!prev || c.slip_coverage > prev.coverage) {
        owner.set(isbn, { idx, coverage: c.slip_coverage })
      }
    }
  })

  const buckets: SlipAssignment[][] = candidates.map(() => [])
  const unassigned: SlipAssignment[] = []

  for (const line of slipLines) {
    const isbn = line.isbn?.trim()
    if (!isbn) continue  // no-ISBN lines can't be auto-routed; surfaced via unassigned below
    const assignment: SlipAssignment = {
      isbn,
      title: line.title ?? null,
      slip_qty: line.quantity ?? 0,
    }
    const o = owner.get(isbn)
    if (o) buckets[o.idx].push(assignment)
    else unassigned.push(assignment)
  }

  // Also surface no-ISBN slip lines as unassigned (need manual handling)
  for (const line of slipLines) {
    if (line.isbn?.trim()) continue
    unassigned.push({ isbn: '', title: line.title ?? null, slip_qty: line.quantity ?? 0 })
  }

  const segments: POSegment[] = candidates.map((candidate, idx) => {
    const assignments = buckets[idx]
    return {
      candidate,
      assignments,
      slip_units: assignments.reduce((s, a) => s + a.slip_qty, 0),
      status: 'pending' as SegmentStatus,
    }
  })
  // Drop candidates that ended up owning zero slip lines (fully subsumed by a
  // higher-coverage sibling) — they're noise on the dashboard.
  const nonEmpty = segments.filter(s => s.assignments.length > 0)

  return { segments: nonEmpty, unassigned }
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: SegmentStatus }) {
  const cfg: Record<SegmentStatus, { label: string; cls: string }> = {
    pending:     { label: 'Pending',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    in_progress: { label: 'In progress', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
    received:    { label: 'Received',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    partial:     { label: 'Partial',     cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    skipped:     { label: 'Skipped',     cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  }
  const { label, cls } = cfg[status]
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide shrink-0 ${cls}`}>{label}</span>
}

// ---------------------------------------------------------------------------
// Inline receive panel for a single PO segment
//
// Loads the PO detail, pre-fills received quantities from the slip assignments
// (capped at each line's remaining), and supports the same damage handling as
// the main wizard. Calls receiveOrder, then reports the result up so the
// dashboard can mark this segment done.
// ---------------------------------------------------------------------------

interface PanelLine {
  purchase_order_line_id: string
  inventory_item_id: string
  title: string
  isbn: string | null
  remaining: number
  quantity_received: number
  quantity_damaged: number
  damage_disposal: DamageDisposal | null
  damage_resolution: DamageResolution | null
  on_slip: boolean
}

function SegmentReceivePanel({
  segment,
  locationName,
  onCancel,
  onComplete,
}: {
  segment: POSegment
  locationName: (id: string) => string
  onCancel: () => void
  onComplete: (result: { status: SegmentStatus; units_received: number; units_damaged: number; receipt_id: string }) => void
}) {
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null)
  const [lines, setLines]   = useState<PanelLine[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [notes, setNotes]   = useState('')
  const [loadStarted, setLoadStarted] = useState(false)

  // Build a slip qty lookup by ISBN for pre-fill
  const slipQtyByIsbn = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of segment.assignments) if (a.isbn) m[a.isbn] = (m[a.isbn] ?? 0) + a.slip_qty
    return m
  }, [segment.assignments])

  // Load PO detail once
  if (!loadStarted) {
    setLoadStarted(true)
    fetchPurchaseOrderDetail(segment.candidate.po_id)
      .then(d => {
        setDetail(d)
        const active = d.lines.filter(l => l.status !== 'cancelled' && l.status !== 'received')
        setLines(active.map(l => {
          const remaining = l.quantity_ordered - l.quantity_received
          const isbn = l.isbn ?? null
          const slipQty = isbn ? (slipQtyByIsbn[isbn] ?? 0) : 0
          const prefill = Math.min(slipQty, remaining)
          return {
            purchase_order_line_id: l.id,
            inventory_item_id: l.inventory_item_id,
            title: l.title ?? `Item ${l.inventory_item_id.split('/').pop()}`,
            isbn,
            remaining,
            quantity_received: prefill,
            quantity_damaged: 0,
            damage_disposal: null,
            damage_resolution: null,
            on_slip: slipQty > 0,
          }
        }))
        const ref = (d.order as any).informal_ref
        if (ref) setNotes(ref)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load PO'))
      .finally(() => setLoading(false))
  }

  const setLineQty = (id: string, field: 'quantity_received' | 'quantity_damaged', value: number) => {
    setLines(prev => prev.map(l => {
      if (l.purchase_order_line_id !== id) return l
      if (field === 'quantity_received') {
        const v = Math.min(Math.max(0, value), l.remaining - l.quantity_damaged)
        return { ...l, quantity_received: v }
      } else {
        const v = Math.min(Math.max(0, value), l.remaining - l.quantity_received)
        return { ...l, quantity_damaged: v }
      }
    }))
  }

  const setLineResolution = (id: string, resolution: DamageResolution | null) => {
    setLines(prev => prev.map(l => l.purchase_order_line_id === id ? { ...l, damage_resolution: resolution } : l))
  }

  const totalReceiving = lines.reduce((s, l) => s + l.quantity_received, 0)
  const totalDamaged   = lines.reduce((s, l) => s + l.quantity_damaged, 0)

  const handleSubmit = async () => {
    if (!detail) return
    setBusy(true)
    setError(null)
    try {
      const activeLines = lines.filter(l => l.quantity_received > 0 || l.quantity_damaged > 0)
      if (activeLines.length === 0) {
        setError('Enter at least one received or damaged quantity, or skip this PO.')
        setBusy(false)
        return
      }

      // receipt_type: full only if every active line covers its full remaining
      // (credit-resolved damage counts as closing the line)
      const allFull = lines.every(l => {
        const arrived = l.quantity_received + l.quantity_damaged
        if (arrived === 0) return l.remaining === 0
        return arrived >= l.remaining && (l.quantity_damaged === 0 || l.damage_resolution === 'credit')
      })

      // Fold damage disposal/resolution context into notes
      const damageNotes = activeLines
        .filter(l => l.quantity_damaged > 0)
        .map(l => {
          const parts = [`${l.title}: ${l.quantity_damaged} damaged`]
          if (l.damage_disposal === 'donate_destroy') parts.push('donate/destroy')
          if (l.damage_disposal === 'return') parts.push('return with call tag')
          if (l.damage_resolution === 'credit') parts.push('credit taken')
          if (l.damage_resolution === 'replacement_pending') parts.push('replacement incoming on this PO')
          return parts.join(' — ')
        })
      const combinedNotes = [
        notes.trim() || null,
        damageNotes.length > 0 ? `Damage: ${damageNotes.join('; ')}` : null,
      ].filter(Boolean).join('\n') || undefined

      const payload: ReceiveLineInput[] = activeLines.map(l => ({
        purchase_order_line_id: l.purchase_order_line_id,
        inventory_item_id: l.inventory_item_id,
        quantity_received: l.quantity_received,   // undamaged only — hard rule
        quantity_damaged: l.quantity_damaged,
        damage_resolution: l.damage_resolution,
      }))

      const res = await receiveOrder({
        purchase_order_id: detail.order.id,
        location_id: detail.order.destination_location_id,
        receipt_type: allFull ? 'full' : 'partial',
        notes: combinedNotes,
        lines: payload,
      })

      onComplete({
        status: res.status === 'applied' || res.status === 'test_applied'
          ? (allFull ? 'received' : 'partial')
          : 'partial',
        units_received: totalReceiving,
        units_damaged: totalDamaged,
        receipt_id: res.receipt_id,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Receiving failed')
      setBusy(false)
    }
  }

  const c = segment.candidate

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{c.po_number}</span>
            <StatusBadge status="in_progress" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {c.supplier_name ?? c.account_label}
            {c.informal_ref && <span className="ml-1 font-mono">· {c.informal_ref}</span>}
          </p>
        </div>
        <button onClick={onCancel} disabled={busy}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:underline disabled:opacity-50 shrink-0">
          ← Back to slip
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">Loading PO lines…</p>}

      {!loading && detail && (
        <>
          <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 text-sm">
            <span className="text-blue-800 dark:text-blue-200">Receiving into <strong>{locationName(detail.order.destination_location_id)}</strong></span>
          </div>

          <div className="space-y-2">
            {lines.map(l => (
              <div key={l.purchase_order_line_id}
                className={`rounded-md border px-4 py-3 ${
                  l.quantity_damaged > 0
                    ? 'border-amber-400 dark:border-amber-600'
                    : l.on_slip ? 'dark:border-gray-700' : 'border-gray-200 dark:border-gray-800 opacity-70'
                }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{l.title}</p>
                      {!l.on_slip && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 uppercase shrink-0">
                          Not on slip
                        </span>
                      )}
                    </div>
                    {l.isbn && <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">{l.isbn}</p>}
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Remaining: {l.remaining}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end gap-1">
                      <label className="text-[10px] text-gray-400 uppercase tracking-wide">Received</label>
                      <input type="number" min={0} max={l.remaining - l.quantity_damaged}
                        value={l.quantity_received}
                        onChange={e => setLineQty(l.purchase_order_line_id, 'quantity_received', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 border dark:border-gray-600 rounded text-sm text-center dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <label className="text-[10px] text-amber-500 uppercase tracking-wide">Damaged</label>
                      <input type="number" min={0} max={l.remaining - l.quantity_received}
                        value={l.quantity_damaged}
                        onChange={e => setLineQty(l.purchase_order_line_id, 'quantity_damaged', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 border border-amber-300 dark:border-amber-700 rounded text-sm text-center bg-amber-50/50 dark:bg-amber-900/10 dark:text-white focus:ring-2 focus:ring-amber-400 outline-none font-mono" />
                    </div>
                  </div>
                </div>

                {l.quantity_damaged > 0 && (
                  <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800 flex gap-2">
                    {([
                      { value: 'credit', label: 'Credit — closes line' },
                      { value: 'replacement_pending', label: 'Replacement incoming' },
                    ] as const).map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setLineResolution(l.purchase_order_line_id, l.damage_resolution === opt.value ? null : opt.value)}
                        className={`flex-1 px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                          l.damage_resolution === opt.value
                            ? opt.value === 'credit'
                              ? 'border-green-400 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                              : 'border-blue-400 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>

          {error && (
            <div className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">{error}</div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {totalReceiving} to restock{totalDamaged > 0 ? ` · ${totalDamaged} damaged` : ''}
            </p>
            <button onClick={handleSubmit} disabled={busy}
              className="px-5 py-2.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 active:scale-[0.98]">
              {busy ? 'Applying…' : `Receive against ${c.po_number} →`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main session dashboard
// ---------------------------------------------------------------------------

export default function MultiPOSlipSession({ slipLines, candidates, locationName, onExit }: Props) {
  const navigate = useNavigate()
  const initial = useMemo(() => segmentSlip(slipLines, candidates), [slipLines, candidates])

  const [segments, setSegments] = useState<POSegment[]>(initial.segments)
  const unassigned = initial.unassigned
  const [activePoId, setActivePoId] = useState<string | null>(null)

  const activeSegment = segments.find(s => s.candidate.po_id === activePoId) ?? null

  const handleComplete = useCallback((poId: string, result: { status: SegmentStatus; units_received: number; units_damaged: number; receipt_id: string }) => {
    setSegments(prev => prev.map(s => s.candidate.po_id === poId
      ? { ...s, status: result.status, units_received: result.units_received, units_damaged: result.units_damaged, receipt_id: result.receipt_id }
      : s))
    setActivePoId(null)
  }, [])

  const handleSkip = useCallback((poId: string) => {
    setSegments(prev => prev.map(s => s.candidate.po_id === poId ? { ...s, status: 'skipped' } : s))
  }, [])

  const handleUnskip = useCallback((poId: string) => {
    setSegments(prev => prev.map(s => s.candidate.po_id === poId ? { ...s, status: 'pending' } : s))
  }, [])

  // Progress tally
  const total = segments.length
  const done = segments.filter(s => s.status === 'received' || s.status === 'partial').length
  const pending = segments.filter(s => s.status === 'pending' || s.status === 'in_progress').length
  const skipped = segments.filter(s => s.status === 'skipped').length
  const allHandled = pending === 0

  // ── Inline receive view ──────────────────────────────────────────────────
  if (activeSegment) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <SegmentReceivePanel
          segment={activeSegment}
          locationName={locationName}
          onCancel={() => setActivePoId(null)}
          onComplete={(r) => handleComplete(activeSegment.candidate.po_id, r)}
        />
      </div>
    )
  }

  // ── Dashboard view ───────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">⊞</span>
          <h2 className="font-bold text-lg text-gray-900 dark:text-white">This slip covers {total} purchase orders</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 ml-8">
          One shipment, several POs. Receive each one — in any order. Each gets its own receipt.
        </p>
      </div>

      {/* Progress tally */}
      <div className="flex items-center gap-4 px-4 py-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm">
        <span className="text-green-600 dark:text-green-400 font-semibold">{done} received</span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span className="text-blue-600 dark:text-blue-400 font-semibold">{pending} pending</span>
        {skipped > 0 && (
          <>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-gray-500 dark:text-gray-400">{skipped} skipped</span>
          </>
        )}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{done + skipped} of {total} handled</span>
      </div>

      {/* PO cards */}
      <div className="space-y-3">
        {segments.map(seg => {
          const c = seg.candidate
          const handled = seg.status === 'received' || seg.status === 'partial'
          return (
            <div key={c.po_id}
              className={`rounded-lg border px-4 py-3.5 transition-colors ${
                seg.status === 'received' ? 'border-green-300 dark:border-green-800 bg-green-50/40 dark:bg-green-900/10'
                : seg.status === 'partial' ? 'border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-900/10'
                : seg.status === 'skipped' ? 'border-gray-200 dark:border-gray-800 opacity-60'
                : 'dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{c.po_number}</span>
                    <StatusBadge status={seg.status} />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                    {c.supplier_name ?? c.account_label}
                    {c.informal_ref && <span className="ml-1 font-mono text-gray-400 dark:text-gray-500">· {c.informal_ref}</span>}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    {seg.assignments.length} slip line{seg.assignments.length !== 1 ? 's' : ''} · {seg.slip_units} unit{seg.slip_units !== 1 ? 's' : ''} on this slip
                    {handled && seg.units_received != null && (
                      <span className="text-green-600 dark:text-green-400"> · {seg.units_received} received{seg.units_damaged ? `, ${seg.units_damaged} damaged` : ''}</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  {seg.status === 'pending' || seg.status === 'in_progress' ? (
                    <>
                      <button onClick={() => setActivePoId(c.po_id)}
                        className="px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
                        Receive →
                      </button>
                      <button onClick={() => handleSkip(c.po_id)}
                        className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:underline">
                        Skip
                      </button>
                    </>
                  ) : seg.status === 'skipped' ? (
                    <button onClick={() => handleUnskip(c.po_id)}
                      className="text-xs text-blue-500 hover:underline">Un-skip</button>
                  ) : (
                    <button onClick={() => setActivePoId(c.po_id)}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:underline">Receive more</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Unassigned slip lines */}
      {unassigned.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              On slip — not matched to any open PO ({unassigned.length})
            </p>
            <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
              Mis-shipments, new titles, or items on a different PO. Review separately — they won't be received here.
            </p>
          </div>
          <div className="divide-y dark:divide-gray-800">
            {unassigned.map((a, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{a.title ?? a.isbn ?? '—'}</p>
                  {a.isbn && <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{a.isbn}</p>}
                </div>
                <span className="text-xs font-mono text-amber-600 dark:text-amber-400 shrink-0 ml-3">× {a.slip_qty}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex gap-3 pt-1">
        <button onClick={onExit}
          className="px-4 py-2.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          ← Exit slip
        </button>
        {allHandled && (
          <button onClick={() => navigate('/receiving')}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-md text-sm transition-colors active:scale-[0.98]">
            All POs handled — finish ✓
          </button>
        )}
      </div>
    </div>
  )
}
