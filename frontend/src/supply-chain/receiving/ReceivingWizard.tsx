// ReceivingWizard.tsx
// Phase-based wizard: idle → review → confirm → confirming → result
//
// Packing slip scan:
//   Sits above line rows in the review phase. Calls parse-and-lookup,
//   matches ISBNs against PO lines, updates quantities. Lines flagged
//   "Not on slip" (amber) or "From scan" (blue) after a scan.
//
// Notes (#11):
//   Notes field pre-seeds from PO informal_ref on load (editable).
//   Receipt notes are also shown in the result phase after submission.
//
// Confirm modal (#12):
//   New 'confirm' phase between 'review' and 'confirming'. Shows a
//   full summary of what will be submitted. Partial receives trigger
//   a prominent alert listing the outstanding lines so staff
//   consciously acknowledge them before committing.
//
// Location:
//   Receive is applied at PO's destination_location_id.
//   DEFAULT_LOCATION_ID (HQ) is a fallback for legacy POs only.
//
// Damage handling:
//   Free-text damage note per line, folded into receipt notes on submit.
//   quantity_damaged always 0 — no Shopify damaged state mutation.

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { WizardLine, ReceiveResult } from './receivingTypes'
import { PurchaseOrderDetail } from '../purchase-orders/purchaseOrderTypes'
import {
  fetchPurchaseOrderDetail,
  receiveOrder,
  parseAndLookup,
} from '../../api/supplyChainApi'
import { useLocations } from '../hooks/useLocations'
import { formatDate } from '../../utils/tableUtils'

type Phase = 'idle' | 'review' | 'confirm' | 'confirming' | 'result'
type ScanState = 'idle' | 'scanning' | 'done' | 'error'

const DEFAULT_LOCATION_ID = 'gid://shopify/Location/40052293765'

// ---------------------------------------------------------------------------
// Packing slip scanner
// ---------------------------------------------------------------------------

