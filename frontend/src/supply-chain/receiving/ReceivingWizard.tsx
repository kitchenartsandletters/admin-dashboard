// ReceivingWizard.tsx
// Phase-based wizard: idle → review → confirming → result
// Follows DamagedBooksWizard phase pattern.
// Can be launched from a PO detail sidebar (with ?po= query param) or standalone.
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { WizardLine, ReceiveResult } from './receivingTypes'
import { PurchaseOrderDetail } from '../purchase-orders/purchaseOrderTypes'
import { fetchPurchaseOrderDetail, receiveOrder } from '../../api/supplyChainApi'
import { formatDate } from '../../utils/tableUtils'

type Phase = 'idle' | 'review' | 'confirming' | 'result'

// Default main store location — staff can override if receiving at satellite
// In a future phase this will be a proper dropdown populated from Shopify locations API
const DEFAULT_LOCATION_ID = 'gid://shopify/Location/1'

function LineRow({
  line,
  onChange,
}: {
  line: WizardLine
  onChange: (id: string, field: 'quantity_received' | 'quantity_damaged', value: number) => void
}) {
  const remaining = line.quantity_ordered - line.quantity_previously_received
  return (
    <div className="rounded-md border dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 space-y-2">
      {/* Title / item */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">
            {line.title || 'Unknown variant'}
          </p>
          <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
            {line.inventory_item_id.split('/').pop()}
          </p>
        </div>
        <div className="text-right text-xs text-gray-500 dark:text-gray-400 shrink-0">
          <p>Ordered: <strong>{line.quantity_ordered}</strong></p>
          <p>Previously rcvd: <strong>{line.quantity_previously_received}</strong></p>
          <p>Remaining: <strong className={remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}>{remaining}</strong></p>
        </div>
      </div>

      {/* Quantity inputs */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
            Received
          </label>
          <input
            type="number"
            min={0}
            max={remaining}
            value={line.quantity_received}
            onChange={e => onChange(line.purchase_order_line_id, 'quantity_received', Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full px-3 py-1.5 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
            Damaged
          </label>
          <input
            type="number"
            min={0}
            max={line.quantity_received}
            value={line.quantity_damaged}
            onChange={e => onChange(line.purchase_order_line_id, 'quantity_damaged', Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full px-3 py-1.5 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
          />
        </div>
      </div>

      {/* Damage warning */}
      {line.quantity_damaged > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          {line.quantity_damaged} cop{line.quantity_damaged === 1 ? 'y' : 'ies'} will be moved to Shopify <strong>damaged</strong> state
        </p>
      )}
      {line.quantity_damaged > line.quantity_received && (
        <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold">
          Damaged cannot exceed received
        </p>
      )}
    </div>
  )
}

export default function ReceivingWizard() {
  const [searchParams] = useSearchParams()
  const poId = searchParams.get('po')

  const [phase, setPhase] = useState<Phase>('idle')
  const [poDetail, setPoDetail] = useState<PurchaseOrderDetail | null>(null)
  const [lines, setLines] = useState<WizardLine[]>([])
  const [receiptType, setReceiptType] = useState<'full' | 'partial'>('full')
  const [locationId, setLocationId] = useState(DEFAULT_LOCATION_ID)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReceiveResult | null>(null)

  // Auto-load PO if query param present
  useEffect(() => {
    if (!poId) return
    setLoading(true)
    fetchPurchaseOrderDetail(poId)
      .then(detail => {
        setPoDetail(detail)
        initLines(detail)
        setPhase('review')
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load PO'))
      .finally(() => setLoading(false))
  }, [poId])

  function initLines(detail: PurchaseOrderDetail) {
    setLines(
      detail.lines
        .filter(l => l.status !== 'cancelled' && l.status !== 'received')
        .map(l => ({
          purchase_order_line_id: l.id,
          inventory_item_id: l.inventory_item_id,
          variant_id: l.variant_id,
          title: `Variant ${l.inventory_item_id.split('/').pop()}`,
          quantity_ordered: l.quantity_ordered,
          quantity_previously_received: l.quantity_received,
          quantity_received: l.quantity_ordered - l.quantity_received, // default to remaining
          quantity_damaged: 0,
        }))
    )
  }

  function handleLineChange(
    lineId: string,
    field: 'quantity_received' | 'quantity_damaged',
    value: number
  ) {
    setLines(prev =>
      prev.map(l =>
        l.purchase_order_line_id === lineId ? { ...l, [field]: value } : l
      )
    )
  }

  function validate(): string | null {
    for (const l of lines) {
      if (l.quantity_damaged > l.quantity_received) {
        return 'Damaged quantity cannot exceed received quantity on any line.'
      }
    }
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
      const res = await receiveOrder({
        purchase_order_id: poDetail!.order.id,
        location_id: locationId,
        receipt_type: receiptType,
        notes: notes.trim() || undefined,
        lines: lines
          .filter(l => l.quantity_received > 0)
          .map(l => ({
            purchase_order_line_id: l.purchase_order_line_id,
            inventory_item_id: l.inventory_item_id,
            quantity_received: l.quantity_received,
            quantity_damaged: l.quantity_damaged,
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
    setPhase('idle')
    setPoDetail(null)
    setLines([])
    setResult(null)
    setError(null)
    setNotes('')
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Receiving</h1>
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
              Open a purchase order and click <strong>Receive Stock →</strong> from the detail sidebar,
              or navigate here directly with a <code className="font-mono text-xs">?po=</code> query parameter.
            </div>
          )}
        </div>
      )}

      {/* ── REVIEW ───────────────────────────────────────────────── */}
      {phase === 'review' && poDetail && (
        <div className="space-y-5">
          {/* PO summary */}
          <div className="rounded-md border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                  {poDetail.order.po_number}
                </span>
                {poDetail.order.is_ad_hoc && (
                  <span className="ml-2 text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase">Ad hoc</span>
                )}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {poDetail.lines.length} line{poDetail.lines.length !== 1 ? 's' : ''}
              </span>
            </div>
            {poDetail.order.ordered_at && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Ordered {formatDate(poDetail.order.ordered_at)}
              </p>
            )}
          </div>

          {/* Receipt type */}
          <div className="flex gap-3">
            {(['full', 'partial'] as const).map(t => (
              <button
                key={t}
                onClick={() => setReceiptType(t)}
                className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors
                  ${receiptType === t
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
              >
                {t === 'full' ? 'Full receipt' : 'Partial receipt'}
              </button>
            ))}
          </div>

          {/* Lines */}
          <div className="space-y-3">
            {lines.map(l => (
              <LineRow key={l.purchase_order_line_id} line={l} onChange={handleLineChange} />
            ))}
            {lines.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-600 italic">
                All lines on this order are already received or cancelled.
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
              placeholder="Price discrepancies, substitutions, backorder notes…"
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          {/* Confirm button */}
          <button
            disabled={lines.length === 0}
            onClick={handleConfirm}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-md text-sm transition-colors disabled:opacity-50 active:scale-[0.98]"
          >
            Apply to Shopify Inventory →
          </button>
        </div>
      )}

      {/* ── CONFIRMING ───────────────────────────────────────────── */}
      {phase === 'confirming' && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-gray-500 dark:text-gray-400">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Applying inventory adjustments…</p>
          <p className="text-xs text-gray-400 dark:text-gray-600">This may take a moment. Do not close this page.</p>
        </div>
      )}

      {/* ── RESULT ───────────────────────────────────────────────── */}
      {phase === 'result' && result && (
        <div className="space-y-5">
          <div className={`rounded-md border px-4 py-4 ${
            result.status === 'applied'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : result.status === 'partial'
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">
                {result.status === 'applied' ? '✓' : result.status === 'partial' ? '⚠' : '✗'}
              </span>
              <h3 className={`font-semibold ${
                result.status === 'applied'
                  ? 'text-green-800 dark:text-green-200'
                  : result.status === 'partial'
                  ? 'text-amber-800 dark:text-amber-200'
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {result.status === 'applied' ? 'Receipt applied successfully'
                  : result.status === 'partial' ? 'Partial receipt — some lines failed'
                  : 'Receipt failed'}
              </h3>
            </div>
            <div className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
              <p>{result.lines_applied} line{result.lines_applied !== 1 ? 's' : ''} applied to Shopify</p>
              {result.lines_failed > 0 && <p className="text-red-700 dark:text-red-300">{result.lines_failed} line{result.lines_failed !== 1 ? 's' : ''} failed</p>}
              {result.lines_skipped > 0 && <p className="text-gray-500 dark:text-gray-400">{result.lines_skipped} line{result.lines_skipped !== 1 ? 's' : ''} skipped (zero quantity)</p>}
              <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-2">Receipt ID: {result.receipt_id}</p>
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
