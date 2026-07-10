// PODocumentImport.tsx
// Document-import wizard for PO creation (#56 follow-on).
//
// Sibling to POCSVImport, but instead of a Stocky CSV the source is a
// photographed / uploaded supplier order form, invoice, or screenshot. Each
// page is read by the vision parser (POST /api/purchase-orders/parse-order-image),
// matched lines are resolved to catalog products server-side, and the KAL-facing
// PO reference is read off the document when present.
//
// Flow:
//   upload   — add one or more document pages; each is parsed and the results merged
//   review   — matched lines (include toggle + editable qty), unmatched shown for
//              awareness only, detected supplier + document PO reference surfaced
//   confirm  — supplier account, destination location, order date, external ref
//              (prefilled from the document PO reference), ad-hoc toggle
//   creating — createPurchaseOrder (status='submitted', ordered_at set) then one
//              createPOLine per included matched line
//   done     — success, open the new PO
//
// The PO is created in submitted status with ordered_at set in a single call, so
// no separate submit round-trip is needed (mirrors POCSVImport). Only matched
// lines become PO lines; unmatched lines are surfaced but never added.

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  parseOrderImage,
  createPurchaseOrder,
  createPOLine,
  type MatchedOrderLine,
  type ParsedOrderLine,
  type Location,
} from '../../api/supplyChainApi'
import { useLocations } from '../hooks/useLocations'
import SupplierAccountPicker, { resolveAccountForLocation } from '../suppliers/SupplierAccountPicker'
import type { SupplierParty, SupplierAccount } from '../suppliers/supplierTypes'

type WizardStep = 'upload' | 'review' | 'confirm' | 'creating' | 'done'
type PageStatus = 'queued' | 'parsing' | 'done' | 'error'
type RefConfidence = 'high' | 'medium' | 'low' | null

interface QueuedPage {
  id:         string
  file:       File
  previewUrl: string
  status:     PageStatus
  matched:    MatchedOrderLine[]
  unmatched:  ParsedOrderLine[]
  error?:     string
}

type ReviewLine = MatchedOrderLine & { _include: boolean }

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Merge matched lines across pages, de-duplicating by inventory_item_id and
// summing quantities (a title split across two pages of an invoice).
function mergeMatched(pages: QueuedPage[]): MatchedOrderLine[] {
  const byItem = new Map<string, MatchedOrderLine>()
  for (const page of pages) {
    for (const line of page.matched) {
      const existing = byItem.get(line.inventory_item_id)
      if (existing) {
        existing.quantity = (existing.quantity ?? 0) + (line.quantity ?? 0)
      } else {
        byItem.set(line.inventory_item_id, { ...line })
      }
    }
  }
  return [...byItem.values()]
}

function mergeUnmatched(pages: QueuedPage[]): ParsedOrderLine[] {
  const out: ParsedOrderLine[] = []
  for (const page of pages) out.push(...page.unmatched)
  return out
}

// ---------------------------------------------------------------------------
// Field primitives (local — matches SupplierAccountPicker's own styling)
// ---------------------------------------------------------------------------

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
    {children}{required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
)

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 ${props.className ?? ''}`}
  />
)

function RefConfidenceBadge({ confidence }: { confidence: RefConfidence }) {
  if (!confidence) return null
  const cls =
    confidence === 'high'   ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    : confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${cls}`}>
      {confidence} confidence
    </span>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onClose:   () => void
  onCreated: (poId: string) => void
}

