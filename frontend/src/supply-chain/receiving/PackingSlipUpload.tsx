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
// Two-stage PO matching (#35):
//   Stage 1 (existing): parse-and-lookup returns po_candidates when the slip
//     contains a readable PO reference at high confidence.
//   Stage 2 (new): if Stage 1 finds no candidates, run POST /api/receiving/match-slip
//     with the extracted ISBNs. This finds POs even when the slip has no KAL PO
//     number — typical for publisher packing slips (RDH, Ingram, etc.).
//   onISBNMatchFound is called with the ISBN match results so ReceivingEntryFlow
//   can show the reconciliation view or ranked candidate list.

import { useState, useRef } from 'react'
import { parseAndLookup, matchSlipToPO, POCandidate, ParsedSlipLine, SlipMatchCandidate } from '../../api/supplyChainApi'

export type { ParsedSlipLine }

interface ParseResult {
  lines:                    ParsedSlipLine[]
  stub:                     boolean
  invoice_number?:          string | null
  supplier_name?:           string | null
  po_reference?:            string | null
  po_reference_confidence?: 'high' | 'medium' | 'low' | null
  po_candidates:            POCandidate[]
}

interface Props {
  onLinesAccepted:      (lines: ParsedSlipLine[]) => void
  onPOCandidatesFound?: (candidates: POCandidate[], poReference: string) => void
  /** Called after ISBN-based matching (stage 2). Only fires in the po_lookup context. */
  onISBNMatchFound?:    (candidates: SlipMatchCandidate[], strongMatch: string | null) => void
}

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

