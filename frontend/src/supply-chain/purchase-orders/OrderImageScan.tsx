// OrderImageScan.tsx
// Image-scan path for the PO builder (#56).
//
// Lets staff photograph or upload a supplier order form, invoice, or a
// screenshot (email / Stocky) and have Claude vision extract the lines,
// resolve them to catalog products, and drop the matched ones into the
// builder's line list — ready to review and edit at Step 2.
//
// Mirrors the receiving multi-page scan queue (PackingSlipUpload): staff add
// pages one at a time, each is parsed via POST /api/purchase-orders/parse-order-image,
// and the results are merged. Matched lines (ISBN resolved to a catalog
// product) are handed up via onLinesAccepted; unmatched lines are surfaced for
// awareness but not added, exactly like the receiving unmatched bucket.
//
// Supplier handling (option 1 — warn, don't navigate):
//   The supplier is already chosen at Step 1. If the scan detects a different
//   supplier than the one selected, we show a non-blocking warning so staff can
//   decide whether to go back and change it. We never switch it automatically.

import { useCallback, useRef, useState } from 'react'
import {
  parseOrderImage,
  type MatchedOrderLine,
  type ParsedOrderLine,
} from '../../api/supplyChainApi'

// The shape POBuilder.addLine expects (minus the fields it fills in itself).
export interface ScannedLine {
  inventory_item_id: string
  variant_id: string
  title: string
  isbn: string
  quantity_ordered: number
  unit_cost: string
}

type PageStatus = 'queued' | 'parsing' | 'done' | 'error'

interface QueuedPage {
  id:         string
  file:       File
  previewUrl: string
  status:     PageStatus
  matched:    MatchedOrderLine[]
  unmatched:  ParsedOrderLine[]
  error?:     string
}

type ScanState = 'idle' | 'queue' | 'parsing' | 'review'

interface Props {
  // Supplier currently selected at Step 1, for mismatch detection.
  selectedSupplierName: string | null
  // Called when staff accept the matched lines — pushed into the builder.
  onLinesAccepted: (lines: ScannedLine[]) => void
  // ISBNs already on the PO, so we can flag duplicates in the review list.
  existingIsbns: Set<string>
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

export default function OrderImageScan({ selectedSupplierName, onLinesAccepted, existingIsbns }: Props) {
  const [state, setState]   = useState<ScanState>('idle')
  const [queue, setQueue]   = useState<QueuedPage[]>([])
  const [error, setError]   = useState<string | null>(null)
  const [detectedSupplier, setDetectedSupplier] = useState<string | null>(null)
  // Editable review rows for matched lines
  const [reviewLines, setReviewLines] = useState<(MatchedOrderLine & { _include: boolean })[]>([])
  const [unmatchedLines, setUnmatchedLines] = useState<ParsedOrderLine[]>([])

  const inputRef = useRef<HTMLInputElement>(null)

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
    setState('queue')
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const removePage = useCallback((id: string) => {
    setQueue(prev => {
      const next = prev.filter(p => p.id !== id)
      if (next.length === 0) setState('idle')
      return next
    })
  }, [])

  const processQueue = useCallback(async () => {
    if (queue.length === 0) return
    setState('parsing')
    setError(null)

    const processed: QueuedPage[] = [...queue]
    let supplierName: string | null = null

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
        // First page that names a supplier wins for the mismatch check.
        if (!supplierName && res.supplier_name) supplierName = res.supplier_name
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
      setError('No lines could be read from any image. Try clearer photos, or use the document scanner.')
      setState('queue')
      return
    }

    const matched   = mergeMatched(donePages)
    const unmatched = mergeUnmatched(donePages)

    setReviewLines(matched.map(l => ({ ...l, _include: true })))
    setUnmatchedLines(unmatched)
    setDetectedSupplier(supplierName)
    setState('review')
  }, [queue])

