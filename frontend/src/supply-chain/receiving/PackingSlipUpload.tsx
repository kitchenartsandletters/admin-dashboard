// PackingSlipUpload.tsx
// Packing slip / invoice scanner component for ReceivingEntryFlow.
//
// Mounted at the TOP of the LineEntryStep (Step 3), before the manual ISBN entry form.
// Staff can photograph or upload the packing slip → system pre-fills line items.
// Manual entry remains available as fallback.
//
// Flow:
//   1. Staff taps "Scan packing slip" → file input opens (camera or file browser)
//   2. Image uploaded to POST /api/receiving/parse-packing-slip
//   3. Results shown with confidence badges
//   4. Staff review, adjust qty if needed, then "Use these lines"
//   5. Lines are injected into ReceivingEntryFlow's line state for ISBN resolution

import { useState, useRef } from 'react'
import { parsePackingSlip } from '../../api/supplyChainApi'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedSlipLine {
  isbn: string | null
  title: string | null
  supplier_sku: string | null
  quantity: number | null
  unit_cost: number | null
  confidence: number
  needs_review: boolean
}

interface ParseResult {
  lines: ParsedSlipLine[]
  stub: boolean
  invoice_number?: string | null
  supplier_name?: string | null
}

interface Props {
  onLinesAccepted: (lines: ParsedSlipLine[]) => void
}

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.90) return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-bold">
      ✓ High
    </span>
  )
  if (confidence >= 0.80) return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold">
      ✓ Good
    </span>
  )
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-bold">
      ⚠ Review
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PackingSlipUpload({ onLinesAccepted }: Props) {
  const [state, setState] = useState<'idle' | 'uploading' | 'reviewing' | 'done'>('idle')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editedLines, setEditedLines] = useState<ParsedSlipLine[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview
    setPreviewUrl(URL.createObjectURL(file))
    setState('uploading')
    setError(null)

    try {
      const parsed = await parsePackingSlip(file)
      setResult(parsed)
      setEditedLines(parsed.lines.map(l => ({ ...l })))
      setState('reviewing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setState('idle')
    }

    // Reset input so same file can be re-uploaded if needed
    if (inputRef.current) inputRef.current.value = ''
  }

  const updateQty = (idx: number, qty: number) => {
    setEditedLines(prev => prev.map((l, i) =>
      i === idx ? { ...l, quantity: Math.max(1, qty) } : l
    ))
  }

  const removeLine = (idx: number) => {
    setEditedLines(prev => prev.filter((_, i) => i !== idx))
  }

  const handleAccept = () => {
    // Filter out lines with no ISBN and no usable data
    const usable = editedLines.filter(l => l.isbn || l.title)
    onLinesAccepted(usable)
    setState('done')
  }

  const handleReset = () => {
    setState('idle')
    setResult(null)
    setEditedLines([])
    setPreviewUrl(null)
    setError(null)
  }

  const reviewLines = editedLines.filter(l => l.needs_review)
  const goodLines   = editedLines.filter(l => !l.needs_review)

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (state === 'idle') {
    return (
      <div className="border-2 border-dashed dark:border-gray-700 rounded-lg p-5 text-center space-y-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Scan packing slip to pre-fill line items
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Take a photo or upload a PDF/image of the packing slip or invoice.
          The system will extract ISBNs and quantities automatically.
        </p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            📷 Scan packing slip
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <p className="text-xs text-gray-300 dark:text-gray-600">
          Or skip and enter ISBNs manually below
        </p>
      </div>
    )
  }

  // ── Uploading ──────────────────────────────────────────────────────────────
  if (state === 'uploading') {
    return (
      <div className="border dark:border-gray-700 rounded-lg p-5 flex items-center gap-4">
        {previewUrl && (
          <img src={previewUrl} alt="Packing slip" className="h-16 w-auto rounded object-contain border dark:border-gray-700" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 animate-pulse">
            Reading packing slip…
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Extracting ISBNs and quantities. This takes about 10 seconds.
          </p>
        </div>
        <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
      </div>
    )
  }

  // ── Reviewing ──────────────────────────────────────────────────────────────
  if (state === 'reviewing' && result) {
    if (result.stub || result.lines.length === 0) {
      return (
        <div className="border dark:border-gray-700 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Could not read packing slip automatically
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            The system couldn't extract line items from this document.
            Please enter ISBNs manually below.
          </p>
          <button type="button" onClick={handleReset} className="text-xs text-blue-500 hover:underline">
            Try a different image
          </button>
        </div>
      )
    }

    return (
      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {result.lines.length} line{result.lines.length !== 1 ? 's' : ''} found
              {result.supplier_name && ` · ${result.supplier_name}`}
              {result.invoice_number && ` · ${result.invoice_number}`}
            </p>
            {reviewLines.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                ⚠ {reviewLines.length} line{reviewLines.length !== 1 ? 's' : ''} need review — check quantities
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {previewUrl && (
              <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:underline">
                View image
              </a>
            )}
            <button type="button" onClick={handleReset} className="text-xs text-gray-400 hover:underline">
              Rescan
            </button>
          </div>
        </div>

        {/* Lines */}
        <div className="divide-y dark:divide-gray-800 max-h-80 overflow-y-auto">
          {editedLines.map((line, idx) => (
            <div key={idx} className={`px-4 py-2.5 flex items-center gap-3 ${line.needs_review ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
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
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    ${line.unit_cost.toFixed(2)} ea
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={1}
                  value={line.quantity ?? ''}
                  onChange={e => updateQty(idx, parseInt(e.target.value) || 1)}
                  className={`w-16 px-2 py-1 border rounded text-sm text-center dark:bg-gray-800 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none
                    ${line.needs_review ? 'border-amber-400 dark:border-amber-600' : 'dark:border-gray-600'}`}
                />
                <button type="button" onClick={() => removeLine(idx)}
                  className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none">
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

  // ── Done ───────────────────────────────────────────────────────────────────
  if (state === 'done') {
    return (
      <div className="border dark:border-gray-700 rounded-lg px-4 py-3 flex items-center justify-between bg-green-50/50 dark:bg-green-900/10">
        <p className="text-sm text-green-700 dark:text-green-300 font-medium">
          ✓ Packing slip lines loaded — resolve ISBNs below
        </p>
        <button type="button" onClick={handleReset} className="text-xs text-gray-400 hover:underline">
          Rescan
        </button>
      </div>
    )
  }

  return null
}
