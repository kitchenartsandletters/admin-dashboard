// TransferReceivePanel.tsx
// Panel for FiDi staff to confirm receipt of an in-transit transfer.
//
// Entry points:
//   1. Staff at FiDi navigate to /transfers, find their in_transit transfer,
//      click "Receive"
//   2. Staff can also open directly via /transfers?receive={transferId}
//
// Flow:
//   1. Load transfer detail — shows what was sent and from where
//   2. Staff confirms quantities received per line (may differ from sent)
//   3. Staff flags any damaged copies per line
//   4. Confirm → POST /api/transfers/{id}/receive
//   5. Shopify increments destination location, transfer → received/partial

import { useState, useEffect } from 'react'
import {
  fetchTransferDetail, receiveTransfer,
  TransferDetail,
} from '../../api/supplyChainApi'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReceiveLine {
  transfer_line_id: string
  inventory_item_id: string
  title: string
  isbn: string
  quantity_sent: number
  quantity_received: number
  quantity_damaged: number
}

type PanelStep = 'loading' | 'form' | 'review' | 'executing' | 'done' | 'error'

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
    {children}
  </label>
)

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface Props {
  transferId: string
  onClose: () => void
  onReceived: (transferId: string) => void
}

export default function TransferReceivePanel({ transferId, onClose, onReceived }: Props) {
  const [panelStep, setPanelStep] = useState<PanelStep>('loading')
  const [detail, setDetail] = useState<TransferDetail | null>(null)
  const [lines, setLines] = useState<ReceiveLine[]>([])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ applied: number; failed: number } | null>(null)

  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setIsVisible(true)))
    fetchTransferDetail(transferId)
      .then(d => {
        setDetail(d)
        // Pre-populate receive lines from transfer lines
        // quantity_received defaults to quantity_sent (assume full receipt)
        setLines(
          d.lines.map(tl => ({
            transfer_line_id:  tl.id,
            inventory_item_id: tl.inventory_item_id,
            title:             (tl as any).title ?? tl.inventory_item_id.split('/').pop() ?? '',
            isbn:              (tl as any).isbn ?? '',
            quantity_sent:     tl.quantity_sent,
            quantity_received: tl.quantity_sent, // default: all received
            quantity_damaged:  0,
          }))
        )
        setPanelStep('form')
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Failed to load transfer')
        setPanelStep('error')
      })
  }, [transferId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 300)
  }

  const updateLine = (lineId: string, patch: Partial<ReceiveLine>) => {
    setLines(prev => prev.map(l => l.transfer_line_id === lineId ? { ...l, ...patch } : l))
  }

  const handleReceive = async () => {
    setPanelStep('executing')
    setError(null)
    try {
      const res = await receiveTransfer(transferId, {
        lines: lines.map(l => ({
          transfer_line_id:  l.transfer_line_id,
          inventory_item_id: l.inventory_item_id,
          quantity_received: l.quantity_received,
          quantity_damaged:  l.quantity_damaged,
        })),
        notes: notes || undefined,
      })
      setResult({ applied: res.lines_applied, failed: res.lines_failed })
      if (res.lines_failed > 0) {
        setError(`${res.lines_failed} line${res.lines_failed !== 1 ? 's' : ''} failed. Check inventory events.`)
        setPanelStep('error')
      } else {
        setPanelStep('done')
        onReceived(transferId)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Receive failed')
      setPanelStep('error')
    }
  }

  const totalReceived = lines.reduce((s, l) => s + l.quantity_received, 0)
  const totalSent     = lines.reduce((s, l) => s + l.quantity_sent, 0)
  const totalDamaged  = lines.reduce((s, l) => s + l.quantity_damaged, 0)
  const isShort       = totalReceived < totalSent

  const fromName = detail?.transfer.from_location_id.includes('40052293765')
    ? 'Kitchen Arts & Letters (HQ)'
    : detail?.transfer.from_location_id ?? '—'

  const toName = detail?.transfer.to_location_id.includes('67668738181')
    ? 'New York Food Stories by KAL (FiDi)'
    : detail?.transfer.to_location_id ?? '—'

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={panelStep === 'form' || panelStep === 'done' || panelStep === 'error' ? handleClose : undefined}
      />
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="w-full max-w-xl bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800 shrink-0">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Receive Transfer</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {panelStep === 'loading'   ? 'Loading transfer…'
                : panelStep === 'form'    ? `${fromName} → ${toName}`
                : panelStep === 'review'  ? 'Confirm receipt quantities'
                : panelStep === 'executing' ? 'Recording receipt…'
                : panelStep === 'done'    ? 'Transfer received'
                : 'Error — see details below'}
              </p>
            </div>
            {panelStep !== 'executing' && (
              <button onClick={handleClose} className="text-sm text-gray-500 hover:underline">
                {panelStep === 'done' ? 'Close' : 'Cancel'}
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

            {panelStep === 'loading' && (
              <div className="py-8 flex justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              </div>
            )}

            {(panelStep === 'form' || panelStep === 'review') && detail && (
              <>
                {/* Transfer summary */}
                <div className="px-3 py-2.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
                  <p>
                    <strong>{totalSent}</strong> unit{totalSent !== 1 ? 's' : ''} dispatched from{' '}
                    <strong>{fromName}</strong>
                  </p>
                  <p className="font-mono mt-0.5 text-blue-500 dark:text-blue-400">{transferId}</p>
                  {detail.transfer.notes && (
                    <p className="mt-0.5 text-blue-500 dark:text-blue-400 italic">{detail.transfer.notes}</p>
                  )}
                </div>

                {/* Short shipment warning */}
                {panelStep === 'review' && isShort && (
                  <div className="px-3 py-2.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                    ⚠ Short shipment: {totalReceived} received vs {totalSent} sent.
                    The transfer will be marked <strong>partial</strong>. Remaining units stay in-transit.
                  </div>
                )}

                {/* Lines */}
                <div className="space-y-3">
                  {lines.map(line => (
                    <div key={line.transfer_line_id} className="border dark:border-gray-700 rounded-lg p-3 space-y-2">
                      <div>
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{line.title}</p>
                        {line.isbn && <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{line.isbn}</p>}
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label>Sent</Label>
                          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded border dark:border-gray-700">
                            {line.quantity_sent}
                          </p>
                        </div>
                        <div>
                          <Label>Received</Label>
                          {panelStep === 'form' ? (
                            <input
                              type="number"
                              min={0}
                              max={line.quantity_sent}
                              value={line.quantity_received}
                              onChange={e => updateLine(line.transfer_line_id, {
                                quantity_received: Math.min(
                                  line.quantity_sent,
                                  Math.max(0, parseInt(e.target.value) || 0)
                                )
                              })}
                              className={`w-full px-3 py-1.5 border rounded text-sm text-center dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none
                                ${line.quantity_received < line.quantity_sent
                                  ? 'border-amber-400 dark:border-amber-600'
                                  : 'dark:border-gray-600'}`}
                            />
                          ) : (
                            <p className={`text-sm font-semibold px-3 py-1.5 rounded border
                              ${line.quantity_received < line.quantity_sent
                                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                                : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'}`}>
                              {line.quantity_received}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label>Damaged</Label>
                          {panelStep === 'form' ? (
                            <input
                              type="number"
                              min={0}
                              max={line.quantity_received}
                              value={line.quantity_damaged}
                              onChange={e => updateLine(line.transfer_line_id, {
                                quantity_damaged: Math.min(
                                  line.quantity_received,
                                  Math.max(0, parseInt(e.target.value) || 0)
                                )
                              })}
                              className="w-full px-3 py-1.5 border rounded text-sm text-center dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          ) : (
                            <p className={`text-sm font-semibold px-3 py-1.5 rounded border
                              ${line.quantity_damaged > 0
                                ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}>
                              {line.quantity_damaged}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {panelStep === 'form' && (
                  <div>
                    <Label>Notes (optional)</Label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={2}
                      placeholder="e.g. 2 copies of X arrived water damaged"
                      className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    />
                  </div>
                )}

                {/* Review summary */}
                {panelStep === 'review' && (
                  <div className="border dark:border-gray-700 rounded-lg overflow-hidden text-sm">
                    {[
                      ['Units received', totalReceived],
                      ['Units damaged', totalDamaged],
                      ['Units in transit still', totalSent - totalReceived],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex justify-between px-4 py-2 border-b dark:border-gray-800 last:border-0">
                        <span className="text-gray-500 dark:text-gray-400">{label}</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {panelStep === 'executing' && (
              <div className="py-8 flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Recording receipt in Shopify…</p>
              </div>
            )}

            {panelStep === 'done' && (
              <div className="px-4 py-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300 space-y-1">
                <p className="font-semibold">Transfer received</p>
                <p>{result?.applied} line{result?.applied !== 1 ? 's' : ''} applied — Shopify has incremented <strong>{toName}</strong>.</p>
                {totalDamaged > 0 && (
                  <p className="text-amber-700 dark:text-amber-300">
                    {totalDamaged} damaged unit{totalDamaged !== 1 ? 's' : ''} recorded — adjust inventory manually if needed.
                  </p>
                )}
              </div>
            )}

            {panelStep === 'error' && (
              <div className="px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                <p className="font-semibold">Error</p>
                <p className="mt-1 text-xs">{error}</p>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t dark:border-gray-800 flex gap-3 shrink-0">
            {panelStep === 'form' && (
              <>
                <button onClick={handleClose}
                  className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                  Cancel
                </button>
                <button
                  onClick={() => setPanelStep('review')}
                  disabled={lines.every(l => l.quantity_received === 0)}
                  className="flex-1 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  Review ({totalReceived} unit{totalReceived !== 1 ? 's' : ''}) →
                </button>
              </>
            )}

            {panelStep === 'review' && (
              <>
                <button onClick={() => setPanelStep('form')}
                  className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                  ← Back
                </button>
                <button
                  onClick={handleReceive}
                  className="flex-1 px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
                >
                  Confirm receipt
                </button>
              </>
            )}

            {(panelStep === 'done' || panelStep === 'error') && (
              <button onClick={handleClose}
                className="flex-1 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