  const toggleInclude = (idx: number) => {
    setReviewLines(prev => prev.map((l, i) => i === idx ? { ...l, _include: !l._include } : l))
  }
  const updateQty = (idx: number, qty: number) => {
    setReviewLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, qty) } : l))
  }

  const handleAccept = () => {
    const accepted: ScannedLine[] = reviewLines
      .filter(l => l._include)
      .map(l => ({
        inventory_item_id: l.inventory_item_id,
        variant_id:        l.variant_id,
        title:             l.title ?? '',
        isbn:              l.isbn ?? '',
        quantity_ordered:  l.quantity ?? 1,
        unit_cost:         l.unit_cost != null ? String(l.unit_cost) : '',
      }))
    onLinesAccepted(accepted)
    handleReset()
  }

  const handleReset = () => {
    setState('idle')
    setQueue([])
    setError(null)
    setDetectedSupplier(null)
    setReviewLines([])
    setUnmatchedLines([])
  }

  const doneCount  = queue.filter(p => p.status === 'done').length
  const errorCount = queue.filter(p => p.status === 'error').length

  // Supplier mismatch (option 1 — warn only)
  const supplierMismatch =
    !!detectedSupplier && !!selectedSupplierName &&
    !detectedSupplier.toLowerCase().includes(selectedSupplierName.toLowerCase()) &&
    !selectedSupplierName.toLowerCase().includes(detectedSupplier.toLowerCase())

  const includedCount = reviewLines.filter(l => l._include).length

  // ── Idle ──────────────────────────────────────────────────────────────
  if (state === 'idle') return (
    <div className="border-2 border-dashed dark:border-gray-700 rounded-lg p-4 text-center space-y-3">
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
        Scan an order form, invoice, or screenshot to add lines
      </p>
      <div className="text-left space-y-1 px-2">
        {[
          '📄  Use your phone\u2019s document scan feature for the best results',
          '🖼️  Or upload a screenshot (email, Stocky, supplier portal)',
          '📐  For photos: flat, portrait, all four edges in frame',
        ].map((tip, i) => (
          <p key={i} className="text-xs text-gray-400 dark:text-gray-500">{tip}</p>
        ))}
      </div>
      <button type="button" onClick={() => inputRef.current?.click()}
        className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
        📷 Add image
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment"
        onChange={e => { const f = e.target.files?.[0]; if (f) addPage(f) }} className="hidden" />
    </div>
  )

  // ── Queue / parsing ───────────────────────────────────────────────────
  if (state === 'queue' || state === 'parsing') {
    const isParsing = state === 'parsing'
    return (
      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {isParsing
              ? `Reading… (${doneCount + errorCount} of ${queue.length})`
              : `${queue.length} image${queue.length !== 1 ? 's' : ''} ready`}
          </p>
          {!isParsing && (
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
                  <img src={page.previewUrl} alt={`Image ${i + 1}`} className="w-20 h-28 object-cover" />
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
                <p className="text-center text-[10px] text-gray-500 dark:text-gray-400 mt-1">img {i + 1}</p>
                {!isParsing && (
                  <button type="button" onClick={() => removePage(page.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-600 dark:bg-gray-400 text-white dark:text-gray-900 text-[10px] font-bold leading-none flex items-center justify-center hover:bg-red-600">×</button>
                )}
              </div>
            ))}
            {!isParsing && (
              <button type="button" onClick={() => inputRef.current?.click()}
                className="w-20 h-28 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 hover:border-blue-400 shrink-0">
                <span className="text-2xl text-gray-400">+</span>
                <span className="text-[10px] text-gray-400 text-center">Add image</span>
              </button>
            )}
          </div>
        </div>
        {!isParsing && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">Add all pages before reading.</p>
            <button type="button" onClick={processQueue} disabled={queue.length === 0}
              className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
              Read {queue.length > 1 ? `${queue.length} images` : 'image'} →
            </button>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment"
          onChange={e => { const f = e.target.files?.[0]; if (f) addPage(f) }} className="hidden" />
      </div>
    )
  }

  // ── Review ────────────────────────────────────────────────────────────
  return (
    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {reviewLines.length} line{reviewLines.length !== 1 ? 's' : ''} matched to catalog
              {errorCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {errorCount} image{errorCount !== 1 ? 's' : ''} failed</span>}
            </p>
            {detectedSupplier && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Detected supplier: {detectedSupplier}</p>
            )}
          </div>
          <button type="button" onClick={handleReset}
            className="text-xs text-gray-400 dark:text-gray-500 hover:underline shrink-0">Rescan</button>
        </div>

        {supplierMismatch && (
          <div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
            ⚠ This looks like a <strong>{detectedSupplier}</strong> order, but you selected <strong>{selectedSupplierName}</strong> at Step 1. Go back to change the supplier if needed — the lines will still be added to the current PO.
          </div>
        )}
      </div>

      {/* Matched lines — editable, includable */}
      <div className="divide-y dark:divide-gray-800 max-h-72 overflow-y-auto">
        {reviewLines.map((line, idx) => {
          const dup = line.isbn ? existingIsbns.has(line.isbn) : false
          return (
            <div key={idx} className={`px-4 py-2.5 flex items-center gap-3 ${!line._include ? 'opacity-40' : ''}`}>
              <input type="checkbox" checked={line._include} onChange={() => toggleInclude(idx)}
                className="accent-blue-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                  {line.title}
                  {dup && <span className="text-[10px] text-amber-500 ml-1">(already on PO)</span>}
                </p>
                <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{line.isbn}</p>
              </div>
              <input type="number" min={1} value={line.quantity ?? 1}
                onChange={e => updateQty(idx, parseInt(e.target.value) || 1)}
                className="w-14 px-2 py-1 border rounded text-sm text-center dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-1 focus:ring-blue-500 outline-none shrink-0" />
            </div>
          )
        })}
      </div>

      {/* Unmatched — shown for awareness, not added */}
      {unmatchedLines.length > 0 && (
        <div className="border-t border-amber-200 dark:border-amber-800">
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              {unmatchedLines.length} not in catalog — add manually if needed
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

      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">{includedCount} of {reviewLines.length} will be added</p>
        <button type="button" onClick={handleAccept} disabled={includedCount === 0}
          className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
          Add {includedCount} line{includedCount !== 1 ? 's' : ''} →
        </button>
      </div>
    </div>
  )
}
