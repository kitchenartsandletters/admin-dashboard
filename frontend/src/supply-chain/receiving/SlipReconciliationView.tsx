// SlipReconciliationView.tsx
// Step shown after a packing slip scan matches an existing PO.
//
// Displays a side-by-side reconciliation of what was scanned vs what
// the PO expects. Staff review, adjust quantities if needed, then confirm
// to open the receiving wizard with those lines pre-selected.
//
// Row categories:
//   matched      — ISBN on both slip and PO. Shows slip qty, PO remaining,
//                  and a delta badge (green ✓ when qty matches, amber when off).
//   on_slip_only — ISBN scanned but not on this PO. May be a mis-ship or a
//                  title to add to the PO. Shown in amber.
//   on_po_only   — Open PO line not covered by this slip. Still outstanding.
//                  Shown in muted gray — not receiving today.

import { useState } from 'react'
import type { SlipMatchCandidate, ReconciliationLine } from '../../api/supplyChainApi'

interface Props {
  candidate:   SlipMatchCandidate
  onConfirm:   (poId: string, quantities: Record<string, number>) => void
  onBack:      () => void
}

function DeltaBadge({ delta, slipQty, poQty }: { delta: number | null; slipQty: number; poQty: number }) {
  if (delta === null) return null
  if (delta === 0) return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-bold">
      ✓ qty match
    </span>
  )
  if (delta > 0) return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-bold">
      +{delta} over PO
    </span>
  )
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold">
      {delta} short
    </span>
  )
}

export default function SlipReconciliationView({ candidate, onConfirm, onBack }: Props) {
  // Editable quantities — keyed by isbn (for matched lines only)
  const [editQtys, setEditQtys] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const line of candidate.reconciliation) {
      if ((line.status === 'matched' || line.status === 'matched_fuzzy') && line.isbn) {
        // Default to the smaller of slip qty and PO remaining
        init[line.isbn] = Math.min(line.slip_qty, line.po_qty)
      }
    }
    return init
  })

  const matched     = candidate.reconciliation.filter(l => l.status === 'matched' || l.status === 'matched_fuzzy')
  const onSlipOnly  = candidate.reconciliation.filter(l => l.status === 'on_slip_only')
  const onPOOnly    = candidate.reconciliation.filter(l => l.status === 'on_po_only')

  const totalReceiving = Object.values(editQtys).reduce((s, q) => s + q, 0)
  const coveragePct    = Math.round(candidate.slip_coverage * 100)

  const handleConfirm = () => {
    // Build isbn → qty map for matched lines that have qty > 0
    const quantities: Record<string, number> = {}
    for (const line of matched) {
      if (line.isbn) {
        const qty = editQtys[line.isbn] ?? 0
        if (qty > 0) quantities[line.isbn] = qty
      }
    }
    onConfirm(candidate.po_id, quantities)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">✓</span>
          <h2 className="font-bold text-lg text-gray-900 dark:text-white">Review shipment</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 ml-8">
          Packing slip matched to an existing PO. Review quantities before receiving.
        </p>
      </div>

      {/* PO summary chip */}
      <div className="flex items-start justify-between px-4 py-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Matched to</p>
          <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{candidate.po_number}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {candidate.supplier_name ?? candidate.account_label}
            {candidate.informal_ref && <span className="ml-1 font-mono">· {candidate.informal_ref}</span>}
          </p>
        </div>
        <div className="text-right">
          <span className={`text-sm font-bold tabular-nums ${
            coveragePct >= 80 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
          }`}>{coveragePct}%</span>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">slip coverage</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            {candidate.overlap_count} of {candidate.slip_total} ISBNs matched
          </p>
        </div>
      </div>

      {/* Matched lines */}
      {matched.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-green-50 dark:bg-green-900/20 border-b dark:border-gray-700 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400">
              On slip and on PO ({matched.length})
            </p>
            <p className="text-xs text-gray-400">{totalReceiving} units to receive</p>
          </div>
          <div className="divide-y dark:divide-gray-800">
            {matched.map((line, idx) => (
              <div key={idx} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {line.title ?? line.isbn ?? '—'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {line.isbn && <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{line.isbn}</span>}
                    {line.status === 'matched_fuzzy' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 uppercase">
                        Recovered — confirm
                      </span>
                    )}
                    <DeltaBadge delta={line.delta} slipQty={line.slip_qty} poQty={line.po_qty} />
                  </div>
                  {line.status === 'matched_fuzzy' && line.recovered_isbn && (
                    <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-0.5">
                      OCR read <span className="font-mono">{line.original_slip_isbn ?? line.isbn}</span> → matched <span className="font-mono">{line.recovered_isbn}</span>
                      {line.match_method === 'fuzzy_title' ? ' by title' : line.match_method === 'fuzzy_isbn' ? ' by near-ISBN' : ' by ISBN + title'}
                      {typeof line.match_score === 'number' ? ` (${Math.round(line.match_score * 100)}%)` : ''}. Verify before receiving.
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                    Slip: {line.slip_qty} · PO remaining: {line.po_qty}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <label className="text-[10px] text-gray-400 uppercase tracking-wide">Receive</label>
                  <input
                    type="number"
                    min={0}
                    max={line.po_qty}
                    value={line.isbn ? (editQtys[line.isbn] ?? 0) : 0}
                    onChange={e => {
                      if (!line.isbn) return
                      const v = Math.min(Math.max(0, parseInt(e.target.value) || 0), line.po_qty)
                      setEditQtys(prev => ({ ...prev, [line.isbn!]: v }))
                    }}
                    className="w-16 px-2 py-1 border dark:border-gray-600 rounded text-sm text-center
                               dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* On slip only — not on PO */}
      {onSlipOnly.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              On slip — not on this PO ({onSlipOnly.length})
            </p>
            <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
              These titles were scanned but don't appear on PO-{candidate.po_number}. Check for mis-shipments or add to PO.
            </p>
          </div>
          <div className="divide-y dark:divide-gray-800">
            {onSlipOnly.map((line, idx) => (
              <div key={idx} className="px-4 py-2.5 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{line.title ?? line.isbn ?? '—'}</p>
                  {line.isbn && <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{line.isbn}</p>}
                </div>
                <span className="text-xs font-mono text-amber-600 dark:text-amber-400 shrink-0 ml-3">× {line.slip_qty}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* On PO only — still outstanding */}
      {onPOOnly.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              On PO — not in this shipment ({onPOOnly.length})
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Still outstanding. Will remain open after this receipt.</p>
          </div>
          <div className="divide-y dark:divide-gray-800">
            {onPOOnly.map((line, idx) => (
              <div key={idx} className="px-4 py-2.5 flex items-center justify-between opacity-60">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{line.title ?? '—'}</p>
                </div>
                <span className="text-xs font-mono text-gray-400 shrink-0 ml-3">× {line.po_qty} outstanding</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onBack}
          className="px-4 py-2.5 rounded-md border border-gray-300 dark:border-gray-600
                     text-sm text-gray-600 dark:text-gray-300
                     hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={totalReceiving === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold
                     py-2.5 rounded-md text-sm transition-colors disabled:opacity-50
                     active:scale-[0.98]"
        >
          Receive {totalReceiving} unit{totalReceiving !== 1 ? 's' : ''} against {candidate.po_number} →
        </button>
      </div>
    </div>
  )
}
