// PackingSlipUpload.tsx
// Packing slip / invoice scanner component.
//
// Used in two contexts:
//   1. ReceivingEntryFlow — po_lookup step (top of page, before PO number entry)
//      Here onPOCandidatesFound drives navigation: high-confidence match → wizard,
//      multiple matches → fuzzy confirm, no match → ISBN-based match → ad hoc.
//   2. ReceivingEntryFlow — lines step (ad hoc path, before manual ISBN entry)
//      Here only onLinesAccepted is used; PO candidates are irrelevant.
//
// Multi-page scan (#39 Part 1):
//   Staff can add one page at a time to a photo queue. Each page is shown as a
//   thumbnail with per-page extraction status. When all pages are queued, staff
//   tap "Process slip" to run parse-and-lookup on each page sequentially, then
//   merge the extracted line lists:
//     - Lines with matching ISBNs are de-duplicated (first occurrence wins for
//       title/unit_cost; quantities are summed across pages).
//     - Lines without ISBNs are included as-is and shown with needs_review: true.
//   After merging, the existing two-stage PO matching runs on the merged set.
//
//   This handles RDH packing slips which are routinely 2 pages and previously
//   required the user to crop/split the image manually.
//
// Two-stage PO matching (#35):
//   Stage 1 (existing): parse-and-lookup returns po_candidates when the slip
//     contains a readable PO reference at high confidence.
//   Stage 2 (new): if Stage 1 finds no candidates, run POST /api/receiving/match-slip
//     with the extracted ISBNs. This finds POs even when the slip has no KAL PO
//     number — typical for publisher packing slips (RDH, Ingram, etc.).
//
// Photo guidance (#39 Part 4):
//   The idle state and page queue both display clear guidance:
//   - One page per photo
//   - Lay the slip flat, phone directly above in portrait orientation
//   - Ensure all four edges are in frame
//   - For multi-page slips, add each page separately

import { useState, useRef, useCallback } from 'react'
import { parseAndLookup, matchSlipToPO, POCandidate, ParsedSlipLine, SlipMatchCandidate } from '../../api/supplyChainApi'

export type { ParsedSlipLine }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageStatus = 'queued' | 'extracting' | 'done' | 'error'

interface QueuedPage {
  id:         string
  file:       File
  previewUrl: string
  status:     PageStatus
  lines:      ParsedSlipLine[]
  error?:     string
  // Raw parse result metadata — used to surface PO candidates from any page
  po_reference?:           string | null
  po_reference_confidence?: 'high' | 'medium' | 'low' | null
  po_candidates:           POCandidate[]
}

interface ParseResult {
  lines:                    ParsedSlipLine[]
  stub:                     boolean
  invoice_number?:          string | null
  supplier_name?:           string | null
  po_reference?:            string | null
  po_reference_confidence?: 'high' | 'medium' | 'low' | null
  po_candidates:            POCandidate[]
}

type ComponentState =
  | 'idle'          // nothing queued yet
  | 'queue'         // pages added, not yet processed
  | 'processing'    // running parse-and-lookup per page
  | 'matching'      // running ISBN match against open POs
  | 'reviewing'     // showing merged line list for staff review
  | 'done'          // lines accepted

interface Props {
  onLinesAccepted:      (lines: ParsedSlipLine[]) => void
  onPOCandidatesFound?: (candidates: POCandidate[], poReference: string) => void
  onISBNMatchFound?:    (candidates: SlipMatchCandidate[], strongMatch: string | null, slipLines: ParsedSlipLine[]) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.90) return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-bold">✓ High</span>
  if (confidence >= 0.80) return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold">✓ Good</span>
  return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-bold">⚠ Review</span>
}

