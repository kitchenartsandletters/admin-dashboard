// ReceivingWizard.tsx
// Phase-based wizard: idle → review → confirming → result
// Launched from /receiving/wizard?po={id}
//
// Packing slip scan:
//   - Available in the review phase, above the line rows
//   - Calls parse-and-lookup (same as ReceivingEntryFlow)
//   - Matches returned ISBNs against the loaded PO lines
//   - Updates quantity_received on matched lines; leaves unmatched lines
//     at their default (full remaining qty)
//   - After scan, staff review and can still adjust any quantity manually
//   - Unmatched lines (on PO but not on slip) stay at their pre-filled qty
//     and are highlighted so staff know to verify
//
// Location:
//   - The receive is applied at the PO's destination_location_id.
//   - DEFAULT_LOCATION_ID (HQ) is only a fallback for legacy POs that predate
//     the destination_location_id column.
//   - The resolved destination is shown in the review screen so the receiver
//     always sees which store stock is being received into.
//
// Damage handling:
//   - Staff enter a free-text damage note per line (notes_damaged: string | null)
//   - This note is folded into the receipt-level notes field on submit
//   - quantity_damaged is always sent as 0 — no Shopify damaged state mutation
//   - receipt_type (full/partial) computed automatically from quantities

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { WizardLine, ReceiveResult } from './receivingTypes'
import { PurchaseOrderDetail } from '../purchase-orders/purchaseOrderTypes'
import {
  fetchPurchaseOrderDetail,
  receiveOrder,
  parseAndLookup,
  ParsedSlipLine,
} from '../../api/supplyChainApi'
import { useLocations } from '../hooks/useLocations'
import { formatDate } from '../../utils/tableUtils'

type Phase = 'idle' | 'review' | 'confirming' | 'result'
type ScanState = 'idle' | 'scanning' | 'done' | 'error'

// Fallback only — used when a (legacy) PO has no destination_location_id.
const DEFAULT_LOCATION_ID = 'gid://shopify/Location/40052293765'

// ---------------------------------------------------------------------------
// Packing slip scanner — inline in the review phase
//
// Renders as a compact banner above the line rows. After a successful scan
// it shows a summary of how many lines were matched and updates quantities.
// The user can rescan or dismiss and adjust quantities manually.
// ---------------------------------------------------------------------------

