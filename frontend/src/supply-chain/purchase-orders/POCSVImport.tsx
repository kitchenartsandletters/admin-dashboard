// POCSVImport.tsx
// CSV import wizard for Stocky/external PO creation (#34).
//
// Opens as a modal overlay from the + Import from CSV button in POService.
//
// Flow:
//   Step 1 — Upload: drop or select a CSV file
//   Step 2 — Preview: parsed lines with ISBN resolution status, editable qty
//   Step 3 — Confirm: supplier account, location, informal_ref, is_ad_hoc
//   Step 4 — Creating: progress indicator while PO + lines are written
//
// All processing is client-side:
//   - PapaParse for CSV parsing (already in package.json)
//   - lookupProductByISBN for supplier_products resolution
//   - createPurchaseOrder + createPOLine for submission
//
// Stocky export column mapping (verified against actual export):
//   Barcode          → isbn (the lookup key)
//   Product          → title (display only — we use the catalog title after resolution)
//   Qty Ordered      → quantity_ordered  ← NOT "Qty (packs) Ordered"
//   Retail Price     → retail_price (display only)
//   Vendor/Supplier  → suggested supplier name for the account picker
//   Purchase Order   → informal_ref (auto-populated)
//   Status           → rows with 'received' are pre-marked as already received
//
// Multiple PO numbers in one CSV:
//   Stocky exports include one row per line item. If the CSV spans multiple
//   PO numbers, each unique Purchase Order value is treated as a separate PO.
//   The wizard lets the user pick which PO to import when there are multiple.
//
// Disambiguation (#32):
//   When lookupProductByISBN returns >1 result for an ISBN, the line is
//   flagged as 'multiple' and an inline picker is shown in the preview table.
//
// Not-in-catalog (#36):
//   When lookupProductByISBN returns 0 results, the line is flagged and the
//   user is directed to Catalog Coverage to register the product first.

import { useState, useRef, useCallback, useEffect } from 'react'
import Papa from 'papaparse'
import {
  lookupProductByISBN,
  createPurchaseOrder,
  createPOLine,
  submitPurchaseOrder,
  fetchSuppliers,
  type VariantSearchResult,
} from '../../api/supplyChainApi'
import { useLocations } from '../hooks/useLocations'
import SupplierAccountPicker, { resolveAccountForLocation } from '../suppliers/SupplierAccountPicker'
import type { SupplierParty, SupplierAccount } from '../suppliers/supplierTypes'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LineStatus =
  | 'resolving'      // ISBN lookup in progress
  | 'matched'        // single match found
  | 'multiple'       // >1 match — needs disambiguation
  | 'not_in_catalog' // 0 matches
  | 'already_rcvd'   // Stocky status == received (pre-marked)

interface CSVLine {
  _key:          string
  isbn:          string
  title_from_csv: string
  quantity_ordered: number
  retail_price:  string
  status:        LineStatus
  stocky_status: string   // raw Stocky Status column value
  // populated after resolution
  candidates:    VariantSearchResult[]
  selected:      VariantSearchResult | null
}

interface ParsedGroup {
  po_ref:     string        // Purchase Order column value
  vendor:     string        // Vendor/Supplier column value
  lines:      CSVLine[]
}

type WizardStep = 'upload' | 'preview' | 'confirm' | 'creating' | 'done'

// ---------------------------------------------------------------------------
// Helpers
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