export default function PackingSlipUpload({ onLinesAccepted, onPOCandidatesFound, onISBNMatchFound }: Props) {
  const [state, setState]         = useState<'idle' | 'uploading' | 'matching' | 'reviewing' | 'done'>('idle')
  const [result, setResult]       = useState<ParseResult | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [editedLines, setEditedLines] = useState<ParsedSlipLine[]>([])
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null)
  const [matchStatus, setMatchStatus] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPreviewUrl(URL.createObjectURL(file))
    setState('uploading')
    setError(null)
    setMatchStatus(null)

    try {
      // Stage 1: text-based PO lookup (existing)
      const parsed = await parseAndLookup(file)
      setResult(parsed)
      setEditedLines(parsed.lines.map(l => ({ ...l })))

      const hasTextMatch = (
        parsed.po_reference &&
        parsed.po_reference_confidence === 'high' &&
        parsed.po_candidates.length > 0
      )

      if (hasTextMatch && onPOCandidatesFound) {
        // Text match found — fire immediately, don't run ISBN match
        onPOCandidatesFound(parsed.po_candidates, parsed.po_reference!)
        setState('reviewing')
        return
      }

      // Stage 2: ISBN-based matching (#35)
      // Run this when no text-based PO match was found.
      // Typical for publisher slips (RDH, Ingram) that don't carry a KAL PO number.
      if (onISBNMatchFound && parsed.lines.length > 0) {
        setState('matching')
        setMatchStatus('Matching ISBNs to open POs…')

        const isbns     = parsed.lines.map(l => l.isbn).filter(Boolean) as string[]
        const quantities: Record<string, number> = {}
        for (const l of parsed.lines) {
          if (l.isbn && l.quantity != null) quantities[l.isbn] = l.quantity
        }

        try {
          const matchResult = await matchSlipToPO({ isbns, quantities })
          setMatchStatus(null)

          if (matchResult.candidates.length > 0) {
            onISBNMatchFound(matchResult.candidates, matchResult.strong_match)
            setState('reviewing')
            return
          }
        } catch (matchErr) {
          // ISBN match failure is non-fatal — fall through to reviewing/ad hoc
          console.warn('ISBN match failed:', matchErr)
          setMatchStatus(null)
        }
      }

      setState('reviewing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setState('idle')
    }

    if (inputRef.current) inputRef.current.value = ''
  }

  const updateQty  = (idx: number, qty: number) => { setEditedLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, qty) } : l)) }
  const removeLine = (idx: number) => { setEditedLines(prev => prev.filter((_, i) => i !== idx)) }
  const handleAccept = () => { const usable = editedLines.filter(l => l.isbn || l.title); onLinesAccepted(usable); setState('done') }
  const handleReset  = () => { setState('idle'); setResult(null); setEditedLines([]); setPreviewUrl(null); setError(null); setMatchStatus(null) }
  const reviewLines  = editedLines.filter(l => l.needs_review)

  // ── Idle ─────────────────────────────────────────────────────────────────
  if (state === 'idle') return (
    <div className="border-2 border-dashed dark:border-gray-700 rounded-lg p-5 text-center space-y-3">
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Scan packing slip to pre-fill line items</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Take a photo of the packing slip or invoice.
        Hold your phone upright in portrait orientation, directly above the document.
        The system will extract ISBNs and quantities — always review before confirming.
      </p>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
          📷 Scan packing slip
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment"
        onChange={handleFileChange} className="hidden" />
    </div>
  )

  // ── Uploading ─────────────────────────────────────────────────────────────
  if (state === 'uploading' || state === 'matching') return (
    <div className="border dark:border-gray-700 rounded-lg p-5 flex items-center gap-4">
      {previewUrl && <img src={previewUrl} alt="Packing slip" className="h-16 w-auto rounded object-contain border dark:border-gray-700" />}
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 animate-pulse">
          {state === 'matching' ? (matchStatus ?? 'Matching ISBNs to open POs…') : 'Reading packing slip…'}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {state === 'matching'
            ? 'Checking extracted ISBNs against your open purchase orders.'
            : 'Extracting ISBNs, quantities, and PO reference. This takes about 10 seconds.'}
        </p>
      </div>
      <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
    </div>
  )

  // ── Reviewing ─────────────────────────────────────────────────────────────
  if (state === 'reviewing' && result) {
    if (result.stub || result.lines.length === 0) return (
      <div className="border dark:border-gray-700 rounded-lg p-4 space-y-2">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Could not read packing slip automatically</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">The system couldn't extract line items from this document. Please enter ISBNs manually below.</p>
        <button type="button" onClick={handleReset} className="text-xs text-blue-500 hover:underline">Try a different image</button>
      </div>
    )

    return (
      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {result.lines.length} line{result.lines.length !== 1 ? 's' : ''} found
                {result.supplier_name && ` · ${result.supplier_name}`}
                {result.invoice_number && ` · ${result.invoice_number}`}
              </p>
              {result.po_reference && (
                <p className={`text-xs mt-0.5 font-mono ${
                  result.po_reference_confidence === 'high' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  PO ref: {result.po_reference}
                  {result.po_reference_confidence === 'medium' && <span className="ml-1 font-sans text-amber-500">(handwritten — verify)</span>}
                </p>
              )}
              {reviewLines.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  ⚠ {reviewLines.length} line{reviewLines.length !== 1 ? 's' : ''} need review — check quantities
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:underline">View image</a>}
              <button type="button" onClick={handleReset} className="text-xs text-gray-400 hover:underline">Rescan</button>
            </div>
          </div>

          {result.po_candidates.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">PO found in system</p>
              {result.po_candidates.map(c => (
                <POCandidateCard key={c.id} candidate={c} onSelect={c => onPOCandidatesFound?.([c], result.po_reference ?? '')} />
              ))}
              <p className="text-[11px] text-gray-400 dark:text-gray-500 pt-0.5">Or scroll down to review lines first, then accept.</p>
            </div>
          )}
        </div>

        <div className="divide-y dark:divide-gray-800 max-h-80 overflow-y-auto">
          {editedLines.map((line, idx) => (
            <div key={idx} className={`px-4 py-2.5 flex items-center gap-3 ${line.needs_review ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{line.isbn ?? '—'}</span>
                  <ConfidenceBadge confidence={line.confidence} />
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200 truncate mt-0.5">
                  {line.title ?? <span className="italic text-gray-400">No title extracted</span>}
                </p>
                {line.unit_cost && <p className="text-[11px] text-gray-400 dark:text-gray-500">${line.unit_cost.toFixed(2)} ea</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input type="number" min={1} value={line.quantity ?? ''}
                  onChange={e => updateQty(idx, parseInt(e.target.value) || 1)}
                  className={`w-16 px-2 py-1 border rounded text-sm text-center dark:bg-gray-800 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none ${
                    line.needs_review ? 'border-amber-400 dark:border-amber-600' : 'dark:border-gray-600'
                  }`} />
                <button type="button" onClick={() => removeLine(idx)}
                  className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none">×</button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">Adjust quantities if needed, then accept to continue.</p>
          <button type="button" onClick={handleAccept} disabled={editedLines.length === 0}
            className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
            Use these lines ({editedLines.length}) →
          </button>
        </div>
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  if (state === 'done') return (
    <div className="border dark:border-gray-700 rounded-lg px-4 py-3 flex items-center justify-between bg-green-50/50 dark:bg-green-900/10">
      <p className="text-sm text-green-700 dark:text-green-300 font-medium">✓ Packing slip lines loaded — resolve ISBNs below</p>
      <button type="button" onClick={handleReset} className="text-xs text-gray-400 hover:underline">Rescan</button>
    </div>
  )

  return null
}