function WizardSlipScanner({
  lines,
  onLinesUpdated,
}: {
  lines: WizardLine[]
  onLinesUpdated: (updates: Record<string, number>) => void
}) {
  const [scanState, setScanState]     = useState<ScanState>('idle')
  const [scanSummary, setScanSummary] = useState<{
    matched: number; unmatched: number; notOnSlip: number; previewUrl: string | null
  } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
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

      const slipQtyByIsbn: Record<string, number> = {}
      for (const sl of result.lines) {
        if (sl.isbn && sl.quantity != null)
          slipQtyByIsbn[sl.isbn] = (slipQtyByIsbn[sl.isbn] ?? 0) + sl.quantity
      }

      const updates: Record<string, number> = {}
      let matched = 0, notOnSlip = 0
      for (const wizLine of lines) {
        if (!wizLine.isbn) continue
        const slipQty = slipQtyByIsbn[wizLine.isbn]
        const remaining = wizLine.quantity_ordered - wizLine.quantity_previously_received
        if (slipQty != null) {
          updates[wizLine.purchase_order_line_id] = Math.min(slipQty, remaining)
          matched++
        } else {
          updates[wizLine.purchase_order_line_id] = 0
          notOnSlip++
        }
      }

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

  const handleReset = () => { setScanState('idle'); setScanSummary(null); setScanError(null) }

  if (scanState === 'idle') return (
    <div className="flex items-center justify-between px-4 py-3 rounded-md border border-dashed
                    border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/30">
      <p className="text-xs text-gray-500 dark:text-gray-400">Scan packing slip to auto-fill quantities</p>
      <button type="button" onClick={() => inputRef.current?.click()}
        className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-xs font-semibold
                   text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 transition-colors">
        📷 Scan slip
      </button>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment"
        onChange={handleFileChange} className="hidden" />
    </div>
  )

  if (scanState === 'scanning') return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-md border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
      <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
      <p className="text-xs text-gray-500 dark:text-gray-400 animate-pulse">Reading packing slip and matching lines…</p>
    </div>
  )

  if (scanState === 'error') return (
    <div className="flex items-center justify-between px-4 py-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
      <p className="text-xs text-red-700 dark:text-red-300">{scanError}</p>
      <button type="button" onClick={handleReset} className="text-xs text-red-500 hover:underline shrink-0 ml-3">Try again</button>
    </div>
  )

  if (scanState === 'done' && scanSummary) return (
    <div className={`px-4 py-3 rounded-md border space-y-1
      ${scanSummary.notOnSlip > 0 || scanSummary.unmatched > 0
        ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
        : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className={`text-xs font-semibold ${scanSummary.notOnSlip > 0 || scanSummary.unmatched > 0 ? 'text-amber-800 dark:text-amber-200' : 'text-green-800 dark:text-green-200'}`}>
            {scanSummary.matched === 0 ? 'No lines matched — verify quantities manually'
              : `${scanSummary.matched} line${scanSummary.matched !== 1 ? 's' : ''} matched from packing slip`}
          </p>
          {scanSummary.notOnSlip > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⚠ {scanSummary.notOnSlip} line{scanSummary.notOnSlip !== 1 ? 's' : ''} on this PO not found on slip — set to 0.
            </p>
          )}
          {scanSummary.unmatched > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⚠ {scanSummary.unmatched} ISBN{scanSummary.unmatched !== 1 ? 's' : ''} on slip not matched to a PO line.
            </p>
          )}
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Review quantities below before submitting.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {scanSummary.previewUrl && (
            <a href={scanSummary.previewUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-400 hover:underline">View</a>
          )}
          <button type="button" onClick={handleReset} className="text-[10px] text-gray-400 hover:underline">Rescan</button>
        </div>
      </div>
    </div>
  )

  return null
}

// ---------------------------------------------------------------------------
// Line row
// ---------------------------------------------------------------------------

function LineRow({
  line, fromScan, onQtyChange, onDamageNoteChange,
}: {
  line: WizardLine
  fromScan: boolean
  onQtyChange:        (id: string, value: number) => void
  onDamageNoteChange: (id: string, note: string)  => void
}) {
  const remaining = line.quantity_ordered - line.quantity_previously_received
  const [showDamageNote, setShowDamageNote] = useState(false)

  return (
    <div className={`rounded-md border bg-white dark:bg-gray-900 px-4 py-3 space-y-3
      ${fromScan && line.quantity_received === 0 ? 'border-amber-300 dark:border-amber-700' : 'dark:border-gray-700'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight truncate">{line.title}</p>
            {fromScan && line.quantity_received === 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 uppercase tracking-wide shrink-0">
                Not on slip
              </span>
            )}
            {fromScan && line.quantity_received > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 uppercase tracking-wide shrink-0">
                From scan
              </span>
            )}
          </div>
          {line.isbn && <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">{line.isbn}</p>}
        </div>
        <div className="text-right text-xs text-gray-500 dark:text-gray-400 shrink-0">
          <p>Ordered: <strong>{line.quantity_ordered}</strong></p>
          {line.quantity_previously_received > 0 && (
            <p>Prev. rcvd: <strong>{line.quantity_previously_received}</strong></p>
          )}
          <p>Remaining: <strong className={remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}>{remaining}</strong></p>
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
            Quantity received
          </label>
          <input
            type="number" min={0} max={remaining}
            value={line.quantity_received}
            onChange={e => onQtyChange(line.purchase_order_line_id, Math.max(0, parseInt(e.target.value) || 0))}
            className={`w-full px-3 py-1.5 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white
              focus:ring-2 focus:ring-blue-500 outline-none font-mono
              ${fromScan && line.quantity_received === 0 ? 'border-amber-300 dark:border-amber-600' : 'dark:border-gray-600'}`}
          />
        </div>
        <button type="button" onClick={() => setShowDamageNote(v => !v)}
          className={`px-2.5 py-1.5 rounded border text-xs font-medium transition-colors mb-0.5
            ${showDamageNote || line.notes_damaged
              ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'}`}>
          {line.notes_damaged ? 'Damage noted' : '+ Damage note'}
        </button>
      </div>

      {(showDamageNote || line.notes_damaged) && (
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-amber-500 dark:text-amber-400 font-bold mb-1">
            Damage note (for records — no Shopify change)
          </label>
          <input type="text" value={line.notes_damaged ?? ''}
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
// Confirm summary (#12)
// ---------------------------------------------------------------------------

function ConfirmSummary({
  lines,
  completedLines,
  poDetail,
  locationId,
  notes,
  isTest,
  locationName,
  onBack,
  onConfirm,
  busy,
}: {
  lines: WizardLine[]
  completedLines: Array<{ title: string; isbn: string | null; quantity_ordered: number; quantity_received: number }>
  poDetail: PurchaseOrderDetail
  locationId: string
  notes: string
  isTest: boolean
  locationName: (id: string) => string
  onBack: () => void
  onConfirm: () => void
  busy: boolean
}) {
  const activeLines      = lines.filter(l => l.quantity_received > 0)
  const outstandingLines = lines.filter(l => l.quantity_received === 0)
  const totalUnits       = activeLines.reduce((s, l) => s + l.quantity_received, 0)
  const totalOrdered     = lines.reduce((s, l) => s + (l.quantity_ordered - l.quantity_previously_received), 0)
  const isPartial        = outstandingLines.length > 0 || completedLines.length > 0

  const order = poDetail.order as any

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirm Receipt</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Review before applying inventory changes.
        </p>
      </div>

      {/* Partial alert — shown prominently when some lines will be left at 0 */}
      {isPartial && outstandingLines.length > 0 && (
        <div className="px-4 py-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
            ⚠ Partial receipt — {outstandingLines.length} line{outstandingLines.length !== 1 ? 's' : ''} ({outstandingLines.reduce((s, l) => s + (l.quantity_ordered - l.quantity_previously_received), 0)} units) still outstanding
          </p>
          <div className="space-y-0.5 mt-2">
            {outstandingLines.map(l => (
              <p key={l.purchase_order_line_id} className="text-xs text-amber-700 dark:text-amber-300 truncate">
                · {l.title} — {l.quantity_ordered - l.quantity_previously_received} remaining
              </p>
            ))}
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            These lines will remain open. The PO will stay in "Partial" status until they are received.
          </p>
        </div>
      )}

      {/* PO + location summary */}
      <div className="border dark:border-gray-700 rounded-lg overflow-hidden text-sm">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Receipt summary</p>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">PO</span>
            <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{poDetail.order.po_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Supplier</span>
            <span className="text-gray-900 dark:text-gray-100">{order?.supplier_name ?? order?.account_label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Receiving into</span>
            <span className="text-gray-900 dark:text-gray-100">{locationName(locationId)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Lines to receive</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {activeLines.length} of {lines.length} ({totalUnits} units)
            </span>
          </div>
          {notes.trim() && (
            <div className="flex justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400 shrink-0">Notes</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-right">{notes.trim()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Lines being received */}
      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
          <p className="text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400">
            Receiving ({activeLines.length} lines · {totalUnits} units)
          </p>
        </div>
        <div className="divide-y dark:divide-gray-800 max-h-48 overflow-y-auto">
          {activeLines.map(l => (
            <div key={l.purchase_order_line_id} className="flex items-center justify-between px-4 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-gray-900 dark:text-gray-100 truncate">{l.title}</p>
                {l.isbn && <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{l.isbn}</p>}
              </div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 shrink-0 ml-3 tabular-nums">
                × {l.quantity_received}
              </span>
            </div>
          ))}
        </div>
      </div>

      {isTest && (
        <div className="px-3 py-2.5 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 text-sm text-yellow-800 dark:text-yellow-200">
          ⚑ Test mode — Shopify inventory will NOT be updated.
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} disabled={busy}
          className="px-4 py-2.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
          ← Back
        </button>
        <button onClick={onConfirm} disabled={busy}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-md text-sm transition-colors disabled:opacity-50 active:scale-[0.98]">
          {busy ? 'Applying…' : isTest
            ? `Confirm test receipt (${totalUnits} units) →`
            : `Confirm & apply to Shopify (${totalUnits} units) →`}
        </button>
      </div>
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
        // #11: pre-seed notes from informal_ref so staff don't have to retype
        // the reference at receive time. Editable — staff can append parcel info.
        const ref = (detail.order as any).informal_ref
        if (ref) setNotes(ref)
        setPhase('review')
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load PO'))
      .finally(() => setLoading(false))
  }, [poId])

  function initLines(detail: PurchaseOrderDetail) {
    const completed = detail.lines.filter(l => l.status === 'received' || l.status === 'cancelled')
    const active    = detail.lines.filter(l => l.status !== 'cancelled' && l.status !== 'received')
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

  function handleScanUpdate(updates: Record<string, number>) {
    setLines(prev => prev.map(l =>
      l.purchase_order_line_id in updates
        ? { ...l, quantity_received: updates[l.purchase_order_line_id] }
        : l
    ))
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
    if (!lines.some(l => l.quantity_received > 0))
      return 'At least one line must have a received quantity greater than 0.'
    return null
  }

  // Review → Confirm: validate then advance to the confirm summary step
  function handleReviewNext() {
    const validationError = validate()
    if (validationError) { setError(validationError); return }
    setError(null)
    setPhase('confirm')
  }

  // Confirm → Confirming: fire the API
  async function handleConfirm() {
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

  function handleReset() { navigate('/receiving') }

  const order   = poDetail?.order as any
  const isTest  = !!order?.is_test

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
          {loading && <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">Loading PO…</p>}
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
                <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{poDetail.order.po_number}</span>
                {poDetail.order.is_ad_hoc && (
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase">Ad hoc</span>
                )}
                {isTest && (
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
              <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500">ref: {order.informal_ref}</p>
            )}
          </div>

          {/* Destination location */}
          <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-blue-500 dark:text-blue-400 font-bold mb-0.5">Receiving into</p>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{locationName(locationId)}</p>
              <p className="font-mono text-[10px] text-blue-400 dark:text-blue-500 mt-0.5">{locationId.split('/').pop()}</p>
            </div>
            <span className="text-[11px] text-blue-500 dark:text-blue-400">PO destination</span>
          </div>

          {lines.length > 0 && (
            <WizardSlipScanner lines={lines} onLinesUpdated={handleScanUpdate} />
          )}

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

            {completedLines.length > 0 && (
              <div className="border dark:border-gray-700 rounded-md overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                    Already received ({completedLines.length} line{completedLines.length !== 1 ? 's' : ''})
                  </p>
                </div>
                {completedLines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b dark:border-gray-800 last:border-0 opacity-60">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{l.title}</p>
                      {l.isbn && <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{l.isbn}</p>}
                    </div>
                    <span className="text-xs font-semibold text-green-600 dark:text-green-400 shrink-0 ml-3">
                      ✓ {l.quantity_received}/{l.quantity_ordered}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {lines.length === 0 && completedLines.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-600 italic">All lines on this order are already received or cancelled.</p>
            )}
            {lines.length === 0 && completedLines.length > 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-600 italic">All outstanding lines have been received.</p>
            )}
          </div>

          {/* Notes — pre-seeded from informal_ref (#11) */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
              Notes
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

          {/* Review → Confirm (not the API call yet) */}
          <button
            disabled={lines.length === 0 || busy}
            onClick={handleReviewNext}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-md text-sm transition-colors disabled:opacity-50 active:scale-[0.98]"
          >
            Review & confirm →
          </button>
        </div>
      )}

      {/* ── CONFIRM (#12) ────────────────────────────────────────── */}
      {phase === 'confirm' && poDetail && (
        <ConfirmSummary
          lines={lines}
          completedLines={completedLines}
          poDetail={poDetail}
          locationId={locationId}
          notes={notes}
          isTest={isTest}
          locationName={locationName}
          onBack={() => setPhase('review')}
          onConfirm={handleConfirm}
          busy={busy}
        />
      )}

      {/* ── CONFIRMING ───────────────────────────────────────────── */}
      {phase === 'confirming' && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-gray-500 dark:text-gray-400">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Applying inventory adjustments…</p>
          <p className="text-xs text-gray-400 dark:text-gray-600">Do not close this page.</p>
        </div>
      )}

      {/* ── RESULT ───────────────────────────────────────────────── */}
      {phase === 'result' && result && (
        <div className="space-y-5">
          <div className={`rounded-md border px-4 py-4 ${
            result.status === 'applied'      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : result.status === 'test_applied' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
            : result.status === 'partial'    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            :                                  'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">
                {result.status === 'applied' ? '✓' : result.status === 'test_applied' ? '⚑' : result.status === 'partial' ? '⚠' : '✗'}
              </span>
              <h3 className={`font-semibold ${
                result.status === 'applied'      ? 'text-green-800 dark:text-green-200'
                : result.status === 'test_applied' ? 'text-yellow-800 dark:text-yellow-200'
                : result.status === 'partial'    ? 'text-amber-800 dark:text-amber-200'
                :                                  'text-red-800 dark:text-red-200'
              }`}>
                {result.status === 'applied'         ? 'Receipt applied successfully'
                  : result.status === 'test_applied' ? 'Test receipt recorded — Shopify not updated'
                  : result.status === 'partial'      ? 'Partial receipt — some lines failed'
                  :                                    'Receipt failed'}
              </h3>
            </div>
            <div className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
              <p>{result.lines_applied} line{result.lines_applied !== 1 ? 's' : ''} applied</p>
              {result.lines_failed  > 0 && <p className="text-red-700 dark:text-red-300">{result.lines_failed} line{result.lines_failed !== 1 ? 's' : ''} failed</p>}
              {result.lines_skipped > 0 && <p className="text-gray-500 dark:text-gray-400">{result.lines_skipped} line{result.lines_skipped !== 1 ? 's' : ''} skipped (zero quantity)</p>}
              {/* #11: show receipt notes in result so staff can verify what was recorded */}
              {notes.trim() && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono">
                  Notes: {notes.trim()}
                </p>
              )}
              <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-2">Receipt ID: {result.receipt_id}</p>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.errors.map((e, i) => <p key={i} className="text-xs text-red-700 dark:text-red-300 font-mono">{e}</p>)}
              </div>
            )}
          </div>

          <button onClick={handleReset}
            className="w-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium py-2.5 rounded-md text-sm transition-colors">
            Receive another order
          </button>
        </div>
      )}
    </div>
  )
}