function POCandidateCard({ candidate, onSelect }: { candidate: POCandidate; onSelect: (c: POCandidate) => void }) {
  return (
    <button type="button" onClick={() => onSelect(candidate)}
      className="w-full text-left px-3 py-2.5 rounded-md border border-blue-300 dark:border-blue-700
                 bg-blue-50 dark:bg-blue-900/20 hover:border-blue-500 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-blue-900 dark:text-blue-100">{candidate.po_number}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
          candidate.status === 'partial'
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
        }`}>{candidate.status}</span>
      </div>
      <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
        {candidate.supplier_name ?? candidate.account_label}
        {candidate.informal_ref && <span className="text-blue-400 ml-1">· {candidate.informal_ref}</span>}
      </p>
      <p className="text-[11px] text-blue-500 dark:text-blue-400 mt-1">Tap to open receiving wizard →</p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Merge line lists from multiple pages
//
// De-duplicates by ISBN — first occurrence wins for title and unit_cost.
// Quantities are summed when the same ISBN appears on multiple pages (e.g.
// an ISBN printed on both a cover sheet and a detail page).
// Lines without an ISBN are appended as-is with needs_review forced true.
// ---------------------------------------------------------------------------

function mergePageLines(pages: QueuedPage[]): ParsedSlipLine[] {
  const byIsbn = new Map<string, ParsedSlipLine>()
  const noIsbn: ParsedSlipLine[] = []

  for (const page of pages) {
    for (const line of page.lines) {
      const isbn = line.isbn?.trim()
      if (!isbn) {
        noIsbn.push({ ...line, needs_review: true })
        continue
      }
      if (byIsbn.has(isbn)) {
        // Accumulate quantity across pages; keep existing title/cost
        const existing = byIsbn.get(isbn)!
        byIsbn.set(isbn, {
          ...existing,
          quantity: (existing.quantity ?? 0) + (line.quantity ?? 0),
        })
      } else {
        byIsbn.set(isbn, { ...line })
      }
    }
  }

  return [...byIsbn.values(), ...noIsbn]
}

// ---------------------------------------------------------------------------
// Page thumbnail — shown in the queue
// ---------------------------------------------------------------------------

function PageThumbnail({
  page,
  index,
  onRemove,
}: {
  page:     QueuedPage
  index:    number
  onRemove: (id: string) => void
}) {
  const statusRing = {
    queued:     'ring-gray-300 dark:ring-gray-600',
    extracting: 'ring-blue-400 dark:ring-blue-500',
    done:       'ring-green-400 dark:ring-green-500',
    error:      'ring-red-400 dark:ring-red-500',
  }[page.status]

  return (
    <div className="relative flex-shrink-0 w-20">
      <div className={`relative rounded-md overflow-hidden border-2 ${statusRing} transition-all`}>
        <img
          src={page.previewUrl}
          alt={`Page ${index + 1}`}
          className="w-20 h-28 object-cover"
        />
        {/* Overlay during extraction */}
        {page.status === 'extracting' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {/* Done overlay */}
        {page.status === 'done' && (
          <div className="absolute inset-0 bg-green-500/20 flex items-end justify-end p-1">
            <span className="text-[10px] font-bold text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-900/60 px-1 py-0.5 rounded">
              {page.lines.length} lines
            </span>
          </div>
        )}
        {/* Error overlay */}
        {page.status === 'error' && (
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
            <span className="text-red-200 text-lg">!</span>
          </div>
        )}
      </div>

      {/* Page label */}
      <p className="text-center text-[10px] text-gray-500 dark:text-gray-400 mt-1 font-medium">
        pg {index + 1}
      </p>

      {/* Remove button — only when not processing */}
      {(page.status === 'queued' || page.status === 'done' || page.status === 'error') && (
        <button
          type="button"
          onClick={() => onRemove(page.id)}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-600 dark:bg-gray-400
                     text-white dark:text-gray-900 text-[10px] font-bold leading-none
                     flex items-center justify-center hover:bg-red-600 dark:hover:bg-red-500 transition-colors"
          aria-label="Remove page"
        >
          ×
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PackingSlipUpload({ onLinesAccepted, onPOCandidatesFound, onISBNMatchFound }: Props) {
  const [state, setState]           = useState<ComponentState>('idle')
  const [queue, setQueue]           = useState<QueuedPage[]>([])
  const [mergedLines, setMergedLines] = useState<ParsedSlipLine[]>([])
  const [editedLines, setEditedLines] = useState<ParsedSlipLine[]>([])
  const [allPoCandidates, setAllPoCandidates] = useState<POCandidate[]>([])
  const [allPoRef, setAllPoRef]     = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // ---------------------------------------------------------------------------
  // Add a page to the queue
  // ---------------------------------------------------------------------------

  const addPage = useCallback((file: File) => {
    const page: QueuedPage = {
      id:          crypto.randomUUID(),
      file,
      previewUrl:  URL.createObjectURL(file),
      status:      'queued',
      lines:       [],
      po_candidates: [],
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

  // ---------------------------------------------------------------------------
  // Process all queued pages
  // ---------------------------------------------------------------------------

  const processQueue = useCallback(async () => {
    if (queue.length === 0) return
    setState('processing')
    setError(null)

    const processed: QueuedPage[] = [...queue]

    for (let i = 0; i < processed.length; i++) {
      const page = processed[i]

      // Mark as extracting
      processed[i] = { ...page, status: 'extracting' }
      setQueue([...processed])

      try {
        const result: ParseResult = await parseAndLookup(page.file)

        processed[i] = {
          ...page,
          status:                   result.stub || result.lines.length === 0 ? 'error' : 'done',
          error:                    result.stub ? 'No lines extracted — try a cleaner photo' : undefined,
          lines:                    result.lines,
          po_reference:             result.po_reference,
          po_reference_confidence:  result.po_reference_confidence,
          po_candidates:            result.po_candidates,
        }
      } catch (err) {
        processed[i] = {
          ...page,
          status: 'error',
          error:  err instanceof Error ? err.message : 'Upload failed',
          lines:  [],
          po_candidates: [],
        }
      }

      setQueue([...processed])
    }

    // Merge lines across all successfully-processed pages
    const donePages = processed.filter(p => p.status === 'done')

    if (donePages.length === 0) {
      setError('No lines could be extracted from any page. Try retaking the photos.')
      setState('queue')
      return
    }

    const merged = mergePageLines(donePages)
    setMergedLines(merged)
    setEditedLines(merged.map(l => ({ ...l })))

    // Collect PO candidates from all pages (stage 1 — text match)
    // Use the highest-confidence reference found across pages
    let bestRef:        string | null = null
    let bestConfidence: string | null = null
    let bestCandidates: POCandidate[] = []

    for (const page of donePages) {
      if (
        page.po_reference &&
        page.po_reference_confidence === 'high' &&
        page.po_candidates.length > 0
      ) {
        bestRef        = page.po_reference
        bestConfidence = page.po_reference_confidence
        bestCandidates = page.po_candidates
        break  // first high-confidence match wins
      }
    }

    setAllPoRef(bestRef)
    setAllPoCandidates(bestCandidates)

    // If we found a high-confidence text-based PO match, fire immediately
    if (bestRef && bestCandidates.length > 0 && onPOCandidatesFound) {
      onPOCandidatesFound(bestCandidates, bestRef)
      setState('reviewing')
      return
    }

    // Stage 2: ISBN-based matching
    if (onISBNMatchFound && merged.length > 0) {
      setState('matching')
      const isbns     = merged.map(l => l.isbn).filter(Boolean) as string[]
      const quantities: Record<string, number> = {}
      for (const l of merged) {
        if (l.isbn && l.quantity != null) quantities[l.isbn] = l.quantity
      }

      try {
        const matchResult = await matchSlipToPO({ isbns, quantities })
        if (matchResult.candidates.length > 0) {
          onISBNMatchFound(matchResult.candidates, matchResult.strong_match, merged)
          setState('reviewing')
          return
        }
      } catch (err) {
        console.warn('ISBN match failed:', err)
      }
    }

    setState('reviewing')
  }, [queue, onPOCandidatesFound, onISBNMatchFound])

  // ---------------------------------------------------------------------------
  // Review actions
  // ---------------------------------------------------------------------------

  const updateQty = (idx: number, qty: number) => {
    setEditedLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, qty) } : l))
  }

  const removeLine = (idx: number) => {
    setEditedLines(prev => prev.filter((_, i) => i !== idx))
  }

  const handleAccept = () => {
    const usable = editedLines.filter(l => l.isbn || l.title)
    onLinesAccepted(usable)
    setState('done')
  }

  const handleReset = () => {
    setState('idle')
    setQueue([])
    setMergedLines([])
    setEditedLines([])
    setAllPoCandidates([])
    setAllPoRef(null)
    setError(null)
  }

  const handleAddAnother = () => {
    inputRef.current?.click()
  }

  const reviewLines = editedLines.filter(l => l.needs_review)
  const processingCount = queue.filter(p => p.status === 'extracting').length
  const doneCount       = queue.filter(p => p.status === 'done').length
  const errorCount      = queue.filter(p => p.status === 'error').length

  // ---------------------------------------------------------------------------
  // Idle — no pages queued yet
  // ---------------------------------------------------------------------------

  if (state === 'idle') return (
    <div className="border-2 border-dashed dark:border-gray-700 rounded-lg p-5 text-center space-y-3">
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
        Scan packing slip to pre-fill line items
      </p>

      {/* Guidance copy (#39 Part 4) */}
      <div className="text-left space-y-1 px-2">
        {[
          '📄  One page per photo — use the + Add page button for multi-page slips',
          '📐  Lay slip flat, phone directly above in portrait orientation',
          '🔲  Ensure all four edges of the document are in frame',
          '💡  Good lighting, no shadows across the text',
        ].map((tip, i) => (
          <p key={i} className="text-xs text-gray-400 dark:text-gray-500">{tip}</p>
        ))}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
      >
        📷 Add page 1
      </button>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={e => { const f = e.target.files?.[0]; if (f) addPage(f) }}
        className="hidden"
      />
    </div>
  )

  // ---------------------------------------------------------------------------
  // Queue — pages added, not yet processed
  // ---------------------------------------------------------------------------

  if (state === 'queue' || state === 'processing') {
    const isProcessing = state === 'processing'

    return (
      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {isProcessing
                ? `Reading pages… (${doneCount + errorCount} of ${queue.length} done)`
                : `${queue.length} page${queue.length !== 1 ? 's' : ''} queued`}
            </p>
            {isProcessing && doneCount > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {doneCount} extracted · {errorCount > 0 ? `${errorCount} failed · ` : ''}processing…
              </p>
            )}
            {!isProcessing && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Add all pages before processing — one photo per page.
              </p>
            )}
          </div>
          {!isProcessing && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
            >
              Start over
            </button>
          )}
        </div>

        {/* Thumbnail row */}
        <div className="px-4 py-4">
          <div className="flex gap-3 overflow-x-auto pb-1 items-start">
            {queue.map((page, i) => (
              <PageThumbnail
                key={page.id}
                page={page}
                index={i}
                onRemove={removePage}
              />
            ))}

            {/* Add page button — shown in the thumbnail row when not processing */}
            {!isProcessing && (
              <div className="flex-shrink-0 w-20 flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={handleAddAnother}
                  className="w-20 h-28 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600
                             flex flex-col items-center justify-center gap-1
                             hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <span className="text-2xl text-gray-400 dark:text-gray-500">+</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-tight">Add page</span>
                </button>
                <p className="text-[10px] text-gray-400 text-center">pg {queue.length + 1}</p>
              </div>
            )}
          </div>
        </div>

        {/* Process button */}
        {!isProcessing && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {queue.length === 1
                ? 'Add more pages if this is a multi-page slip, then process.'
                : `${queue.length} pages ready.`}
            </p>
            <button
              type="button"
              onClick={processQueue}
              disabled={queue.length === 0}
              className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold
                         disabled:opacity-50 transition-colors active:scale-[0.98]"
            >
              Process {queue.length > 1 ? `${queue.length} pages` : 'slip'} →
            </button>
          </div>
        )}

        {/* Processing progress bar */}
        {isProcessing && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all"
                style={{ width: `${((doneCount + errorCount) / queue.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={e => { const f = e.target.files?.[0]; if (f) addPage(f) }}
          className="hidden"
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Matching — running ISBN match
  // ---------------------------------------------------------------------------

  if (state === 'matching') return (
    <div className="border dark:border-gray-700 rounded-lg p-5 flex items-center gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 animate-pulse">
          Matching ISBNs to open POs…
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Checking {mergedLines.length} extracted ISBN{mergedLines.length !== 1 ? 's' : ''} against your open purchase orders.
        </p>
      </div>
      <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
    </div>
  )

  // ---------------------------------------------------------------------------
  // Reviewing — merged line list
  // ---------------------------------------------------------------------------

  if (state === 'reviewing') {
    if (editedLines.length === 0) return (
      <div className="border dark:border-gray-700 rounded-lg p-4 space-y-2">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Could not read packing slip automatically
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {errorCount > 0
            ? `${errorCount} of ${queue.length} page${queue.length !== 1 ? 's' : ''} failed to extract. Try retaking those photos.`
            : 'No line items were extracted. Please enter ISBNs manually below.'}
        </p>
        <button type="button" onClick={handleReset} className="text-xs text-blue-500 hover:underline">
          Try again
        </button>
      </div>
    )

    return (
      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {editedLines.length} line{editedLines.length !== 1 ? 's' : ''} extracted
                {queue.length > 1 && ` · from ${doneCount} page${doneCount !== 1 ? 's' : ''}`}
                {errorCount > 0 && (
                  <span className="text-amber-600 dark:text-amber-400"> · {errorCount} page{errorCount !== 1 ? 's' : ''} failed</span>
                )}
              </p>
              {allPoRef && (
                <p className="text-xs mt-0.5 font-mono text-blue-600 dark:text-blue-400">
                  PO ref: {allPoRef}
                </p>
              )}
              {reviewLines.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  ⚠ {reviewLines.length} line{reviewLines.length !== 1 ? 's' : ''} need review — check quantities
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {/* Allow adding more pages after review */}
              <button
                type="button"
                onClick={() => setState('queue')}
                className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
              >
                + Add page
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
              >
                Rescan
              </button>
            </div>
          </div>

          {/* PO candidates from text match */}
          {allPoCandidates.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                PO found in system
              </p>
              {allPoCandidates.map(c => (
                <POCandidateCard
                  key={c.id}
                  candidate={c}
                  onSelect={c => onPOCandidatesFound?.([c], allPoRef ?? '')}
                />
              ))}
              <p className="text-[11px] text-gray-400 dark:text-gray-500 pt-0.5">
                Or scroll down to review lines first, then accept.
              </p>
            </div>
          )}
        </div>

        {/* Line list */}
        <div className="divide-y dark:divide-gray-800 max-h-80 overflow-y-auto">
          {editedLines.map((line, idx) => (
            <div
              key={idx}
              className={`px-4 py-2.5 flex items-center gap-3 ${
                line.needs_review ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {line.isbn ?? '—'}
                  </span>
                  <ConfidenceBadge confidence={line.confidence} />
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200 truncate mt-0.5">
                  {line.title ?? <span className="italic text-gray-400">No title extracted</span>}
                </p>
                {line.unit_cost && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">${line.unit_cost.toFixed(2)} ea</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number" min={1} value={line.quantity ?? ''}
                  onChange={e => updateQty(idx, parseInt(e.target.value) || 1)}
                  className={`w-16 px-2 py-1 border rounded text-sm text-center dark:bg-gray-800 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none ${
                    line.needs_review ? 'border-amber-400 dark:border-amber-600' : 'dark:border-gray-600'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Accept bar */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Adjust quantities if needed, then accept to continue.
          </p>
          <button
            type="button"
            onClick={handleAccept}
            disabled={editedLines.length === 0}
            className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            Use these lines ({editedLines.length}) →
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Done
  // ---------------------------------------------------------------------------

  if (state === 'done') return (
    <div className="border dark:border-gray-700 rounded-lg px-4 py-3 flex items-center justify-between bg-green-50/50 dark:bg-green-900/10">
      <p className="text-sm text-green-700 dark:text-green-300 font-medium">
        ✓ Packing slip lines loaded — resolve ISBNs below
      </p>
      <button type="button" onClick={handleReset} className="text-xs text-gray-400 hover:underline">
        Rescan
      </button>
    </div>
  )

  return null
}