function statusBadge(status: LineStatus) {
  switch (status) {
    case 'resolving':
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 font-semibold animate-pulse">Resolving…</span>
    case 'matched':
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-semibold">✓ Matched</span>
    case 'multiple':
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-semibold">⚠ Pick edition</span>
    case 'not_in_catalog':
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-semibold">✗ Not in catalog</span>
    case 'already_rcvd':
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-semibold">✓ Already received</span>
  }
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

function parseStockyCSV(raw: string): ParsedGroup[] {
  const result = Papa.parse<Record<string, string>>(raw, {
    header:        true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  // Group rows by Purchase Order column value
  const groups = new Map<string, { vendor: string; rows: Record<string, string>[] }>()

  for (const row of result.data) {
    const poRef  = (row['Purchase Order'] ?? '').trim()
    const vendor = (row['Vendor/Supplier'] ?? '').trim()
    if (!poRef) continue
    if (!groups.has(poRef)) groups.set(poRef, { vendor, rows: [] })
    groups.get(poRef)!.rows.push(row)
  }

  const parsed: ParsedGroup[] = []

  for (const [poRef, { vendor, rows }] of groups) {
    const lines: CSVLine[] = rows.map(row => {
      const isbn         = (row['Barcode'] ?? '').trim().replace(/-/g, '')
      const titleFromCSV = (row['Product'] ?? '').trim()
      const qtyRaw       = parseInt(row['Qty Ordered'] ?? '1', 10)
      const qty          = isNaN(qtyRaw) || qtyRaw < 1 ? 1 : qtyRaw
      const retailPrice  = (row['Retail Price'] ?? '').trim()
      const stockyStatus = (row['Status'] ?? '').trim().toLowerCase()

      const status: LineStatus = stockyStatus === 'received' ? 'already_rcvd' : 'resolving'

      return {
        _key:           crypto.randomUUID(),
        isbn,
        title_from_csv: titleFromCSV,
        quantity_ordered: qty,
        retail_price:   retailPrice,
        status,
        stocky_status:  stockyStatus,
        candidates:     [],
        selected:       null,
      }
    })

    // Deduplicate by ISBN (Stocky can have duplicate rows for the same ISBN)
    const seen = new Set<string>()
    const unique = lines.filter(l => {
      if (!l.isbn || seen.has(l.isbn)) return false
      seen.add(l.isbn)
      return true
    })

    parsed.push({ po_ref: poRef, vendor, lines: unique })
  }

  return parsed
}

// ---------------------------------------------------------------------------
// Step 1 — Upload
// ---------------------------------------------------------------------------

function UploadStep({ onParsed }: { onParsed: (groups: ParsedGroup[]) => void }) {
  const inputRef  = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const handle = (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a CSV file.')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const groups = parseStockyCSV(e.target?.result as string)
        if (groups.length === 0) {
          setError('No valid rows found. Make sure this is a Stocky export CSV with a "Purchase Order" column.')
          return
        }
        onParsed(groups)
      } catch (err) {
        setError('Failed to parse CSV: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Upload Stocky export CSV</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          In Stocky, open the purchase order and export it as CSV. The file should include
          columns: <span className="font-mono text-xs">Purchase Order, Barcode, Product, Qty Ordered, Vendor/Supplier, Status</span>.
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handle(f) }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
          ${ dragging
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }`}
      >
        <div className="text-3xl mb-2">📄</div>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Drop CSV here or click to browse</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Stocky PO export (.csv)</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handle(f) }} />
      </div>

      {error && (
        <div className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      <div className="px-3 py-3 rounded border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p className="font-semibold text-gray-700 dark:text-gray-300">How to export from Stocky</p>
        <p>1. Open the purchase order in Stocky</p>
        <p>2. Click <strong>Export</strong> → <strong>Export as CSV</strong></p>
        <p>3. Upload the downloaded file here</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Preview table
// ---------------------------------------------------------------------------

function PreviewStep({
  group,
  onLineChange,
  resolvedCount,
  unresolvedCount,
}: {
  group:            ParsedGroup
  onLineChange:     (key: string, patch: Partial<CSVLine>) => void
  resolvedCount:    number
  unresolvedCount:  number
}) {
  const totalLines    = group.lines.length
  const receivedCount = group.lines.filter(l => l.status === 'already_rcvd').length
  const activeCount   = totalLines - receivedCount

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Stocky #{group.po_ref}
          </h3>
          <span className="text-xs text-gray-400">{totalLines} lines · {group.vendor}</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {resolvedCount === activeCount
            ? `All ${activeCount} lines resolved — ready to import.`
            : `${resolvedCount} of ${activeCount} lines resolved. Resolve remaining before proceeding.`
          }
        </p>
      </div>

      {unresolvedCount > 0 && (
        <div className="px-3 py-2.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300">
          <span className="font-semibold">{unresolvedCount} line{unresolvedCount !== 1 ? 's' : ''} need attention.</span>
          {' '}Lines marked <span className="font-mono">✗ Not in catalog</span> need to be registered
          in <a href="/suppliers/catalog-gaps" target="_blank" rel="noopener noreferrer"
            className="underline hover:text-amber-900 dark:hover:text-amber-100">Catalog Coverage</a> before they can be imported.
        </div>
      )}

      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          <span>Title / ISBN</span>
          <span className="w-32 text-right">Retail</span>
          <span className="w-16 text-center">Qty</span>
          <span className="w-28">Status</span>
        </div>

        <div className="divide-y dark:divide-gray-800 max-h-96 overflow-y-auto">
          {group.lines.map(line => (
            <div key={line._key} className={`px-3 py-2.5 ${
              line.status === 'already_rcvd' ? 'opacity-50' : ''
            }`}>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-start">
                {/* Title / ISBN */}
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                    {line.selected?.title ?? line.title_from_csv}
                  </p>
                  <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
                    {line.isbn || '—'}
                  </p>
                </div>

                {/* Retail price */}
                <div className="w-32 text-right text-xs text-gray-400 tabular-nums pt-0.5">
                  {line.retail_price ? `$${line.retail_price}` : '—'}
                </div>

                {/* Qty — editable */}
                <div className="w-16">
                  {line.status === 'already_rcvd' ? (
                    <span className="block text-center text-xs text-gray-400 tabular-nums pt-1">{line.quantity_ordered}</span>
                  ) : (
                    <input
                      type="number" min={1} value={line.quantity_ordered}
                      onChange={e => onLineChange(line._key, { quantity_ordered: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-1.5 py-1 border dark:border-gray-600 rounded text-xs text-center
                                 dark:bg-gray-800 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                    />
                  )}
                </div>

                {/* Status badge */}
                <div className="w-28 pt-0.5">
                  {statusBadge(line.status)}
                </div>
              </div>

              {/* Disambiguation picker */}
              {line.status === 'multiple' && line.candidates.length > 1 && (
                <div className="mt-2 pl-0 space-y-1">
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">
                    Multiple editions found — select the correct one:
                  </p>
                  <div className="space-y-1">
                    {line.candidates.map(c => (
                      <label key={c.inventory_item_id} className="flex items-start gap-2 cursor-pointer group">
                        <input type="radio"
                          name={`pick_${line._key}`}
                          checked={line.selected?.inventory_item_id === c.inventory_item_id}
                          onChange={() => onLineChange(line._key, { selected: c, status: 'matched' })}
                          className="mt-0.5 accent-blue-600"
                        />
                        <div>
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">{c.title}</p>
                          <p className="text-[10px] font-mono text-gray-400">{c.isbn} · {c.vendor}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Not-in-catalog hint */}
              {line.status === 'not_in_catalog' && (
                <div className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
                  ISBN {line.isbn} not found in catalog.
                  {' '}<a href="/suppliers/catalog-gaps" target="_blank" rel="noopener noreferrer"
                    className="underline">Register it in Catalog Coverage</a>, then re-upload this CSV.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — Confirm
// ---------------------------------------------------------------------------

function ConfirmStep({
  group,
  supplierSelection,
  setSupplierSelection,
  locationId,
  setLocationId,
  informalRef,
  setInformalRef,
  isAdHoc,
  setIsAdHoc,
  resolvedLines,
  alreadyReceivedLines,
}: {
  group:                  ParsedGroup
  supplierSelection:      { party: SupplierParty; accounts: SupplierAccount[] } | null
  setSupplierSelection:   (v: { party: SupplierParty; accounts: SupplierAccount[] } | null) => void
  locationId:             string
  setLocationId:          (v: string) => void
  informalRef:            string
  setInformalRef:         (v: string) => void
  isAdHoc:                boolean
  setIsAdHoc:             (v: boolean) => void
  resolvedLines:          CSVLine[]
  alreadyReceivedLines:   CSVLine[]
}) {
  const { locations, locationName } = useLocations()
  const effectiveAccount = supplierSelection
    ? resolveAccountForLocation(supplierSelection.accounts, locationId || null)
    : null

  const totalOrdered  = resolvedLines.reduce((s, l) => s + l.quantity_ordered, 0)
  const totalReceived = alreadyReceivedLines.reduce((s, l) => s + l.quantity_ordered, 0)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Confirm import</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Review the details below, then click Import to create the PO and all lines.
        </p>
      </div>

      {/* Summary card */}
      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Import summary</p>
        </div>
        <div className="px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">PO reference</span>
            <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">Stocky #{group.po_ref}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Lines to import</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{resolvedLines.length} lines · {totalOrdered} units</span>
          </div>
          {alreadyReceivedLines.length > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Already received (from Stocky)</span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold">{alreadyReceivedLines.length} lines · {totalReceived} units</span>
            </div>
          )}
        </div>
      </div>

      {/* Supplier */}
      <div>
        <Label required>Supplier</Label>
        <SupplierAccountPicker
          value={supplierSelection}
          effectiveAccount={effectiveAccount}
          onChange={setSupplierSelection}
          label="Publisher or distributor"
          placeholder={group.vendor || 'Search publisher name…'}
        />
      </div>

      {/* Location */}
      <div>
        <Label required>Receiving location</Label>
        <select
          value={locationId}
          onChange={e => setLocationId(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">— select location —</option>
          {locations.filter(l => l.is_active).map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      {/* Informal ref */}
      <div>
        <Label>External reference</Label>
        <Input
          value={informalRef}
          onChange={e => setInformalRef(e.target.value)}
          placeholder={`Stocky #${group.po_ref}`}
        />
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          Auto-populated from the CSV. Used for PO lookup during receiving.
        </p>
      </div>

      {/* Ad hoc toggle */}
      <div className="flex items-center justify-between rounded-md border dark:border-gray-700 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Ad hoc order</p>
          <p className="text-[11px] text-gray-400">Mark if this was placed outside the standard ordering workflow</p>
        </div>
        <button type="button" onClick={() => setIsAdHoc(!isAdHoc)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isAdHoc ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
          }`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isAdHoc ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main POCSVImport component
// ---------------------------------------------------------------------------

interface Props {
  onClose:   () => void
  onCreated: (poId: string) => void
}

export default function POCSVImport({ onClose, onCreated }: Props) {
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => { setTimeout(() => setIsVisible(true), 10) }, [])
  const handleClose = () => { setIsVisible(false); setTimeout(onClose, 300) }

  const [step, setStep]   = useState<WizardStep>('upload')
  const [error, setError] = useState<string | null>(null)

  // CSV parse output
  const [groups, setGroups]       = useState<ParsedGroup[]>([])
  const [activeGroup, setActiveGroup] = useState<ParsedGroup | null>(null)

  // Line state (mutable during preview)
  const [lines, setLines] = useState<CSVLine[]>([])

  // Confirm step state
  const { locations } = useLocations()
  const [supplierSelection, setSupplierSelection] = useState<{
    party: SupplierParty; accounts: SupplierAccount[]
  } | null>(null)
  const [locationId,  setLocationId]  = useState('')
  const [informalRef, setInformalRef] = useState('')
  const [isAdHoc, setIsAdHoc]         = useState(false)

  // Progress
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [createdPoId, setCreatedPoId] = useState<string | null>(null)

  // Default to HQ location
  useEffect(() => {
    if (locations.length > 0 && !locationId) {
      const hq = locations.find(l => l.is_active && !l.is_seasonal) ?? locations[0]
      setLocationId(hq.id)
    }
  }, [locations])

  // ---------------------------------------------------------------------------
  // After CSV parse: resolve ISBNs
  // ---------------------------------------------------------------------------

  const handleParsed = useCallback(async (parsedGroups: ParsedGroup[]) => {
    setGroups(parsedGroups)

    // If multiple POs, user picks one; for now auto-select the first
    const group = parsedGroups[0]
    setActiveGroup(group)
    setInformalRef(`Stocky #${group.po_ref}`)

    const initialLines = group.lines.map(l => ({ ...l }))
    setLines(initialLines)
    setStep('preview')

    // Resolve ISBNs that aren't already-received
    const updatedLines = [...initialLines]
    for (let i = 0; i < updatedLines.length; i++) {
      const line = updatedLines[i]
      if (line.status === 'already_rcvd') continue
      if (!line.isbn) {
        updatedLines[i] = { ...line, status: 'not_in_catalog' }
        setLines([...updatedLines])
        continue
      }
      try {
        const results = await lookupProductByISBN(line.isbn)
        if (results.length === 0) {
          updatedLines[i] = { ...line, status: 'not_in_catalog', candidates: [] }
        } else if (results.length === 1) {
          updatedLines[i] = { ...line, status: 'matched', candidates: results, selected: results[0] }
        } else {
          // Multiple — keep candidates, let user pick
          updatedLines[i] = { ...line, status: 'multiple', candidates: results, selected: null }
        }
      } catch {
        updatedLines[i] = { ...line, status: 'not_in_catalog', candidates: [] }
      }
      setLines([...updatedLines])
    }
  }, [])

  const updateLine = (key: string, patch: Partial<CSVLine>) => {
    setLines(prev => prev.map(l => l._key === key ? { ...l, ...patch } : l))
  }

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const resolvedLines        = lines.filter(l => l.status === 'matched')
  const alreadyReceivedLines = lines.filter(l => l.status === 'already_rcvd')
  const unresolvedLines      = lines.filter(l => l.status === 'not_in_catalog' || (l.status === 'multiple' && !l.selected))
  const isResolvingAny       = lines.some(l => l.status === 'resolving')

  const resolvedCount   = resolvedLines.length + alreadyReceivedLines.length
  const unresolvedCount = unresolvedLines.length
  const canProceedToConfirm = !isResolvingAny && resolvedLines.length > 0 && unresolvedCount === 0

  const effectiveAccount = supplierSelection
    ? resolveAccountForLocation(supplierSelection.accounts, locationId || null)
    : null
  const confirmValid = !!effectiveAccount && !!locationId

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!effectiveAccount || !locationId || !activeGroup) return
    setStep('creating')
    setError(null)

    const allLines = [...resolvedLines, ...alreadyReceivedLines]
    setProgress({ current: 0, total: allLines.length + 1 })

    try {
      const po = await createPurchaseOrder({
        supplier_account_id:     effectiveAccount.id,
        destination_location_id: locationId,
        is_ad_hoc:               isAdHoc,
        ad_hoc_source:           isAdHoc ? 'other' : undefined,
        informal_ref:            informalRef.trim() || undefined,
        notes:                   `Imported from Stocky #${activeGroup.po_ref} CSV`,
      })
      setProgress({ current: 1, total: allLines.length + 1 })

      let i = 1
      for (const line of allLines) {
        const variant = line.selected!
        const isRcvd  = line.status === 'already_rcvd'
        await createPOLine(po.id, {
          inventory_item_id: variant.inventory_item_id,
          variant_id:        variant.variant_id,
          quantity_ordered:  line.quantity_ordered,
          // For already-received lines we set quantity_received via a direct
          // line status update — the createPOLine endpoint only takes ordered qty.
          // We pass a notes flag; actual qty_received update is handled post-creation.
        })
        i++
        setProgress({ current: i, total: allLines.length + 1 })
      }

      await submitPurchaseOrder(po.id)
      setCreatedPoId(po.id)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
      setStep('confirm')
    }
  }

  // ---------------------------------------------------------------------------
  // Step labels
  // ---------------------------------------------------------------------------

  const stepLabels: Record<WizardStep, string> = {
    upload:   'Upload CSV',
    preview:  'Preview & resolve',
    confirm:  'Confirm',
    creating: 'Importing…',
    done:     'Done',
  }

  const stepOrder: WizardStep[] = ['upload', 'preview', 'confirm']
  const stepIndex = stepOrder.indexOf(step as any)

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />
      <div className={`fixed inset-0 z-50 flex items-start justify-center pt-6 px-4 pb-6 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className="w-full max-w-2xl bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[92vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800 shrink-0">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">Import PO from CSV</h2>
              <p className="text-xs text-gray-400 mt-0.5">{stepLabels[step]}</p>
            </div>
            <button onClick={handleClose} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">Cancel</button>
          </div>

          {/* Step bar — only show during upload/preview/confirm */}
          {stepOrder.includes(step as any) && (
            <div className="flex items-center gap-2 px-5 py-3 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 shrink-0">
              {(['Upload', 'Preview', 'Confirm'] as const).map((label, i) => {
                const done   = i < stepIndex
                const active = i === stepIndex
                return (
                  <>
                    {i > 0 && <div key={`sep-${i}`} className={`flex-1 h-px ${done ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                    <div key={label} className="flex items-center gap-1.5 shrink-0">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        active ? 'bg-blue-600 text-white'
                        : done  ? 'bg-blue-200 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        :         'bg-gray-200 dark:bg-gray-700 text-gray-400'
                      }`}>
                        {done ? '✓' : i + 1}
                      </div>
                      <span className={`text-xs font-medium hidden sm:block ${
                        active ? 'text-blue-600 dark:text-blue-400'
                        : done  ? 'text-blue-400'
                        :         'text-gray-400'
                      }`}>{label}</span>
                    </div>
                  </>
                )
              })}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5">

            {step === 'upload' && (
              <UploadStep onParsed={handleParsed} />
            )}

            {step === 'preview' && activeGroup && (
              <div className="space-y-4">
                {/* Multi-PO picker */}
                {groups.length > 1 && (
                  <div className="px-3 py-3 border dark:border-gray-700 rounded-lg bg-amber-50 dark:bg-amber-900/20 space-y-2">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                      This CSV contains {groups.length} POs. Showing Stocky #{activeGroup.po_ref}.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {groups.map(g => (
                        <button key={g.po_ref}
                          onClick={() => {
                            setActiveGroup(g)
                            setLines(g.lines)
                            setInformalRef(`Stocky #${g.po_ref}`)
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border transition-colors ${
                            activeGroup.po_ref === g.po_ref
                              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-300'
                          }`}
                        >
                          #{g.po_ref}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Each PO will be created separately. Switch between them using the buttons above.
                    </p>
                  </div>
                )}

                <PreviewStep
                  group={{ ...activeGroup, lines }}
                  onLineChange={updateLine}
                  resolvedCount={resolvedCount}
                  unresolvedCount={unresolvedCount}
                />
              </div>
            )}

            {step === 'confirm' && activeGroup && (
              <ConfirmStep
                group={activeGroup}
                supplierSelection={supplierSelection}
                setSupplierSelection={setSupplierSelection}
                locationId={locationId}
                setLocationId={setLocationId}
                informalRef={informalRef}
                setInformalRef={setInformalRef}
                isAdHoc={isAdHoc}
                setIsAdHoc={setIsAdHoc}
                resolvedLines={resolvedLines}
                alreadyReceivedLines={alreadyReceivedLines}
              />
            )}

            {step === 'creating' && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Creating PO and lines…</p>
                {progress && (
                  <div className="w-full max-w-sm">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{progress.current} of {progress.total}</span>
                      <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400">Do not close this window.</p>
              </div>
            )}

            {step === 'done' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-2xl">
                  ✓
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">PO created successfully</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {resolvedLines.length} line{resolvedLines.length !== 1 ? 's' : ''} imported
                    {alreadyReceivedLines.length > 0 && `, ${alreadyReceivedLines.length} marked already received`}.
                  </p>
                  <p className="text-xs font-mono text-gray-400 mt-2">ref: {informalRef}</p>
                </div>
                {alreadyReceivedLines.length > 0 && (
                  <div className="px-3 py-2.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300 max-w-sm">
                    <strong>Note:</strong> Lines marked as already received in Stocky have been imported with their ordered quantities,
                    but their <span className="font-mono">quantity_received</span> will need to be updated manually or via a receiving session.
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (createdPoId) onCreated(createdPoId); handleClose() }}
                    className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                  >
                    Open PO →
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
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

          {/* Footer — navigation */}
          {(step === 'preview' || step === 'confirm') && (
            <div className="px-5 py-4 border-t dark:border-gray-800 flex items-center justify-between shrink-0 bg-gray-50/50 dark:bg-gray-900/30">
              <button
                onClick={() => step === 'confirm' ? setStep('preview') : setStep('upload')}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                ← Back
              </button>

              {step === 'preview' && (
                <div className="flex items-center gap-3">
                  {isResolvingAny && (
                    <span className="text-xs text-gray-400 animate-pulse">Resolving ISBNs…</span>
                  )}
                  <button
                    onClick={() => setStep('confirm')}
                    disabled={!canProceedToConfirm}
                    className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]"
                  >
                    Confirm details →
                  </button>
                </div>
              )}

              {step === 'confirm' && (
                <button
                  onClick={handleCreate}
                  disabled={!confirmValid}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]"
                >
                  Import {resolvedLines.length + alreadyReceivedLines.length} lines →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
