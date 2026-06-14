// TransferDispatchForm.tsx
// Modal form for dispatching an inventory transfer between locations.
// Primary use case: HQ → FiDi before or during the seasonal opening.
//
// Flow:
//   1. Staff selects source and destination locations
//   2. Staff adds line items (ISBN/title search → qty)
//   3. Review summary showing in-transit warning
//   4. Confirm → POST /api/transfers → transfer enters 'in_transit'
//   5. FiDi staff later receives via TransferReceivePanel
//
// Important: once dispatched, Shopify decrements source immediately.
// Stock appears at neither location until FiDi receives.
// The in-transit warning surfaces this clearly.
//
// Test mode: when enabled, the transfer advances through dispatch/receive
// without creating inventory_events or mutating Shopify (mirrors PO test mode).
// Used to rehearse the flow end-to-end with zero inventory impact.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchLocations, searchVariants, dispatchTransfer,
  Location, VariantSearchResult,
} from '../../api/supplyChainApi'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransferLine {
  _key: string
  inventory_item_id: string
  variant_id: string
  title: string
  isbn: string
  quantity_sent: number
}

type FormStep = 'locations' | 'lines' | 'review' | 'executing' | 'done' | 'error'

// Today as YYYY-MM-DD for seasonal-window comparison (string compare is safe for ISO dates).
const TODAY_STR = new Date().toISOString().slice(0, 10)