export default function PODocumentImport({ onClose, onCreated }: Props) {
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => { setTimeout(() => setIsVisible(true), 10) }, [])
  const handleClose = () => { setIsVisible(false); setTimeout(onClose, 300) }

  const [step, setStep]   = useState<WizardStep>('upload')
  const [error, setError] = useState<string | null>(null)

  // Upload / parse
  const [queue, setQueue] = useState<QueuedPage[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Review
  const [reviewLines, setReviewLines]       = useState<ReviewLine[]>([])
  const [unmatchedLines, setUnmatchedLines] = useState<ParsedOrderLine[]>([])
  const [detectedSupplier, setDetectedSupplier] = useState<string | null>(null)
  const [poReference, setPoReference]       = useState<string | null>(null)
  const [poRefConfidence, setPoRefConfidence] = useState<RefConfidence>(null)

  // Confirm
  const { locations } = useLocations()
  const [supplierSelection, setSupplierSelection] = useState<{ party: SupplierParty; accounts: SupplierAccount[] } | null>(null)
  const [locationId,  setLocationId]  = useState('')
  const [orderedAt,   setOrderedAt]   = useState(todayISO())
  const [informalRef, setInformalRef] = useState('')
  const [isAdHoc, setIsAdHoc]         = useState(false)

  // Create
  const [progress, setProgress]       = useState<{ current: number; total: number } | null>(null)
  const [createdPoId, setCreatedPoId] = useState<string | null>(null)

  // Default to HQ (active, non-seasonal) location
  useEffect(() => {
    if (locations.length > 0 && !locationId) {
      const hq = locations.find((l: Location) => l.is_active && !l.is_seasonal) ?? locations[0]
      setLocationId(hq.id)
    }
  }, [locations])

  // ── Upload queue ────────────────────────────────────────────────────────

  const addPage = useCallback((file: File) => {
    const page: QueuedPage = {
      id:         crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status:     'queued',
      matched:    [],
      unmatched:  [],
    }
    setQueue(prev => [...prev, page])
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const removePage = useCallback((id: string) => {
    setQueue(prev => prev.filter(p => p.id !== id))
  }, [])

  const handleReset = () => {
    setQueue([])
    setReviewLines([])
    setUnmatchedLines([])
    setDetectedSupplier(null)
    setPoReference(null)
    setPoRefConfidence(null)
    setError(null)
    setStep('upload')
  }

  const processQueue = useCallback(async () => {
    if (queue.length === 0) return
    setError(null)

    const processed: QueuedPage[] = [...queue]
    let supplierName: string | null = null
    let ref: string | null = null
    let refConf: RefConfidence = null

    for (let i = 0; i < processed.length; i++) {
      processed[i] = { ...processed[i], status: 'parsing' }
      setQueue([...processed])
      try {
        const res = await parseOrderImage(processed[i].file)
        processed[i] = {
          ...processed[i],
          status:    res.stub || (res.matched.length === 0 && res.unmatched.length === 0) ? 'error' : 'done',
          error:     res.stub ? 'No lines could be read — try a clearer image' : undefined,
          matched:   res.matched,
          unmatched: res.unmatched,
        }
        // First page that names each field wins.
        if (!supplierName && res.supplier_name) supplierName = res.supplier_name
        if (!ref && res.po_reference) { ref = res.po_reference; refConf = res.po_reference_confidence }
      } catch (e) {
        processed[i] = {
          ...processed[i],
          status: 'error',
          error:  e instanceof Error ? e.message : 'Parse failed',
        }
      }
      setQueue([...processed])
    }

    const donePages = processed.filter(p => p.status === 'done')
    if (donePages.length === 0) {
      setError('No lines could be read from any page. Try clearer photos or a higher-quality scan.')
      setStep('upload')
      return
    }

    const matched   = mergeMatched(donePages)
    const unmatched = mergeUnmatched(donePages)

    setReviewLines(matched.map(l => ({ ...l, _include: true })))
    setUnmatchedLines(unmatched)
    setDetectedSupplier(supplierName)
    setPoReference(ref)
    setPoRefConfidence(refConf)
    if (ref) setInformalRef(ref)
    setStep('review')
  }, [queue])

  const toggleInclude = (idx: number) => {
    setReviewLines(prev => prev.map((l, i) => i === idx ? { ...l, _include: !l._include } : l))
  }
  const updateQty = (idx: number, qty: number) => {
    setReviewLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, qty) } : l))
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const includedLines = reviewLines.filter(l => l._include)
  const includedCount = includedLines.length
  const parsing       = queue.some(p => p.status === 'parsing')
  const errorCount    = queue.filter(p => p.status === 'error').length

  const effectiveAccount = supplierSelection
    ? resolveAccountForLocation(supplierSelection.accounts, locationId || null)
    : null
  const confirmValid = !!effectiveAccount && !!locationId && !!orderedAt && includedCount > 0

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!effectiveAccount || !locationId || !orderedAt || includedCount === 0) return
    setStep('creating')
    setError(null)
    setProgress({ current: 0, total: includedCount + 1 })

    try {
      const po = await createPurchaseOrder({
        supplier_account_id:     effectiveAccount.id,
        destination_location_id: locationId,
        status:                  'submitted',
        ordered_at:              new Date(orderedAt).toISOString(),
        is_ad_hoc:               isAdHoc,
        ad_hoc_source:           isAdHoc ? 'other' : undefined,
        informal_ref:            informalRef.trim() || undefined,
        notes:                   poReference
          ? `Imported from document · ${poReference}`
          : 'Imported from document',
      })
      setProgress({ current: 1, total: includedCount + 1 })

      let i = 1
      for (const line of includedLines) {
        await createPOLine(po.id, {
          inventory_item_id: line.inventory_item_id,
          variant_id:        line.variant_id,
          quantity_ordered:  line.quantity ?? 1,
          unit_cost:         line.unit_cost != null ? line.unit_cost : undefined,
        })
        i++
        setProgress({ current: i, total: includedCount + 1 })
      }

      setCreatedPoId(po.id)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
      setStep('confirm')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const stepLabels: Record<WizardStep, string> = {
    upload: 'Upload document', review: 'Review lines',
    confirm: 'Confirm', creating: 'Importing…', done: 'Done',
  }
  const stepOrder: WizardStep[] = ['upload', 'review', 'confirm']
  const stepIndex = stepOrder.indexOf(step)

  return (
    <>
      <div className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose} />
      <div className={`fixed inset-0 z-50 flex items-start justify-center pt-6 px-4 pb-6 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="w-full max-w-2xl bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[92vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800 shrink-0">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">Import PO from document</h2>
              <p className="text-xs text-gray-400 mt-0.5">{stepLabels[step]}</p>
            </div>
            <button onClick={handleClose} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">Cancel</button>
          </div>

          {/* Step bar */}
          {stepOrder.includes(step) && (
            <div className="flex items-center gap-2 px-5 py-3 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 shrink-0">
              {(['Upload', 'Review', 'Confirm'] as const).map((label, i) => {
                const done = i < stepIndex; const active = i === stepIndex
                return (
                  <div key={label} className="contents">
                    {i > 0 && <div className={`flex-1 h-px ${done ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        active ? 'bg-blue-600 text-white' : done ? 'bg-blue-200 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                      }`}>{done ? '✓' : i + 1}</div>
                      <span className={`text-xs font-medium hidden sm:block ${active ? 'text-blue-600 dark:text-blue-400' : done ? 'text-blue-400' : 'text-gray-400'}`}>{label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5">

            {/* ── Upload ──────────────────────────────────────────────── */}
            {step === 'upload' && (
              <div className="space-y-4">
                {queue.length === 0 ? (
                  <div className="border-2 border-dashed dark:border-gray-700 rounded-lg p-6 text-center space-y-3">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Upload a supplier order form, invoice, or screenshot
                    </p>
                    <div className="text-left space-y-1 px-2 max-w-md mx-auto">
                      {[
                        'Use your phone\u2019s document scan feature for the best results',
                        'Or upload a screenshot (email, iPage, supplier portal)',
                        'Add every page before reading — quantities merge across pages',
                      ].map((tip, i) => (
                        <p key={i} className="text-xs text-gray-400 dark:text-gray-500">• {tip}</p>
                      ))}
                    </div>
                    <button type="button" onClick={() => inputRef.current?.click()}
                      className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
                      📷 Add page
                    </button>
                  </div>
                ) : (
                  <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {parsing
                          ? `Reading… (${queue.filter(p => p.status === 'done' || p.status === 'error').length} of ${queue.length})`
                          : `${queue.length} page${queue.length !== 1 ? 's' : ''} ready`}
                      </p>
                      {!parsing && (
                        <button type="button" onClick={handleReset}
                          className="text-xs text-gray-400 dark:text-gray-500 hover:underline">Start over</button>
                      )}
                    </div>
                    <div className="px-4 py-4">
                      <div className="flex gap-3 overflow-x-auto pb-1 items-start">
                        {queue.map((page, i) => (
                          <div key={page.id} className="relative flex-shrink-0 w-20">
                            <div className={`relative rounded-md overflow-hidden border-2 ${
                              page.status === 'done'  ? 'border-green-400 dark:border-green-500'
                              : page.status === 'error' ? 'border-red-400 dark:border-red-500'
                              : page.status === 'parsing' ? 'border-blue-400 dark:border-blue-500'
                              : 'border-gray-300 dark:border-gray-600'}`}>
                              <img src={page.previewUrl} alt={`Page ${i + 1}`} className="w-20 h-28 object-cover" />
                              {page.status === 'parsing' && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                </div>
                              )}
                              {page.status === 'done' && (
                                <div className="absolute inset-0 bg-green-500/20 flex items-end justify-end p-1">
                                  <span className="text-[10px] font-bold text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-900/60 px-1 py-0.5 rounded">
                                    {page.matched.length}✓
                                  </span>
                                </div>
                              )}
                              {page.status === 'error' && (
                                <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                                  <span className="text-red-200 text-lg">!</span>
                                </div>
                              )}
                            </div>
                            <p className="text-center text-[10px] text-gray-500 dark:text-gray-400 mt-1">pg {i + 1}</p>
                            {!parsing && (
                              <button type="button" onClick={() => removePage(page.id)}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-600 dark:bg-gray-400 text-white dark:text-gray-900 text-[10px] font-bold leading-none flex items-center justify-center hover:bg-red-600">×</button>
                            )}
                          </div>
                        ))}
                        {!parsing && (
                          <button type="button" onClick={() => inputRef.current?.click()}
                            className="w-20 h-28 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 hover:border-blue-400 shrink-0">
                            <span className="text-2xl text-gray-400">+</span>
                            <span className="text-[10px] text-gray-400 text-center">Add page</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Review ──────────────────────────────────────────────── */}
            {step === 'review' && (
              <div className="space-y-4">
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {reviewLines.length} line{reviewLines.length !== 1 ? 's' : ''} matched to catalog
                          {errorCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {errorCount} page{errorCount !== 1 ? 's' : ''} failed</span>}
                        </p>
                        {detectedSupplier && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Detected supplier: {detectedSupplier}</p>
                        )}
                      </div>
                      <button type="button" onClick={handleReset}
                        className="text-xs text-gray-400 dark:text-gray-500 hover:underline shrink-0">Start over</button>
                    </div>
                    {poReference && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Document PO reference:</span>
                        <span className="text-xs font-mono font-semibold text-gray-800 dark:text-gray-200">{poReference}</span>
                        <RefConfidenceBadge confidence={poRefConfidence} />
                        <span className="text-[11px] text-gray-400">— prefilled as the external reference; edit it in the next step if needed.</span>
                      </div>
                    )}
                  </div>

                  {/* Matched lines — includable + editable qty */}
                  <div className="divide-y dark:divide-gray-800 max-h-72 overflow-y-auto">
                    {reviewLines.map((line, idx) => (
                      <div key={idx} className={`px-4 py-2.5 flex items-center gap-3 ${!line._include ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={line._include} onChange={() => toggleInclude(idx)}
                          className="accent-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{line.title ?? '—'}</p>
                          <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{line.isbn ?? '—'}</p>
                        </div>
                        <input type="number" min={1} value={line.quantity ?? 1}
                          onChange={e => updateQty(idx, parseInt(e.target.value) || 1)}
                          className="w-14 px-2 py-1 border rounded text-sm text-center dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-1 focus:ring-blue-500 outline-none shrink-0" />
                      </div>
                    ))}
                  </div>

                  {/* Unmatched — for awareness, not added */}
                  {unmatchedLines.length > 0 && (
                    <div className="border-t border-amber-200 dark:border-amber-800">
                      <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          {unmatchedLines.length} not in catalog — add manually to the PO if needed
                        </p>
                      </div>
                      <div className="divide-y dark:divide-gray-800 max-h-40 overflow-y-auto">
                        {unmatchedLines.map((line, i) => (
                          <div key={i} className="px-4 py-2 flex items-center justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-300 truncate">{line.title ?? line.isbn ?? '—'}</span>
                            {line.isbn && <span className="text-[11px] font-mono text-gray-400 shrink-0 ml-2">{line.isbn}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Uncheck any you don't want on the PO. {includedCount} of {reviewLines.length} will be added.</p>
              </div>
            )}

            {/* ── Confirm ─────────────────────────────────────────────── */}
            {step === 'confirm' && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Confirm import</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Review the details below, then click Import.</p>
                </div>

                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Import summary</p>
                  </div>
                  <div className="px-4 py-3 space-y-1.5 text-sm">
                    {poReference && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Document PO reference</span>
                        <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{poReference}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Lines to import</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {includedCount} line{includedCount !== 1 ? 's' : ''} · {includedLines.reduce((s, l) => s + (l.quantity ?? 1), 0)} units
                      </span>
                    </div>
                    {detectedSupplier && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Detected supplier</span>
                        <span className="text-gray-700 dark:text-gray-300">{detectedSupplier}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Supplier */}
                <div>
                  <Label required>Supplier</Label>
                  <SupplierAccountPicker
                    value={supplierSelection} effectiveAccount={effectiveAccount}
                    onChange={setSupplierSelection} label="Publisher or distributor"
                    placeholder={detectedSupplier || 'Search publisher name…'} />
                </div>

                {/* Location */}
                <div>
                  <Label required>Receiving location</Label>
                  <select value={locationId} onChange={e => setLocationId(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">— select location —</option>
                    {locations.filter((l: Location) => l.is_active).map((l: Location) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                {/* Order date */}
                <div>
                  <Label required>Order date</Label>
                  <input type="date" value={orderedAt} onChange={e => setOrderedAt(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Defaults to today. Adjust to the date the order was actually placed with the supplier.
                  </p>
                </div>

                {/* External ref */}
                <div>
                  <Label>External reference</Label>
                  <Input value={informalRef} onChange={e => setInformalRef(e.target.value)}
                    placeholder={poReference ?? 'e.g. supplier PO number'} />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Read from the document's PO reference. Used for PO lookup during receiving.
                  </p>
                </div>

                {/* Ad hoc toggle */}
                <div className="flex items-center justify-between rounded-md border dark:border-gray-700 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Ad hoc order</p>
                    <p className="text-[11px] text-gray-400">Mark if this was placed outside the standard ordering workflow</p>
                  </div>
                  <button type="button" onClick={() => setIsAdHoc(!isAdHoc)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAdHoc ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isAdHoc ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            )}

            {/* ── Creating ────────────────────────────────────────────── */}
            {step === 'creating' && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {progress ? 'Creating PO and lines…' : 'Reading document…'}
                </p>
                {progress && (
                  <div className="w-full max-w-sm">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{progress.current} of {progress.total}</span>
                      <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div className="bg-blue-600 h-1.5 rounded-full transition-all"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400">Do not close this window.</p>
              </div>
            )}

            {/* ── Done ────────────────────────────────────────────────── */}
            {step === 'done' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-2xl">✓</div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">PO created successfully</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {includedCount} line{includedCount !== 1 ? 's' : ''} imported from document.
                  </p>
                  {informalRef && <p className="text-xs font-mono text-gray-400 mt-2">ref: {informalRef}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { if (createdPoId) onCreated(createdPoId); handleClose() }}
                    className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
                    Open PO →
                  </button>
                  <button onClick={handleClose}
                    className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    Close
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 px-3 py-2.5 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          {(step === 'upload' || step === 'review' || step === 'confirm') && (
            <div className="px-5 py-4 border-t dark:border-gray-800 flex items-center justify-between shrink-0 bg-gray-50/50 dark:bg-gray-900/30">
              <button
                onClick={() => {
                  if (step === 'confirm') setStep('review')
                  else if (step === 'review') setStep('upload')
                  else handleClose()
                }}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {step === 'upload' ? 'Cancel' : '← Back'}
              </button>

              {step === 'upload' && (
                <button onClick={processQueue} disabled={queue.length === 0 || parsing}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]">
                  Read {queue.length > 1 ? `${queue.length} pages` : 'document'} →
                </button>
              )}
              {step === 'review' && (
                <button onClick={() => setStep('confirm')} disabled={includedCount === 0}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]">
                  Confirm details →
                </button>
              )}
              {step === 'confirm' && (
                <button onClick={handleCreate} disabled={!confirmValid}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]">
                  Import {includedCount} line{includedCount !== 1 ? 's' : ''} →
                </button>
              )}
            </div>
          )}

          <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment"
            onChange={e => { const f = e.target.files?.[0]; if (f) addPage(f) }} className="hidden" />
        </div>
      </div>
    </>
  )
}