function WizardSlipScanner({
  lines,
  onLinesUpdated,
}: {
  lines: WizardLine[]
  onLinesUpdated: (updates: Record<string, number>) => void
}) {
  const [scanState, setScanState]   = useState<ScanState>('idle')
  const [scanSummary, setScanSummary] = useState<{
    matched: number
    unmatched: number
    notOnSlip: number
    previewUrl: string | null
  } | null>(null)
  const [scanError, setScanError]   = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const previewUrl = URL.createObjectURL(file)
    setScanState('scanning')
    setScanError(null)
    setScanSummary(null)

    try {
      const result = await parseAndLookup(file)

      if (result.stub || result.lines.length === 0) {
        setScanError('Could not extract lines from this image. Adjust quantities manually.')
        setScanState('error')
        return
      }

      // Build ISBN → qty map from the parsed slip
      const slipQtyByIsbn: Record<string, number> = {}
      for (const sl of result.lines) {
        if (sl.isbn && sl.quantity != null) {
          // Sum in case the same ISBN appears on multiple parcels/pages
          slipQtyByIsbn[sl.isbn] = (slipQtyByIsbn[sl.isbn] ?? 0) + sl.quantity
        }
      }

      // Match against the wizard's loaded PO lines by ISBN
      const updates: Record<string, number> = {}  // purchase_order_line_id → new qty_received
      let matched = 0
      let notOnSlip = 0

      for (const wizLine of lines) {
        if (!wizLine.isbn) continue
        const slipQty = slipQtyByIsbn[wizLine.isbn]
        const remaining = wizLine.quantity_ordered - wizLine.quantity_previously_received
        if (slipQty != null) {
          // Clamp to remaining — can't receive more than outstanding
          updates[wizLine.purchase_order_line_id] = Math.min(slipQty, remaining)
          matched++
        } else {
          // On PO but not on packing slip — set to 0, staff will notice
          updates[wizLine.purchase_order_line_id] = 0
          notOnSlip++
        }
      }

      // ISBNs on slip but not found in the PO lines (might be backorders,
      // wrong PO, or the product isn't in our catalog yet)
      const poIsbns = new Set(lines.map(l => l.isbn).filter(Boolean))
      const unmatched = Object.keys(slipQtyByIsbn).filter(isbn => !poIsbns.has(isbn)).length

      onLinesUpdated(updates)
      setScanSummary({ matched, unmatched, notOnSlip, previewUrl })
      setScanState('done')
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed')
      setScanState('error')
    }

    if (inputRef.current) inputRef.current.value = ''
  }

  const handleReset = () => {
    setScanState('idle')
    setScanSummary(null)
    setScanError(null)
  }

  // ── Idle ─────────────────────────────────────────────────────────────────
  if (scanState === 'idle') {
    return (
      <div className="flex items-center justify-between px-4 py-3 rounded-md border border-dashed
                      border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/30">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Scan packing slip to auto-fill quantities
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-xs font-semibold
                     text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 transition-colors"
        >
          📷 Scan slip
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    )
  }

  // ── Scanning ──────────────────────────────────────────────────────────────
  if (scanState === 'scanning') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-md border dark:border-gray-700
                      bg-gray-50/50 dark:bg-gray-900/30">
        <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
        <p className="text-xs text-gray-500 dark:text-gray-400 animate-pulse">
          Reading packing slip and matching lines…
        </p>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (scanState === 'error') {
    return (
      <div className="flex items-center justify-between px-4 py-3 rounded-md border
                      border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <p className="text-xs text-red-700 dark:text-red-300">{scanError}</p>
        <button type="button" onClick={handleReset}
          className="text-xs text-red-500 hover:underline shrink-0 ml-3">
          Try again
        </button>
      </div>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (scanState === 'done' && scanSummary) {
    return (
      <div className={`px-4 py-3 rounded-md border space-y-1
        ${scanSummary.notOnSlip > 0 || scanSummary.unmatched > 0
          ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
          : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <p className={`text-xs font-semibold ${
              scanSummary.notOnSlip > 0 || scanSummary.unmatched > 0
                ? 'text-amber-800 dark:text-amber-200'
                : 'text-green-800 dark:text-green-200'}`}>
              {scanSummary.matched === 0
                ? 'No lines matched — verify quantities manually'
                : `${scanSummary.matched} line${scanSummary.matched !== 1 ? 's' : ''} matched from packing slip`}
            </p>
            {scanSummary.notOnSlip > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                ⚠ {scanSummary.notOnSlip} line{scanSummary.notOnSlip !== 1 ? 's' : ''} on this PO
                not found on slip — set to 0. Verify if backordered or still outstanding.
              </p>
            )}
            {scanSummary.unmatched > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                ⚠ {scanSummary.unmatched} ISBN{scanSummary.unmatched !== 1 ? 's' : ''} on the
                slip not matched to a PO line — may be from a different PO.
              </p>
            )}
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              Review quantities below before submitting.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {scanSummary.previewUrl && (
              <a href={scanSummary.previewUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-gray-400 hover:underline">
                View
              </a>
            )}
            <button type="button" onClick={handleReset}
              className="text-[10px] text-gray-400 hover:underline">
              Rescan
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Line row
// ---------------------------------------------------------------------------

function LineRow({
  line,
  fromScan,
  onQtyChange,
  onDamageNoteChange,
}: {
  line: WizardLine
  /** True when this line's qty was set by a packing slip scan */
  fromScan: boolean
  onQtyChange:        (id: string, value: number) => void
  onDamageNoteChange: (id: string, note: string)  => void
}) {
  const remaining = line.quantity_ordered - line.quantity_previously_received
  const [showDamageNote, setShowDamageNote] = useState(false)

  return (
    <div className={`rounded-md border bg-white dark:bg-gray-900 px-4 py-3 space-y-3
      ${fromScan && line.quantity_received === 0
        ? 'border-amber-300 dark:border-amber-700'
        : 'dark:border-gray-700'}`}>
      {/* Title / ISBN */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight truncate">
              {line.title}
            </p>
            {fromScan && line.quantity_received === 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700
                               dark:bg-amber-900/30 dark:text-amber-300 uppercase tracking-wide shrink-0">
                Not on slip
              </span>
            )}
            {fromScan && line.quantity_received > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700
                               dark:bg-blue-900/30 dark:text-blue-300 uppercase tracking-wide shrink-0">
                From scan
              </span>
            )}
          </div>
          {line.isbn && (
            <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
              {line.isbn}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-gray-500 dark:text-gray-400 shrink-0">
          <p>Ordered: <strong>{line.quantity_ordered}</strong></p>
          {line.quantity_previously_received > 0 && (
            <p>Prev. rcvd: <strong>{line.quantity_previously_received}</strong></p>
          )}
          <p>Remaining: <strong className={
            remaining > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-green-600 dark:text-green-400'
          }>{remaining}</strong></p>
        </div>
      </div>

      {/* Received qty */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
            Quantity received
          </label>
          <input
            type="number"
            min={0}
            max={remaining}
            value={line.quantity_received}
            onChange={e => onQtyChange(line.purchase_order_line_id, Math.max(0, parseInt(e.target.value) || 0))}
            className={`w-full px-3 py-1.5 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white
              focus:ring-2 focus:ring-blue-500 outline-none font-mono
              ${fromScan && line.quantity_received === 0
                ? 'border-amber-300 dark:border-amber-600'
                : 'dark:border-gray-600'}`}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowDamageNote(v => !v)}
          className={`px-2.5 py-1.5 rounded border text-xs font-medium transition-colors mb-0.5
            ${showDamageNote || line.notes_damaged
              ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'}`}
        >
          {line.notes_damaged ? 'Damage noted' : '+ Damage note'}
        </button>
      </div>

      {/* Damage note */}
      {(showDamageNote || line.notes_damaged) && (
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-amber-500 dark:text-amber-400 font-bold mb-1">
            Damage note (for records — no Shopify change)
          </label>
          <input
            type="text"
            value={line.notes_damaged ?? ''}
            onChange={e => onDamageNoteChange(line.purchase_order_line_id, e.target.value)}
            placeholder="e.g. 2 copies water damaged, 1 torn spine"
            className="w-full px-3 py-1.5 border border-amber-200 dark:border-amber-800 rounded text-sm bg-amber-50/50 dark:bg-amber-900/10 dark:text-white focus:ring-2 focus:ring-amber-400 outline-none"
          />
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
            Handle with supplier for credit or replacement. No inventory change in Shopify.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export default function ReceivingWizard() {
  const [searchParams] = useSearchParams()
  const poId = searchParams.get('po')

  const { locationName } = useLocations()

  const [phase,    setPhase]    = useState<Phase>('idle')
  const [poDetail, setPoDetail] = useState<PurchaseOrderDetail | null>(null)
  const [lines,    setLines]    = useState<WizardLine[]>([])
  const [completedLines, setCompletedLines] = useState<Array<{
    title: string; isbn: string | null; quantity_ordered: number; quantity_received: number
  }>>([])
  const [locationId, setLocationId] = useState(DEFAULT_LOCATION_ID)
  const [notes,    setNotes]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [result,   setResult]   = useState<ReceiveResult | null>(null)
  // Tracks which line IDs had their quantity set by the most recent scan
  const [scannedLineIds, setScannedLineIds] = useState<Set<string>>(new Set())

  const navigate = useNavigate()

  useEffect(() => {
    if (!poId) return
    setLoading(true)
    fetchPurchaseOrderDetail(poId)
      .then(detail => {
        setPoDetail(detail)
        initLines(detail)
        const dest = (detail.order as any).destination_location_id
        setLocationId(dest || DEFAULT_LOCATION_ID)
        setPhase('review')
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load PO'))
      .finally(() => setLoading(false))
  }, [poId])

  function initLines(detail: PurchaseOrderDetail) {
    const completed = detail.lines.filter(
      l => l.status === 'received' || l.status === 'cancelled'
    )
    const active = detail.lines.filter(
      l => l.status !== 'cancelled' && l.status !== 'received'
    )
    setCompletedLines(completed.map(l => ({
      title: l.title ?? `Item ${l.inventory_item_id.split('/').pop()}`,
      isbn: l.isbn ?? null,
      quantity_ordered: l.quantity_ordered,
      quantity_received: l.quantity_received,
    })))
    setLines(active.map(l => ({
      purchase_order_line_id:       l.id,
      inventory_item_id:            l.inventory_item_id,
      variant_id:                   l.variant_id,
      title:                        l.title ?? `Item ${l.inventory_item_id.split('/').pop()}`,
      isbn:                         l.isbn ?? null,
      quantity_ordered:             l.quantity_ordered,
      quantity_previously_received: l.quantity_received,
      quantity_received:            l.quantity_ordered - l.quantity_received,
      notes_damaged:                null,
    })))
  }

  // Called by WizardSlipScanner with a map of line_id → new quantity_received
  function handleScanUpdate(updates: Record<string, number>) {
    setLines(prev => prev.map(l => {
      if (l.purchase_order_line_id in updates) {
        return { ...l, quantity_received: updates[l.purchase_order_line_id] }
      }
      return l
    }))
    setScannedLineIds(new Set(Object.keys(updates)))
  }

  function handleQtyChange(lineId: string, value: number) {
    setLines(prev => prev.map(l =>
      l.purchase_order_line_id === lineId ? { ...l, quantity_received: value } : l
    ))
  }

  function handleDamageNoteChange(lineId: string, note: string) {
    setLines(prev => prev.map(l =>
      l.purchase_order_line_id === lineId
        ? { ...l, notes_damaged: note.trim() === '' ? null : note }
        : l
    ))
  }

  function validate(): string | null {
    const hasAny = lines.some(l => l.quantity_received > 0)
    if (!hasAny) return 'At least one line must have a received quantity greater than 0.'
    return null
  }

  async function handleConfirm() {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setBusy(true)
    setError(null)
    setPhase('confirming')

    try {
      const activeLines = lines.filter(l => l.quantity_received > 0)

      const allFull = activeLines.every(
        l => l.quantity_received >= (l.quantity_ordered - l.quantity_previously_received)
      )

      const damageNotes = activeLines
        .filter(l => l.notes_damaged)
        .map(l => `${l.title}: ${l.notes_damaged}`)
      const combinedNotes = [
        notes.trim() || null,
        damageNotes.length > 0 ? `Damage noted — ${damageNotes.join('; ')}` : null,
      ].filter(Boolean).join('\n') || undefined

      const res = await receiveOrder({
        purchase_order_id: poDetail!.order.id,
        location_id:       locationId,
        receipt_type:      allFull ? 'full' : 'partial',
        notes:             combinedNotes,
        lines: activeLines.map(l => ({
          purchase_order_line_id: l.purchase_order_line_id,
          inventory_item_id:      l.inventory_item_id,
          quantity_received:      l.quantity_received,
          quantity_damaged:       0,
        })),
      })

      setResult(res)
      setPhase('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Receiving failed')
      setPhase('review')
    } finally {
      setBusy(false)
    }
  }

  function handleReset() {
    navigate('/receiving')
  }

  const order = poDetail?.order as any

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Receive Stock</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Record stock received against a purchase order.
        </p>
      </div>

      {/* ── IDLE ─────────────────────────────────────────────────── */}
      {phase === 'idle' && (
        <div className="space-y-4">
          {loading && (
            <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">Loading PO…</p>
          )}
          {!loading && (
            <div className="rounded-md border dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              Open a purchase order and click <strong>Receive →</strong> from the sidebar,
              or go to <strong>Receiving → New Receipt</strong> to look up a PO by number.
            </div>
          )}
          {error && (
            <div className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── REVIEW ───────────────────────────────────────────────── */}
      {phase === 'review' && poDetail && (
        <div className="space-y-5">
          {/* PO context */}
          <div className="rounded-md border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm space-y-0.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                  {poDetail.order.po_number}
                </span>
                {poDetail.order.is_ad_hoc && (
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase">Ad hoc</span>
                )}
                {order?.is_test && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 uppercase">
                    Test
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {poDetail.lines.length} line{poDetail.lines.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {order?.supplier_name ?? order?.account_label ?? ''}
              {poDetail.order.ordered_at ? ` · Ordered ${formatDate(poDetail.order.ordered_at)}` : ''}
            </p>
            {order?.informal_ref && (
              <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500">
                ref: {order.informal_ref}
              </p>
            )}
          </div>

          {/* Destination location */}
          <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-blue-500 dark:text-blue-400 font-bold mb-0.5">
                Receiving into
              </p>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                {locationName(locationId)}
              </p>
              <p className="font-mono text-[10px] text-blue-400 dark:text-blue-500 mt-0.5">
                {locationId.split('/').pop()}
              </p>
            </div>
            <span className="text-[11px] text-blue-500 dark:text-blue-400">PO destination</span>
          </div>

          {/* Packing slip scanner — above the line rows */}
          {lines.length > 0 && (
            <WizardSlipScanner
              lines={lines}
              onLinesUpdated={handleScanUpdate}
            />
          )}

          {/* Lines */}
          <div className="space-y-3">
            {lines.map(l => (
              <LineRow
                key={l.purchase_order_line_id}
                line={l}
                fromScan={scannedLineIds.has(l.purchase_order_line_id)}
                onQtyChange={handleQtyChange}
                onDamageNoteChange={handleDamageNoteChange}
              />
            ))}

            {/* Completed lines */}
            {completedLines.length > 0 && (
              <div className="border dark:border-gray-700 rounded-md overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                    Already received ({completedLines.length} line{completedLines.length !== 1 ? 's' : ''})
                  </p>
                </div>
                {completedLines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5
                                          border-b dark:border-gray-800 last:border-0 opacity-60">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{l.title}</p>
                      {l.isbn && (
                        <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{l.isbn}</p>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-green-600 dark:text-green-400 shrink-0 ml-3">
                      ✓ {l.quantity_received}/{l.quantity_ordered}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {lines.length === 0 && completedLines.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-600 italic">
                All lines on this order are already received or cancelled.
              </p>
            )}
            {lines.length === 0 && completedLines.length > 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-600 italic">
                All outstanding lines have been received.
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Packing slip reference, price discrepancies, substitutions, backorder notes…"
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          <button
            disabled={lines.length === 0 || busy}
            onClick={handleConfirm}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-md text-sm transition-colors disabled:opacity-50 active:scale-[0.98]"
          >
            {order?.is_test
              ? 'Record test receipt (no Shopify change) →'
              : 'Apply to Shopify Inventory →'}
          </button>
        </div>
      )}

      {/* ── CONFIRMING ───────────────────────────────────────────── */}
      {phase === 'confirming' && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-gray-500 dark:text-gray-400">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent animate-spin" />
          <p className="text-sm">Applying inventory adjustments…</p>
          <p className="text-xs text-gray-400 dark:text-gray-600">Do not close this page.</p>
        </div>
      )}

      {/* ── RESULT ───────────────────────────────────────────────── */}
      {phase === 'result' && result && (
        <div className="space-y-5">
          <div className={`rounded-md border px-4 py-4 ${
            result.status === 'applied'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : result.status === 'test_applied'
              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
              : result.status === 'partial'
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">
                {result.status === 'applied' ? '✓'
                  : result.status === 'test_applied' ? '⚑'
                  : result.status === 'partial' ? '⚠'
                  : '✗'}
              </span>
              <h3 className={`font-semibold ${
                result.status === 'applied'
                  ? 'text-green-800 dark:text-green-200'
                  : result.status === 'test_applied'
                  ? 'text-yellow-800 dark:text-yellow-200'
                  : result.status === 'partial'
                  ? 'text-amber-800 dark:text-amber-200'
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {result.status === 'applied'         ? 'Receipt applied successfully'
                  : result.status === 'test_applied' ? 'Test receipt recorded — Shopify not updated'
                  : result.status === 'partial'      ? 'Partial receipt — some lines failed'
                  :                                    'Receipt failed'}
              </h3>
            </div>
            <div className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
              <p>{result.lines_applied} line{result.lines_applied !== 1 ? 's' : ''} applied</p>
              {result.lines_failed  > 0 && (
                <p className="text-red-700 dark:text-red-300">
                  {result.lines_failed} line{result.lines_failed !== 1 ? 's' : ''} failed
                </p>
              )}
              {result.lines_skipped > 0 && (
                <p className="text-gray-500 dark:text-gray-400">
                  {result.lines_skipped} line{result.lines_skipped !== 1 ? 's' : ''} skipped (zero quantity)
                </p>
              )}
              <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-2">
                Receipt ID: {result.receipt_id}
              </p>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-700 dark:text-red-300 font-mono">{e}</p>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleReset}
            className="w-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium py-2.5 rounded-md text-sm transition-colors"
          >
            Receive another order
          </button>
        </div>
      )}
    </div>
  )
}