// A seasonal location only warrants an "opens …" note if it hasn't opened yet.
// Once active_from is in the past, the location is open and the note is stale.
function upcomingSeasonalNote(loc: Location): string | null {
  if (!loc.is_seasonal) return null
  if (loc.active_from && loc.active_from > TODAY_STR) return `Seasonal · opens ${loc.active_from}`
  return null
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
    {children}{required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
)

const SectionHeader = ({ label, color = 'blue' }: { label: string; color?: string }) => {
  const borders: Record<string, string> = {
    blue: 'border-blue-500', amber: 'border-amber-500', green: 'border-green-500',
  }
  return (
    <h3 className={`text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 border-l-2 ${borders[color] ?? borders.blue} pl-2 mb-3`}>
      {label}
    </h3>
  )
}

// ---------------------------------------------------------------------------
// Line item search
// Results render in normal flow (not absolutely positioned) so they are never
// clipped by the modal's scroll container; the panel scrolls internally.
// ---------------------------------------------------------------------------

function LineSearch({ onAdd }: { onAdd: (line: Omit<TransferLine, '_key' | 'quantity_sent'>) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VariantSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(() => {
      searchVariants(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const handleSelect = (r: VariantSearchResult) => {
    onAdd({
      inventory_item_id: r.inventory_item_id,
      variant_id:        r.variant_id,
      title:             r.title,
      isbn:              r.isbn,
    })
    setQuery('')
    setResults([])
  }

  return (
    <div>
      <Label>Search by title or ISBN</Label>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="On Taste, 9780231221290…"
        className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
      />
      {searching && (
        <p className="text-xs text-gray-400 mt-1 animate-pulse">Searching…</p>
      )}
      {results.length > 0 && (
        <div className="mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow-sm overflow-hidden max-h-64 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.inventory_item_id}
              type="button"
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 last:border-0"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{r.title}</p>
              <p className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-0.5">{r.isbn}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  onClose: () => void
  onDispatched: (transferId: string) => void
  defaultFromLocationId?: string
  defaultToLocationId?: string
}

export default function TransferDispatchForm({
  onClose,
  onDispatched,
  defaultFromLocationId,
  defaultToLocationId,
}: Props) {
  const [locations, setLocations] = useState<Location[]>([])
  const [fromLocationId, setFromLocationId] = useState(defaultFromLocationId ?? '')
  const [toLocationId, setToLocationId] = useState(defaultToLocationId ?? '')
  const [lines, setLines] = useState<TransferLine[]>([])
  const [notes, setNotes] = useState('')
  const [isTest, setIsTest] = useState(false)
  const [step, setStep] = useState<FormStep>('locations')
  const [error, setError] = useState<string | null>(null)
  const [resultId, setResultId] = useState<string | null>(null)

  const [isVisible, setIsVisible] = useState(false)
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setIsVisible(true)))
    fetchLocations()
      .then(locs => {
        setLocations(locs.filter(l => l.is_active))
        // Auto-select if defaults are provided and valid
        if (defaultFromLocationId) setFromLocationId(defaultFromLocationId)
        if (defaultToLocationId) setToLocationId(defaultToLocationId)
      })
      .catch(() => {})
  }, [])

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

  const fromLocation = locations.find(l => l.id === fromLocationId)
  const toLocation   = locations.find(l => l.id === toLocationId)

  const addLine = useCallback((partial: Omit<TransferLine, '_key' | 'quantity_sent'>) => {
    setLines(prev => {
      // If already in list, just bump qty
      const existing = prev.findIndex(l => l.inventory_item_id === partial.inventory_item_id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = { ...next[existing], quantity_sent: next[existing].quantity_sent + 1 }
        return next
      }
      return [...prev, { ...partial, _key: crypto.randomUUID(), quantity_sent: 1 }]
    })
  }, [])

  const updateQty = (key: string, qty: number) => {
    setLines(prev => prev.map(l => l._key === key ? { ...l, quantity_sent: Math.max(1, qty) } : l))
  }

  const removeLine = (key: string) => {
    setLines(prev => prev.filter(l => l._key !== key))
  }

  const totalUnits = lines.reduce((s, l) => s + l.quantity_sent, 0)

  const handleDispatch = async () => {
    setStep('executing')
    setError(null)
    try {
      const result = await dispatchTransfer({
        from_location_id: fromLocationId,
        to_location_id:   toLocationId,
        notes:            notes || undefined,
        is_test:          isTest,
        lines: lines.map(l => ({
          inventory_item_id: l.inventory_item_id,
          variant_id:        l.variant_id,
          quantity_sent:     l.quantity_sent,
        })),
      })
      setResultId(result.transfer_id)
      if (result.lines_failed > 0) {
        setError(
          `${result.lines_failed} line${result.lines_failed !== 1 ? 's' : ''} failed. ` +
          `${result.lines_applied} applied. Check inventory events for details.`
        )
        setStep('error')
      } else {
        setStep('done')
        onDispatched(result.transfer_id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dispatch failed')
      setStep('error')
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={step === 'locations' || step === 'lines' || step === 'review' ? handleClose : undefined}
      />
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="w-full max-w-xl bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800 shrink-0">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Dispatch Transfer
                {isTest && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 font-bold uppercase tracking-wide">
                    Test
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {step === 'locations' ? 'Select source and destination'
                : step === 'lines'    ? `${fromLocation?.name ?? '?'} → ${toLocation?.name ?? '?'}`
                : step === 'review'   ? 'Review before dispatching'
                : step === 'executing' ? 'Dispatching…'
                : step === 'done'     ? 'Transfer dispatched'
                : 'Error — review details below'}
              </p>
            </div>
            {(step === 'locations' || step === 'lines' || step === 'review' || step === 'done' || step === 'error') && (
              <button onClick={handleClose} className="text-sm text-gray-500 hover:underline">
                {step === 'done' ? 'Close' : 'Cancel'}
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

            {/* Step: Locations */}
            {step === 'locations' && (
              <>
                <SectionHeader label="From" color="blue" />
                <div className="space-y-2">
                  {locations.map(loc => {
                    const note = upcomingSeasonalNote(loc)
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setFromLocationId(loc.id)}
                        disabled={loc.id === toLocationId}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition-colors disabled:opacity-40
                          ${fromLocationId === loc.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'}`}
                      >
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{loc.name}</p>
                        {note && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 uppercase tracking-wide font-semibold">
                            {note}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>

                <SectionHeader label="To" color="green" />
                <div className="space-y-2">
                  {locations.map(loc => {
                    const note = upcomingSeasonalNote(loc)
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setToLocationId(loc.id)}
                        disabled={loc.id === fromLocationId}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition-colors disabled:opacity-40
                          ${toLocationId === loc.id
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-green-300'}`}
                      >
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{loc.name}</p>
                        {note && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 uppercase tracking-wide font-semibold">
                            {note}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div>
                  <Label>Notes (optional)</Label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                    placeholder="FiDi opening stock — cookbooks selection"
                    className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>

                {/* Test mode */}
                <div className={`flex items-center justify-between rounded-md border px-3 py-2.5
                  ${isTest
                    ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-600'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                  }`}>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
                      Test mode
                      {isTest && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-200 dark:bg-yellow-800
                                          text-yellow-800 dark:text-yellow-200 font-bold uppercase tracking-wide">
                          Beta
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {isTest
                        ? 'Dispatch + receive will run, but NO inventory changes in Shopify.'
                        : 'Full production mode — dispatch decrements Shopify immediately.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTest(v => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${isTest ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow
                      transition-transform ${isTest ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </>
            )}

            {/* Step: Lines */}
            {step === 'lines' && (
              <>
                {/* In-transit warning (production) / test banner */}
                {isTest ? (
                  <div className="px-3 py-2.5 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 text-xs text-yellow-800 dark:text-yellow-200">
                    <p className="font-semibold mb-0.5">Test mode</p>
                    <p>This transfer will move through dispatch and receive for rehearsal, but <strong>no Shopify inventory will change</strong> at either location.</p>
                  </div>
                ) : (
                  <div className="px-3 py-2.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                    <p className="font-semibold mb-0.5">⚠ In-transit state</p>
                    <p>Once dispatched, Shopify will decrement stock at <strong>{fromLocation?.name}</strong> immediately. Stock will not appear at <strong>{toLocation?.name}</strong> until received. Titles will temporarily show zero at both locations.</p>
                  </div>
                )}

                <LineSearch onAdd={addLine} />

                {lines.length > 0 && (
                  <div className="space-y-1">
                    {lines.map(line => (
                      <div key={line._key} className="flex items-center gap-3 py-2 border-b dark:border-gray-800 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{line.title}</p>
                          <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{line.isbn}</p>
                        </div>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity_sent}
                          onChange={e => updateQty(line._key, parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1 border rounded text-sm text-center dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        />
                        <button
                          type="button"
                          onClick={() => removeLine(line._key)}
                          className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                      {lines.length} line{lines.length !== 1 ? 's' : ''} · {totalUnits} unit{totalUnits !== 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Step: Review */}
            {step === 'review' && (
              <>
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden text-sm">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{fromLocation?.name}</span>
                      <span>→</span>
                      <span className="font-medium">{toLocation?.name}</span>
                    </div>
                    {notes && <p className="text-xs text-gray-400 mt-0.5">{notes}</p>}
                  </div>
                  {lines.map(line => (
                    <div key={line._key} className="flex items-center justify-between px-4 py-2.5 border-b dark:border-gray-800 last:border-0">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{line.title}</p>
                        <p className="text-xs font-mono text-gray-400">{line.isbn}</p>
                      </div>
                      <span className="font-semibold text-gray-700 dark:text-gray-300 shrink-0 ml-4">× {line.quantity_sent}</span>
                    </div>
                  ))}
                  <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 flex justify-between text-xs font-semibold text-gray-600 dark:text-gray-400">
                    <span>{lines.length} lines</span>
                    <span>{totalUnits} units total</span>
                  </div>
                </div>

                {isTest ? (
                  <div className="px-3 py-2.5 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 text-xs text-yellow-800 dark:text-yellow-200">
                    <strong>Test mode</strong> — dispatching will move the transfer to in-transit for rehearsal, but will <strong>not</strong> change Shopify inventory at <strong>{fromLocation?.name}</strong> or <strong>{toLocation?.name}</strong>.
                  </div>
                ) : (
                  <div className="px-3 py-2.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                    Dispatching will immediately decrement <strong>{fromLocation?.name}</strong> in Shopify.
                    Stock is in transit until <strong>{toLocation?.name}</strong> staff confirm receipt.
                  </div>
                )}
              </>
            )}

            {/* Step: Executing */}
            {step === 'executing' && (
              <div className="py-8 flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Dispatching {totalUnits} units…</p>
              </div>
            )}

            {/* Step: Done */}
            {step === 'done' && resultId && (
              <div className="space-y-4">
                <div className="px-4 py-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
                  <p className="font-semibold">Transfer dispatched{isTest ? ' (test)' : ''}</p>
                  <p className="font-mono text-xs mt-1">{resultId}</p>
                  <p className="mt-1 text-xs">
                    {isTest
                      ? <>{totalUnits} unit{totalUnits !== 1 ? 's' : ''} are marked in transit to <strong>{toLocation?.name}</strong>. No Shopify inventory was changed (test mode).</>
                      : <>{totalUnits} unit{totalUnits !== 1 ? 's' : ''} are now in transit to <strong>{toLocation?.name}</strong>. Shopify has decremented <strong>{fromLocation?.name}</strong>.</>}
                  </p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Share the transfer ID with {toLocation?.name} staff so they can confirm receipt when the stock arrives.
                </p>
              </div>
            )}

            {/* Step: Error */}
            {step === 'error' && (
              <div className="space-y-3">
                <div className="px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                  <p className="font-semibold">Dispatch failed</p>
                  <p className="mt-1 text-xs">{error}</p>
                  {resultId && <p className="font-mono text-xs mt-1">Transfer ID: {resultId}</p>}
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t dark:border-gray-800 flex gap-3 shrink-0">
            {step === 'locations' && (
              <>
                <button onClick={handleClose}
                  className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                  Cancel
                </button>
                <button
                  onClick={() => setStep('lines')}
                  disabled={!fromLocationId || !toLocationId || fromLocationId === toLocationId}
                  className="flex-1 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  Next: Add items →
                </button>
              </>
            )}

            {step === 'lines' && (
              <>
                <button onClick={() => setStep('locations')}
                  className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                  ← Back
                </button>
                <button
                  onClick={() => setStep('review')}
                  disabled={lines.length === 0}
                  className="flex-1 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  Review ({totalUnits} unit{totalUnits !== 1 ? 's' : ''}) →
                </button>
              </>
            )}

            {step === 'review' && (
              <>
                <button onClick={() => setStep('lines')}
                  className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                  ← Back
                </button>
                <button
                  onClick={handleDispatch}
                  className={`flex-1 px-4 py-2 rounded-md text-white text-sm font-semibold transition-colors
                    ${isTest ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-amber-600 hover:bg-amber-700'}`}
                >
                  {isTest ? 'Dispatch TEST transfer' : 'Dispatch transfer'}
                </button>
              </>
            )}

            {(step === 'done' || step === 'error') && (
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
