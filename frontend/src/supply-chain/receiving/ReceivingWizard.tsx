// ReceivingWizard.tsx
// Phase-based wizard: idle → review → confirming → result
// Launched from /receiving/wizard?po={id}
//
// Damage handling:
//   - Staff enter a free-text damage note per line (notes_damaged: string | null)
//   - This note is folded into the receipt-level notes field on submit
//   - quantity_damaged is always sent as 0 — no Shopify damaged state mutation
//   - receipt_type (full/partial) computed automatically from quantities

import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { WizardLine, ReceiveResult } from './receivingTypes'
import { PurchaseOrderDetail } from '../purchase-orders/purchaseOrderTypes'
import { fetchPurchaseOrderDetail, receiveOrder } from '../../api/supplyChainApi'
import { formatDate } from '../../utils/tableUtils'

type Phase = 'idle' | 'review' | 'confirming' | 'result'

const DEFAULT_LOCATION_ID = 'gid://shopify/Location/40052293765'

// ---------------------------------------------------------------------------
// Line row
// ---------------------------------------------------------------------------

function LineRow({
  line,
  onQtyChange,
  onDamageNoteChange,
}: {
  line: WizardLine
  onQtyChange:        (id: string, value: number) => void
  onDamageNoteChange: (id: string, note: string)  => void
}) {
  const remaining = line.quantity_ordered - line.quantity_previously_received
  const [showDamageNote, setShowDamageNote] = useState(false)

  return (
    <div className="rounded-md border dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 space-y-3">
      {/* Title / ISBN */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight truncate">
            {line.title}
          </p>
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
            className="w-full px-3 py-1.5 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
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

      {/* Damage note — shown when toggled or already has content */}
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

  const [phase,    setPhase]    = useState<Phase>('idle')
  const [poDetail, setPoDetail] = useState<PurchaseOrderDetail | null>(null)
  const [lines,    setLines]    = useState<WizardLine[]>([])
  const [locationId]            = useState(DEFAULT_LOCATION_ID)
  const [notes,    setNotes]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [result,   setResult]   = useState<ReceiveResult | null>(null)

  const navigate = useNavigate()

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
          purchase_order_line_id:       l.id,
          inventory_item_id:            l.inventory_item_id,
          variant_id:                   l.variant_id,
          title:                        l.title ?? `Item ${l.inventory_item_id.split('/').pop()}`,
          isbn:                         l.isbn ?? null,
          quantity_ordered:             l.quantity_ordered,
          quantity_previously_received: l.quantity_received,
          quantity_received:            l.quantity_ordered - l.quantity_received,
          notes_damaged:                null,
        }))
    )
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

      // Compute receipt_type automatically
      const allFull = activeLines.every(
        l => l.quantity_received >= (l.quantity_ordered - l.quantity_previously_received)
      )

      // Fold per-line damage notes into receipt notes
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
          quantity_damaged:       0, // no Shopify damaged state mutation
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
          </div>

          {/* Lines */}
          <div className="space-y-3">
            {lines.map(l => (
              <LineRow
                key={l.purchase_order_line_id}
                line={l}
                onQtyChange={handleQtyChange}
                onDamageNoteChange={handleDamageNoteChange}
              />
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
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
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
                {result.status === 'applied'      ? 'Receipt applied successfully'
                  : result.status === 'test_applied' ? 'Test receipt recorded — Shopify not updated'
                  : result.status === 'partial'   ? 'Partial receipt — some lines failed'
                  :                                'Receipt failed'}
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