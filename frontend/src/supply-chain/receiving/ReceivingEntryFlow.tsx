// ReceivingEntryFlow.tsx
// Entry point for all receiving sessions — both standard PO and ad hoc.
//
// Route: /receiving/new
//
// Flow:
//   Step 1: Upload Packing Slip
//     Scan path (two-stage matching):
//       a) parse-and-lookup: text-based PO reference match (existing)
//          High confidence single match → 'reconcile'
//          Multiple matches → 'po_fuzzy'
//       b) matchSlipToPO: ISBN-based match (NEW #35)
//          Runs after parse-and-lookup when no text match found.
//          Strong single match (≥80% coverage) → 'reconcile'
//          Multiple candidates → 'isbn_match' (ranked list for staff to pick)
//          No match → ad hoc path
//     Manual path: live-filtered dropdown over receivable POs
//
//   Step 'reconcile' (NEW #35):
//     Side-by-side slip vs PO comparison. Staff review matched lines,
//     adjust quantities if needed, then confirm → navigate to wizard.
//
//   Step 'isbn_match' (NEW #35):
//     Ranked list of ISBN match candidates when coverage < 80%.
//     Staff select the correct PO → 'reconcile'.
//
//   Step 'slip_session' (NEW #50):
//     One slip fulfilling several POs (distributor carton). Dashboard to
//     receive each PO in any order. See MultiPOSlipSession.
//
//   Step 2 (ad hoc only): Supplier identification (#19)
//   Step 3: Line item entry
//   Step 4: Session summary → create PO + lines → redirect to wizard

import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  lookupProductByISBN,
  createPurchaseOrder,
  createPOLine,
  fetchPurchaseOrders,
  matchSlipToPO,
  POLookupResult,
  VariantSearchResult,
  POCandidate,
  SlipMatchCandidate,
} from '../../api/supplyChainApi'
import { SupplierAccount, SupplierParty, SupplierDetail } from '../suppliers/supplierTypes'
import { PurchaseOrder } from '../purchase-orders/purchaseOrderTypes'
import { useLocations } from '../hooks/useLocations'
import NewProductWizard from '../receiving/NewProductWizard'
import PackingSlipUpload, { ParsedSlipLine } from '../receiving/PackingSlipUpload'
import SupplierAccountPicker, { resolveAccountForLocation } from '../suppliers/SupplierAccountPicker'
import SlipReconciliationView from '../receiving/SlipReconciliationView'
import MultiPOSlipSession from '../receiving/MultiPOSlipSession'
import RightSidebar from '../../components/RightSidebar'

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

type LineResolution = 'pending' | 'resolving' | 'existing' | 'new' | 'skipped'

interface SessionLine {
  _key:            string
  isbn:            string
  quantity:        number
  unit_cost:       string
  title_from_slip: string
  resolution:      LineResolution
  existing_product?: VariantSearchResult & { current_stock?: number }
  new_product?: {
    shopify_product_id: string
    inventory_item_id:  string
    variant_id:         string
    title:              string
    missing_fields:     string[]
  }
  po_line_id?: string
}

type FlowStep =
  | 'po_lookup'
  | 'routing_confirm' // Staff confirms/overrides auto-detected PO routing before proceeding
  | 'isbn_match'      // ranked list of ISBN-based candidates
  | 'reconcile'       // side-by-side slip vs PO review
  | 'slip_session'    // one slip → multiple POs, dashboard
  | 'po_fuzzy'
  | 'po_received'
  | 'supplier'
  | 'lines'
  | 'new_product'
  | 'summary'
  | 'executing'
  | 'done'

// The routing decision the system made from ISBN matching — stored so
// RoutingConfirmStep can show it and staff can confirm or override.
type PendingRouting =
  | { type: 'multi_po' }
  | { type: 'single';    strongMatch: string }
  | { type: 'ambiguous' }
  | { type: 'no_match'  }

// ---------------------------------------------------------------------------
// Small shared primitives
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

function StepHeader({ step, label, sub }: { step: number | string; label: string; sub?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
          {step}
        </span>
        <h2 className="font-bold text-lg text-gray-900 dark:text-white">{label}</h2>
      </div>
      {sub && <p className="text-sm text-gray-500 dark:text-gray-400 ml-8">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ISBN match candidate list — shown when slip_coverage < 0.80 for all candidates
// ---------------------------------------------------------------------------

function ISBNMatchStep({
  candidates,
  onSelect,
  onReject,
  onReceiveAsMultiple,
}: {
  candidates: SlipMatchCandidate[]
  onSelect:   (c: SlipMatchCandidate) => void
  onReject:   () => void
  onReceiveAsMultiple?: () => void
}) {
  return (
    <div className="space-y-5">
      <StepHeader
        step={1}
        label="Possible PO matches"
        sub="The packing slip ISBNs partially match these open POs. Select the correct one or continue without a PO match."
      />
      {onReceiveAsMultiple && candidates.length >= 2 && (
        <div className="px-4 py-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-between gap-3">
          <p className="text-xs text-indigo-800 dark:text-indigo-200">
            Looks like this slip may cover <strong>several POs</strong> at once (one carton, multiple orders).
          </p>
          <button
            onClick={onReceiveAsMultiple}
            className="shrink-0 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
          >
            Receive as multiple POs →
          </button>
        </div>
      )}
      <div className="space-y-2">
        {candidates.map(c => (
          <button
            key={c.po_id}
            onClick={() => onSelect(c)}
            className="w-full text-left border dark:border-gray-700 rounded-lg px-4 py-3
                       hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm">{c.po_number}</span>
              <span className={`text-xs font-bold tabular-nums ${
                c.slip_coverage >= 0.6
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>{Math.round(c.slip_coverage * 100)}% match</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {c.supplier_name ?? c.account_label}
              {c.informal_ref && <span className="font-mono ml-1">· {c.informal_ref}</span>}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              {c.overlap_count} of {c.slip_total} slip ISBNs found · {c.po_open_total} lines open on PO
            </p>
          </button>
        ))}
      </div>
      <button
        onClick={onReject}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:underline"
      >
        None of these — create ad hoc receipt
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1: Upload Packing Slip
// ---------------------------------------------------------------------------

function POLookupStep({
  onExactMatch,
  onFuzzyMatches,
  onNoMatch,
  onSlipLinesReady,
  onCandidatesFound,
  onISBNMatchFound,
}: {
  onExactMatch:       (po: PurchaseOrder) => void
  onFuzzyMatches:     (pos: POLookupResult[]) => void
  onNoMatch:          (poNumber: string) => void
  onSlipLinesReady:   (lines: ParsedSlipLine[]) => void
  onCandidatesFound:  (candidates: POCandidate[], poReference: string) => void
  onISBNMatchFound:   (candidates: SlipMatchCandidate[], strong: string | null, slipLines: ParsedSlipLine[]) => void
}) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<PurchaseOrder[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen]           = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await fetchPurchaseOrders({ status: 'submitted,confirmed,partial', search: query.trim() || undefined, limit: 10 })
        setResults(data)
        setOpen(true)
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const handleSelect = (po: PurchaseOrder) => { setOpen(false); onExactMatch(po) }

  const statusBadgeClass = (status: string) => {
    if (status === 'confirmed') return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
    if (status === 'partial')   return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  }

  // Called by PackingSlipUpload when ISBN-based matching completes (#35)
  const handleISBNMatchFromUpload = useCallback((candidates: SlipMatchCandidate[], strong: string | null, slipLines: ParsedSlipLine[]) => {
    onISBNMatchFound(candidates, strong, slipLines)
  }, [onISBNMatchFound])

  return (
    <div className="space-y-5">
      <StepHeader step={1} label="Upload Packing Slip"
        sub="Scan the packing slip to auto-identify the PO and pre-fill lines, or search for a PO manually." />

      <div className="space-y-3">
        {!showScanner ? (
          <button type="button" onClick={() => setShowScanner(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed
                       border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300
                       hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20
                       text-sm font-semibold transition-colors">
            📷 Scan packing slip
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Scan document</p>
              <button type="button" onClick={() => setShowScanner(false)} className="text-xs text-gray-400 hover:underline">Hide</button>
            </div>
            <PackingSlipUpload
              onLinesAccepted={onSlipLinesReady}
              onPOCandidatesFound={onCandidatesFound}
              onISBNMatchFound={handleISBNMatchFromUpload}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">or</span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </div>

      <div className="space-y-2" ref={dropdownRef}>
        <div className="relative">
          <Label>Search POs awaiting receipt</Label>
          <div className="relative">
            <Input value={query} onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              placeholder="Type PO number, supplier, or reference…" />
            {searching && <div className="absolute right-3 top-2.5 w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
          </div>
          {open && results.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow-xl overflow-hidden max-h-72 overflow-y-auto">
              {results.map(po => (
                <button key={po.id} type="button" onMouseDown={() => handleSelect(po)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b dark:border-gray-800 last:border-0 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">{po.po_number}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase shrink-0 ${statusBadgeClass(po.status)}`}>{po.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{po.supplier_name ?? po.account_label ?? '—'}</p>
                  {po.informal_ref && <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">ref: {po.informal_ref}</p>}
                </button>
              ))}
            </div>
          )}
          {open && !searching && results.length === 0 && query.trim().length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow-xl px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
              No receivable POs match "{query}"
            </div>
          )}
        </div>
        <button onClick={() => onNoMatch('')}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:underline">
          No PO number — create ad hoc receipt
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1b: Fuzzy match confirmation (text-based)
// ---------------------------------------------------------------------------

function POFuzzyStep({ candidates, slipPoNumber, onSelect, onReject }: {
  candidates: POLookupResult[]; slipPoNumber: string
  onSelect: (po: PurchaseOrder) => void; onReject: () => void
}) {
  const exact = candidates.filter(c => c.match_type === 'exact')
  const fuzzy = candidates.filter(c => c.match_type === 'fuzzy')
  return (
    <div className="space-y-5">
      <StepHeader step={1} label="Confirm PO"
        sub={exact.length > 1 ? `Multiple POs match "${slipPoNumber}" — select the correct one.` : `"${slipPoNumber}" wasn't found exactly. These POs may be a match.`} />
      {exact.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Exact matches</p>
          {exact.map(po => <POCandidateRow key={po.id} po={po} onSelect={onSelect} />)}
        </div>
      )}
      {fuzzy.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Possible matches</p>
          {fuzzy.map(po => <POCandidateRow key={po.id} po={po} onSelect={onSelect} />)}
        </div>
      )}
      <button onClick={onReject} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:underline">
        None of these — create ad hoc PO
      </button>
    </div>
  )
}

function POCandidateRow({ po, onSelect }: { po: POLookupResult; onSelect: (po: PurchaseOrder) => void }) {
  return (
    <button onClick={() => onSelect(po)}
      className="w-full text-left border dark:border-gray-700 rounded-lg px-4 py-3 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
      <div className="flex items-center justify-between">
        <span className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm">{po.po_number}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
          po.match_type === 'exact' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
        }`}>{po.match_type}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        {po.supplier_name ?? po.account_label} · {po.status} · {po.ordered_at ? new Date(po.ordered_at).toLocaleDateString() : '—'}
      </p>
      {po.informal_ref && <p className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-0.5">ref: {po.informal_ref}</p>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Supplier identification
// ---------------------------------------------------------------------------

function SupplierStep({ onSelect }: { onSelect: (detail: SupplierDetail) => void }) {
  const HQ_LOCATION_ID = 'gid://shopify/Location/40052293765'
  const [selection, setSelection] = useState<{ party: SupplierParty; accounts: SupplierAccount[] } | null>(null)
  const effectiveAccount = selection ? resolveAccountForLocation(selection.accounts, HQ_LOCATION_ID) : null

  const handleConfirm = () => {
    if (!selection || !effectiveAccount) return
    onSelect({ party: selection.party, accounts: selection.accounts } as SupplierDetail)
  }

  return (
    <div className="space-y-5">
      <StepHeader step={2} label="Identify Publisher"
        sub="Search by publisher name. The system will resolve the account and ordering pathway." />
      <SupplierAccountPicker value={selection} effectiveAccount={effectiveAccount}
        onChange={setSelection} label="Publisher or distributor"
        placeholder="Graywolf Press, Phaidon, Brian Voll…" autoFocus />
      {selection && effectiveAccount && (
        <button onClick={handleConfirm}
          className="w-full px-4 py-2.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
          Continue with {selection.party.name} →
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Line item entry
// ---------------------------------------------------------------------------

function LineEntryStep({ lines, onAddLine, onUpdateLine, onRemoveLine, onOpenNewProduct, onDone }: {
  lines: SessionLine[]
  onAddLine:        (isbn: string, qty: number, cost: string, title: string) => void
  onUpdateLine:     (key: string, patch: Partial<SessionLine>) => void
  onRemoveLine:     (key: string) => void
  onOpenNewProduct: (line: SessionLine) => void
  onDone:           () => void
}) {
  const [isbn, setIsbn]     = useState('')
  const [qty, setQty]       = useState('1')
  const [cost, setCost]     = useState('')
  const [title, setTitle]   = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!isbn.trim()) return
    setAdding(true); setAddError(null)
    try { await onAddLine(isbn.trim(), parseInt(qty) || 1, cost, title); setIsbn(''); setQty('1'); setCost(''); setTitle('') }
    catch (e) { setAddError(e instanceof Error ? e.message : 'Failed to add line') }
    finally { setAdding(false) }
  }

  const resolvedCount = lines.filter(l => l.resolution !== 'pending' && l.resolution !== 'resolving').length

  return (
    <div className="space-y-5">
      <StepHeader step={3} label="Line Items"
        sub="Enter each ISBN from the packing slip. The system will resolve it to an existing product or prompt you to create a new one." />
      <div className="border dark:border-gray-700 rounded-lg p-4 space-y-3 bg-gray-50/50 dark:bg-gray-900/30">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Add line item</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 sm:col-span-1"><Label required>ISBN</Label>
            <Input value={isbn} onChange={e => setIsbn(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="9780231221290" autoFocus />
          </div>
          <div><Label required>Qty</Label><Input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div><Label>Unit cost ($)</Label><Input type="number" min={0} step={0.01} value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00" /></div>
        </div>
        <div><Label>Title (from slip, optional)</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="On Taste" /></div>
        {addError && <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>}
        <button onClick={handleAdd} disabled={!isbn.trim() || adding}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
          {adding ? 'Resolving…' : '+ Add line'}
        </button>
      </div>

      {lines.length > 0 && (
        <div className="space-y-2">
          {lines.map(line => (
            <LineItemRow key={line._key} line={line}
              onUpdateQty={qty => onUpdateLine(line._key, { quantity: qty })}
              onSkip={() => onUpdateLine(line._key, { resolution: 'skipped' })}
              onRemove={() => onRemoveLine(line._key)}
              onCreateProduct={() => onOpenNewProduct(line)} />
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">{resolvedCount}/{lines.length} lines resolved</p>
          <button onClick={onDone}
            disabled={lines.some(l => l.resolution === 'pending' || l.resolution === 'resolving')}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
            Review summary →
          </button>
        </div>
      )}
    </div>
  )
}

function LineItemRow({ line, onUpdateQty, onSkip, onRemove, onCreateProduct }: {
  line: SessionLine; onUpdateQty: (qty: number) => void
  onSkip: () => void; onRemove: () => void; onCreateProduct: () => void
}) {
  const statusColor = {
    pending:   'border-gray-200 dark:border-gray-700',
    resolving: 'border-blue-300 dark:border-blue-700 animate-pulse',
    existing:  'border-green-300 dark:border-green-700',
    new:       'border-purple-300 dark:border-purple-700',
    skipped:   'border-gray-200 dark:border-gray-700 opacity-50',
  }[line.resolution]

  return (
    <div className={`border rounded-lg p-3 transition-colors ${statusColor}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{line.isbn}</span>
            {line.resolution === 'resolving' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-semibold">Resolving…</span>}
            {line.resolution === 'existing'  && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-semibold">✓ In catalog</span>}
            {line.resolution === 'new'       && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-semibold">✓ New product</span>}
            {line.resolution === 'pending'   && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-semibold">Not found</span>}
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 truncate">
            {line.existing_product?.title ?? line.new_product?.title ?? line.title_from_slip ?? '—'}
          </p>
          {line.resolution === 'new' && line.new_product?.missing_fields?.length ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">⚠ Missing: {line.new_product.missing_fields.join(', ')}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input type="number" min={1} value={line.quantity}
            onChange={e => onUpdateQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 px-2 py-1 border rounded text-sm text-center dark:bg-gray-800 dark:text-white dark:border-gray-600" />
          <button onClick={onRemove} className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none">×</button>
        </div>
      </div>
      {line.resolution === 'pending' && (
        <div className="flex gap-2 mt-2 pt-2 border-t dark:border-gray-700">
          <button onClick={onCreateProduct} className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold">+ Create new product</button>
          <button onClick={onSkip} className="text-xs text-gray-400 hover:underline">Skip this line</button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Session summary
// ---------------------------------------------------------------------------

function SummaryStep({ lines, supplierDetail, existingPO, slipPoNumber, locationName, onBack, onConfirm, executing, error }: {
  lines: SessionLine[]; supplierDetail: SupplierDetail | null
  existingPO: PurchaseOrder | null; slipPoNumber: string
  locationName: (id: string) => string
  onBack: () => void; onConfirm: () => void; executing: boolean; error: string | null
}) {
  const existing    = lines.filter(l => l.resolution === 'existing')
  const newProducts = lines.filter(l => l.resolution === 'new')
  const skipped     = lines.filter(l => l.resolution === 'skipped')
  const totalQty    = lines.filter(l => l.resolution !== 'skipped').reduce((s, l) => s + l.quantity, 0)

  return (
    <div className="space-y-5">
      <StepHeader step={4} label="Review & Confirm" sub="Review the session before creating the PO and lines." />
      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Purchase Order</p>
        </div>
        <div className="px-4 py-3 space-y-1.5 text-sm">
          {existingPO ? (
            <><div className="flex justify-between"><span className="text-gray-500">PO</span><span className="font-mono font-semibold">{existingPO.po_number}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="capitalize">{existingPO.status}</span></div></>
          ) : (
            <><div className="flex justify-between"><span className="text-gray-500">Type</span><span className="text-amber-600 dark:text-amber-400 font-semibold">New ad hoc PO</span></div>
            {slipPoNumber && <div className="flex justify-between"><span className="text-gray-500">Slip ref</span><span className="font-mono text-xs">{slipPoNumber}</span></div>}</>
          )}
          <div className="flex justify-between"><span className="text-gray-500">Supplier</span><span>{supplierDetail?.party.name ?? existingPO?.supplier_name ?? '—'}</span></div>
        </div>
      </div>

      {existing.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400">Existing products ({existing.length})</p>
            <p className="text-xs text-gray-400">{existing.reduce((s,l) => s+l.quantity, 0)} units</p>
          </div>
          {existing.map(line => (
            <div key={line._key} className="px-4 py-2.5 border-b dark:border-gray-800 last:border-0 flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{line.existing_product?.title ?? line.title_from_slip ?? line.isbn}</p>
                <p className="text-xs font-mono text-gray-400">{line.isbn}</p>
              </div>
              <div className="text-right shrink-0 ml-4">
                <p className="font-semibold">× {line.quantity}</p>
                {line.unit_cost && <p className="text-xs text-gray-400">${line.unit_cost} ea</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {newProducts.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">New products — will be created in Shopify ({newProducts.length})</p>
            <p className="text-xs text-gray-400">{newProducts.reduce((s,l) => s+l.quantity, 0)} units</p>
          </div>
          {newProducts.map(line => (
            <div key={line._key} className="px-4 py-2.5 border-b dark:border-gray-800 last:border-0 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{line.new_product?.title ?? line.title_from_slip ?? line.isbn}</p>
                <p className="font-semibold shrink-0 ml-4">× {line.quantity}</p>
              </div>
              {line.new_product?.missing_fields?.length ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">⚠ Follow up in Shopify: {line.new_product.missing_fields.join(', ')}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {skipped.length > 0 && <p className="text-xs text-gray-400 dark:text-gray-500">{skipped.length} line{skipped.length !== 1 ? 's' : ''} skipped</p>}
      {error && <div className="px-3 py-2.5 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">{error}</div>}
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} disabled={executing}
          className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          ← Back
        </button>
        <button onClick={onConfirm}
          disabled={executing || lines.filter(l => l.resolution !== 'skipped').length === 0}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors flex-1">
          {executing ? 'Creating…' : `Confirm & create PO (${totalQty} units)`}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RoutingConfirmStep — shown after ISBN matching, before any navigation.
//
// Tells staff what the system found and where it intends to go, and lets
// them confirm, pick a different single PO, switch to multi-PO mode, or
// go ad hoc. This is the override point for all ISBN-match routing.
// ---------------------------------------------------------------------------

function RoutingConfirmStep({
  pending,
  candidates,
  slipLines,
  onConfirm,
  onOverrideSingle,
  onOverrideMulti,
  onAdHoc,
  onBack,
}: {
  pending:          PendingRouting
  candidates:       SlipMatchCandidate[]
  slipLines:        ParsedSlipLine[]
  onConfirm:        () => void
  onOverrideSingle: (c: SlipMatchCandidate) => void
  onOverrideMulti:  (candidates: SlipMatchCandidate[]) => void
  onAdHoc:          () => void
  onBack:           () => void
}) {
  const [mode, setMode] = useState<'confirm' | 'pick_single' | 'pick_multi'>('confirm')
  // For multi-PO override: staff toggle which candidates to include
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(candidates.map(c => c.po_id))
  )

  const toggleCandidate = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Human-readable description of what was detected
  const detectionLabel = (() => {
    if (pending.type === 'no_match') return { icon: '○', color: 'text-gray-500 dark:text-gray-400', text: 'No matching POs found', sub: 'No open PO lines matched the ISBNs on this slip.' }
    if (pending.type === 'multi_po') return { icon: '⊞', color: 'text-indigo-600 dark:text-indigo-400', text: `Multi-PO slip — ${candidates.length} POs detected`, sub: 'The ISBNs split cleanly across multiple open POs. Will open the multi-PO receive dashboard.' }
    if (pending.type === 'single') {
      const top = candidates[0]
      return { icon: '✓', color: 'text-green-600 dark:text-green-400', text: `Matched to ${top.po_number}`, sub: `${Math.round(top.slip_coverage * 100)}% of slip ISBNs found · ${top.supplier_name ?? top.account_label}${top.informal_ref ? ` · ${top.informal_ref}` : ''}` }
    }
    return { icon: '~', color: 'text-amber-600 dark:text-amber-400', text: `${candidates.length} possible PO${candidates.length !== 1 ? 's' : ''} — no clear winner`, sub: 'Coverage below 80% for all candidates. Review and select the correct PO.' }
  })()

  if (mode === 'pick_single') {
    return (
      <div className="space-y-4">
        <StepHeader step={1} label="Select PO" sub="Choose which PO this slip belongs to." />
        <div className="space-y-2">
          {candidates.map(c => (
            <button key={c.po_id} onClick={() => onOverrideSingle(c)}
              className="w-full text-left border dark:border-gray-700 rounded-lg px-4 py-3
                         hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm">{c.po_number}</span>
                <span className={`text-xs font-bold tabular-nums ${c.slip_coverage >= 0.6 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                  {Math.round(c.slip_coverage * 100)}% match
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {c.supplier_name ?? c.account_label}{c.informal_ref && <span className="font-mono ml-1">· {c.informal_ref}</span>}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                {c.overlap_count} of {c.slip_total} slip ISBNs found · {c.po_open_total} lines open
              </p>
            </button>
          ))}
        </div>
        <button onClick={() => setMode('confirm')} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">← Back</button>
      </div>
    )
  }

  if (mode === 'pick_multi') {
    const selected = candidates.filter(c => selectedIds.has(c.po_id))
    return (
      <div className="space-y-4">
        <StepHeader step={1} label="Select POs for session"
          sub="Choose which POs this slip covers. Toggle any that don't apply." />
        <div className="space-y-2">
          {candidates.map(c => {
            const on = selectedIds.has(c.po_id)
            return (
              <button key={c.po_id} onClick={() => toggleCandidate(c.po_id)}
                className={`w-full text-left border rounded-lg px-4 py-3 transition-colors ${
                  on
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-600'
                    : 'border-gray-200 dark:border-gray-700 opacity-50'
                }`}>
                <div className="flex items-center gap-3">
                  <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center text-[10px] font-bold
                    ${on ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                    {on ? '✓' : ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm">{c.po_number}</span>
                      <span className="text-xs text-gray-400">{Math.round(c.slip_coverage * 100)}%</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {c.supplier_name ?? c.account_label}{c.informal_ref && <span className="font-mono ml-1">· {c.informal_ref}</span>}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setMode('confirm')} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            ← Back
          </button>
          <button
            onClick={() => onOverrideMulti(selected)}
            disabled={selected.length < 1}
            className="flex-1 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            Open session with {selected.length} PO{selected.length !== 1 ? 's' : ''} →
          </button>
        </div>
      </div>
    )
  }

  // Default: confirm view
  return (
    <div className="space-y-5">
      <StepHeader step={1} label="Confirm routing"
        sub="Review what was found before proceeding. You can change the destination if the system got it wrong." />

      {/* Detection result card */}
      <div className="border dark:border-gray-700 rounded-lg px-4 py-3 space-y-1">
        <div className="flex items-center gap-2">
          <span className={`text-base ${detectionLabel.color}`}>{detectionLabel.icon}</span>
          <p className={`text-sm font-semibold ${detectionLabel.color}`}>{detectionLabel.text}</p>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">{detectionLabel.sub}</p>
        {pending.type !== 'no_match' && (
          <p className="text-xs text-gray-400 dark:text-gray-500 ml-6 mt-1">
            {slipLines.length} slip line{slipLines.length !== 1 ? 's' : ''} ·{' '}
            {candidates.length} candidate PO{candidates.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Primary action — confirm what was detected */}
      <button
        onClick={onConfirm}
        className="w-full px-4 py-2.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
      >
        {pending.type === 'multi_po'  && 'Confirm — open multi-PO session →'}
        {pending.type === 'single'    && `Confirm — receive against ${candidates[0]?.po_number} →`}
        {pending.type === 'ambiguous' && 'Continue — choose from matched POs →'}
        {pending.type === 'no_match'  && 'Continue — create ad hoc receipt →'}
      </button>

      {/* Override options */}
      {candidates.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
            Override detection
          </p>
          <div className="divide-y dark:divide-gray-800">
            {/* Single PO override */}
            {(pending.type !== 'single' || candidates.length > 1) && (
              <button onClick={() => setMode('pick_single')}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Receive against a single PO</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pick one PO from the list of candidates</p>
              </button>
            )}
            {/* Multi-PO override */}
            {(pending.type !== 'multi_po') && candidates.length >= 2 && (
              <button onClick={() => setMode('pick_multi')}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Open multi-PO session</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Receive across {candidates.length} POs in one session — choose which to include
                </p>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ad hoc escape hatch */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-gray-400 dark:text-gray-500 hover:underline">← Back to scan</button>
        <button onClick={onAdHoc} className="text-sm text-gray-400 dark:text-gray-500 hover:underline">Skip — create ad hoc receipt</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ReceivingEntryFlow() {
  const { locationName } = useLocations()

  const [step, setStep]                   = useState<FlowStep>('po_lookup')
  const [docsFilePath, setDocsFilePath]   = useState<string | null>(null)
  const [slipPoNumber, setSlipPoNumber]   = useState('')
  const [fuzzyMatches, setFuzzyMatches]   = useState<POLookupResult[]>([])
  const [isbnCandidates, setIsbnCandidates] = useState<SlipMatchCandidate[]>([])
  const [reconcileCandidate, setReconcileCandidate] = useState<SlipMatchCandidate | null>(null)
  const [sessionCandidates, setSessionCandidates] = useState<SlipMatchCandidate[]>([])
  const [sessionSlipLines, setSessionSlipLines]   = useState<ParsedSlipLine[]>([])
  const [pendingRouting, setPendingRouting] = useState<PendingRouting | null>(null)
  const [existingPO, setExistingPO]       = useState<PurchaseOrder | null>(null)
  const [supplierDetail, setSupplierDetail] = useState<SupplierDetail | null>(null)
  const [lines, setLines]                 = useState<SessionLine[]>([])
  const [newProductTargetKey, setNewProductTargetKey] = useState<string | null>(null)
  const [executing, setExecuting]         = useState(false)
  const [execError, setExecError]         = useState<string | null>(null)
  const navigate = useNavigate()

  const HQ_LOCATION_ID = 'gid://shopify/Location/40052293765'

  // ── PO resolution ────────────────────────────────────────────────────────

  const handleExactMatch = useCallback((po: PurchaseOrder) => {
    if (po.status === 'received') { setExistingPO(po); setStep('po_received'); return }
    navigate(`/receiving/wizard?po=${po.id}`)
  }, [navigate])

  const handleFuzzyMatches = useCallback((matches: POLookupResult[]) => {
    setFuzzyMatches(matches); setStep('po_fuzzy')
  }, [])

  const handleNoMatch = useCallback((poNumber: string) => {
    setSlipPoNumber(poNumber); setStep('supplier')
  }, [])

  const handleFuzzySelect = useCallback((po: PurchaseOrder) => {
    if (po.status === 'received') { setExistingPO(po); setStep('po_received'); return }
    navigate(`/receiving/wizard?po=${po.id}`)
  }, [navigate])

  // Text-based PO candidates from parse-and-lookup
  const handleCandidatesFound = useCallback((candidates: POCandidate[], poRef: string) => {
    setSlipPoNumber(poRef)
    if (candidates.length === 1) {
      const c = candidates[0]
      if (c.status === 'received') {
        setExistingPO({ id: c.id, po_number: c.po_number, status: c.status } as PurchaseOrder)
        setStep('po_received')
      } else {
        // Single text match — navigate directly to wizard
        navigate(`/receiving/wizard?po=${c.id}`)
      }
    } else {
      setFuzzyMatches(candidates.map(c => ({
        id: c.id, po_number: c.po_number, status: c.status,
        informal_ref: c.informal_ref, supplier_name: c.supplier_name,
        account_label: c.account_label, supplier_account_id: c.supplier_account_id,
        destination_location_id: c.destination_location_id,
        match_type: c.match_type === 'exact' ? 'exact' : 'fuzzy',
      } as POLookupResult)))
      setStep('po_fuzzy')
    }
  }, [navigate])

  // ISBN-based PO match from PackingSlipUpload (#35, #50)
  // Instead of routing immediately, park the detection result and show
  // routing_confirm so staff can verify or override before proceeding.
  const handleISBNMatchFound = useCallback((candidates: SlipMatchCandidate[], strongMatch: string | null, slipLines: ParsedSlipLine[]) => {
    // Always store candidates + slip lines — needed for all routing outcomes
    setIsbnCandidates(candidates)
    setSessionCandidates(candidates)
    setSessionSlipLines(slipLines)

    if (candidates.length === 0) {
      setPendingRouting({ type: 'no_match' })
    } else {
      // Compute the same split-slip detection as before
      const ownedByCandidate = candidates.map(c => {
        const set = new Set<string>()
        for (const r of c.reconciliation) {
          if ((r.status === 'matched' || r.status === 'matched_fuzzy') && r.isbn) set.add(r.isbn.trim())
        }
        return set
      })
      const substantial = ownedByCandidate.filter(s => s.size >= 2)
      let isMultiPO = false
      if (substantial.length >= 2) {
        const seen = new Map<string, number>()
        for (const set of substantial) for (const isbn of set) seen.set(isbn, (seen.get(isbn) ?? 0) + 1)
        const shared = [...seen.values()].filter(n => n > 1).length
        const distinct = seen.size
        isMultiPO = distinct > 0 && shared / distinct < 0.25
      }

      if (isMultiPO) {
        setPendingRouting({ type: 'multi_po' })
      } else if (strongMatch) {
        const top = candidates.find(c => c.po_id === strongMatch) ?? candidates[0]
        setReconcileCandidate(top)
        setPendingRouting({ type: 'single', strongMatch })
      } else {
        setPendingRouting({ type: 'ambiguous' })
      }
    }

    setStep('routing_confirm')
  }, [])

  // Called from RoutingConfirmStep when staff confirm the auto-detected routing
  const handleRoutingConfirmed = useCallback(() => {
    if (!pendingRouting) return
    if (pendingRouting.type === 'multi_po') {
      setStep('slip_session')
    } else if (pendingRouting.type === 'single') {
      setStep('reconcile')
    } else if (pendingRouting.type === 'ambiguous') {
      setStep('isbn_match')
    } else {
      // no_match — go ad hoc
      setStep('supplier')
    }
  }, [pendingRouting])

  // Called from RoutingConfirmStep when staff pick a single PO override
  const handleRoutingOverrideSingle = useCallback((c: SlipMatchCandidate) => {
    setReconcileCandidate(c)
    // Promote to sessionCandidates in case they later want multi-PO
    if (!sessionCandidates.find(x => x.po_id === c.po_id)) {
      setSessionCandidates(prev => [c, ...prev])
    }
    setStep('reconcile')
  }, [sessionCandidates])

  // Called from RoutingConfirmStep when staff choose to open multi-PO session
  // with a potentially different set of candidates
  const handleRoutingOverrideMulti = useCallback((candidates: SlipMatchCandidate[]) => {
    setSessionCandidates(candidates)
    setStep('slip_session')
  }, [])

  // Called from RoutingConfirmStep when staff bypass PO matching entirely
  const handleRoutingOverrideAdHoc = useCallback(() => {
    setStep('supplier')
  }, [])

  // Staff selects from the ISBN match ranked list
  const handleISBNCandidateSelect = useCallback((c: SlipMatchCandidate) => {
    setReconcileCandidate(c)
    setStep('reconcile')
  }, [])

  // Staff confirms from the reconciliation view → open wizard
  const handleReconcileConfirm = useCallback((poId: string, _quantities: Record<string, number>) => {
    // The wizard's initLines() will pre-fill from the PO detail.
    // We navigate with the PO id — the wizard handles partial pre-selection.
    navigate(`/receiving/wizard?po=${poId}`)
  }, [navigate])

  const handleSupplierSelect = useCallback((detail: SupplierDetail) => {
    setSupplierDetail(detail); setStep('lines')
  }, [])

  // ── Line management ──────────────────────────────────────────────────────

  const addLine = useCallback(async (isbn: string, qty: number, cost: string, titleFromSlip: string) => {
    const key = crypto.randomUUID()
    setLines(prev => [...prev, { _key: key, isbn, quantity: qty, unit_cost: cost, title_from_slip: titleFromSlip, resolution: 'resolving' }])
    try {
      const results = await lookupProductByISBN(isbn)
      if (results.length > 0) {
        setLines(prev => prev.map(l => l._key === key ? {
          ...l, resolution: 'existing', existing_product: results[0], title_from_slip: titleFromSlip || results[0].title,
        } : l))
      } else {
        setLines(prev => prev.map(l => l._key === key ? { ...l, resolution: 'pending' } : l))
      }
    } catch {
      setLines(prev => prev.map(l => l._key === key ? { ...l, resolution: 'pending' } : l))
    }
  }, [])

  const handleSlipLinesReadyFull = useCallback(async (slipLines: ParsedSlipLine[]) => {
    for (const sl of slipLines) {
      if (!sl.isbn && !sl.title) continue
      await addLine(sl.isbn ?? '', sl.quantity ?? 1, sl.unit_cost ? String(sl.unit_cost) : '', sl.title ?? '')
    }
    setStep('supplier')
  }, [addLine])

  const handleSlipLinesAccepted = useCallback(async (slipLines: ParsedSlipLine[]) => {
    for (const sl of slipLines) {
      if (!sl.isbn && !sl.title) continue
      await addLine(sl.isbn ?? '', sl.quantity ?? 1, sl.unit_cost ? String(sl.unit_cost) : '', sl.title ?? '')
    }
  }, [addLine])

  const updateLine  = useCallback((key: string, patch: Partial<SessionLine>) => { setLines(prev => prev.map(l => l._key === key ? { ...l, ...patch } : l)) }, [])
  const removeLine  = useCallback((key: string) => { setLines(prev => prev.filter(l => l._key !== key)) }, [])
  const openNewProduct = useCallback((line: SessionLine) => { setNewProductTargetKey(line._key); setStep('new_product') }, [])

  const handleNewProductCreated = useCallback((productId: string, inventoryItemId: string, variantId: string, title: string, missingFields: string[]) => {
    if (!newProductTargetKey) return
    setLines(prev => prev.map(l => l._key === newProductTargetKey ? {
      ...l, resolution: 'new', new_product: { shopify_product_id: productId, inventory_item_id: inventoryItemId, variant_id: variantId, title, missing_fields: missingFields },
    } : l))
    setNewProductTargetKey(null); setStep('lines')
  }, [newProductTargetKey])

  // ── Execute (ad hoc PO creation path) ───────────────────────────────────

  const handleConfirm = useCallback(async () => {
    setExecuting(true); setExecError(null)
    try {
      const activeLines     = lines.filter(l => l.resolution !== 'skipped')
      const primaryAccount  = supplierDetail?.accounts.find(a => a.is_primary && a.is_active) ?? supplierDetail?.accounts[0]
      if (!primaryAccount && !existingPO) throw new Error('No supplier account available — cannot create PO')

      let poId = existingPO?.id ?? null
      if (!poId) {
        const po = await createPurchaseOrder({
          supplier_account_id:     primaryAccount!.id,
          destination_location_id: HQ_LOCATION_ID,
          is_ad_hoc:               true,
          ad_hoc_source:           'packing_slip',
          informal_ref:            slipPoNumber || undefined,
          notes:                   'Created via receiving entry flow',
        })
        poId = po.id
      }

      for (const line of activeLines) {
        const inventoryItemId = line.existing_product?.inventory_item_id ?? line.new_product?.inventory_item_id
        const variantId       = line.existing_product?.variant_id ?? line.new_product?.variant_id
        if (!inventoryItemId || !variantId) continue
        await createPOLine(poId, {
          inventory_item_id: inventoryItemId, variant_id: variantId,
          quantity_ordered:  line.quantity,
          unit_cost:         line.unit_cost ? parseFloat(line.unit_cost) : undefined,
        })
      }
      navigate(`/receiving/wizard?po=${poId}`)
    } catch (e) {
      setExecError(e instanceof Error ? e.message : 'Failed to create PO')
      setExecuting(false)
    }
  }, [lines, supplierDetail, existingPO, slipPoNumber, navigate])

  // ── Render ───────────────────────────────────────────────────────────────

  if (step === 'new_product' && newProductTargetKey) {
    const targetLine = lines.find(l => l._key === newProductTargetKey)
    if (!targetLine) { setStep('lines'); return null }
    return (
      <NewProductWizard
        prefill={{ isbn: targetLine.isbn, title: targetLine.title_from_slip ?? '', unit_cost: targetLine.unit_cost, supplier_party: supplierDetail?.party ?? null }}
        onCreated={(productId, inventoryItemId, variantId, title, missingFields) =>
          handleNewProductCreated(productId, inventoryItemId, variantId, title, missingFields)}
        onCancel={() => { setNewProductTargetKey(null); setStep('lines') }}
      />
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-4">
        <button onClick={() => navigate('/receiving')}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
          <span className="text-base leading-none">←</span> Receiving
        </button>
      </div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">New Receipt</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Receive stock from a packing slip — standard PO or ad hoc.</p>
        </div>
        <button onClick={() => setDocsFilePath('/docs/supply-chain-receiving-intake.md')}
          className="shrink-0 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
          View Help Guide
        </button>
      </div>

      {step === 'po_lookup' && (
        <POLookupStep
          onExactMatch={handleExactMatch}
          onFuzzyMatches={handleFuzzyMatches}
          onNoMatch={handleNoMatch}
          onSlipLinesReady={handleSlipLinesReadyFull}
          onCandidatesFound={handleCandidatesFound}
          onISBNMatchFound={handleISBNMatchFound}
        />
      )}

      {/* Routing confirmation — always shown after ISBN matching, before navigating */}
      {step === 'routing_confirm' && pendingRouting && (
        <RoutingConfirmStep
          pending={pendingRouting}
          candidates={sessionCandidates}
          slipLines={sessionSlipLines}
          onConfirm={handleRoutingConfirmed}
          onOverrideSingle={handleRoutingOverrideSingle}
          onOverrideMulti={handleRoutingOverrideMulti}
          onAdHoc={handleRoutingOverrideAdHoc}
          onBack={() => setStep('po_lookup')}
        />
      )}

      {/* ISBN-based candidate list (#35) */}
      {step === 'isbn_match' && (
        <ISBNMatchStep
          candidates={isbnCandidates}
          onSelect={handleISBNCandidateSelect}
          onReject={() => setStep('supplier')}
          onReceiveAsMultiple={() => setStep('slip_session')}
        />
      )}

      {/* Reconciliation review (#35) */}
      {step === 'reconcile' && reconcileCandidate && (
        <SlipReconciliationView
          candidate={reconcileCandidate}
          onConfirm={handleReconcileConfirm}
          onBack={() => {
            // Back to whichever step preceded reconcile
            setStep(isbnCandidates.length > 1 ? 'isbn_match' : 'po_lookup')
          }}
        />
      )}

      {/* Multi-PO slip session dashboard (#50) */}
      {step === 'slip_session' && (
        <MultiPOSlipSession
          slipLines={sessionSlipLines}
          candidates={sessionCandidates}
          locationName={locationName}
          onExit={() => setStep('po_lookup')}
        />
      )}

      {step === 'po_fuzzy' && (
        <POFuzzyStep candidates={fuzzyMatches} slipPoNumber={slipPoNumber}
          onSelect={handleFuzzySelect} onReject={() => setStep('supplier')} />
      )}

      {step === 'po_received' && existingPO && (
        <div className="space-y-5">
          <StepHeader step={1} label="Already Received" sub="This PO has already been fully received." />
          <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border-b dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400 font-semibold text-sm">✓ Received</span>
                <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{existingPO.po_number}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{existingPO.supplier_name ?? existingPO.account_label}</p>
            </div>
            <div className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <p>This PO was already received. No further inventory adjustments can be made against it.</p>
              <p>If additional stock has arrived, start a new ad hoc receipt.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setStep('po_lookup'); setExistingPO(null) }}
              className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              ← Try another PO
            </button>
            <button onClick={() => { setExistingPO(null); setStep('supplier') }}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
              New ad hoc receipt →
            </button>
          </div>
        </div>
      )}

      {step === 'supplier' && <SupplierStep onSelect={handleSupplierSelect} />}

      {step === 'lines' && (
        <>
          <div className="mb-5 px-3 py-2.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm flex items-center justify-between">
            <span className="text-blue-800 dark:text-blue-200 font-medium">{supplierDetail?.party.name ?? existingPO?.supplier_name}</span>
            {slipPoNumber && <span className="text-xs font-mono text-blue-500 dark:text-blue-400">ref: {slipPoNumber}</span>}
          </div>
          {lines.length === 0 && (
            <div className="mb-6">
              <PackingSlipUpload onLinesAccepted={handleSlipLinesAccepted} />
            </div>
          )}
          <LineEntryStep lines={lines} onAddLine={addLine} onUpdateLine={updateLine}
            onRemoveLine={removeLine} onOpenNewProduct={openNewProduct} onDone={() => setStep('summary')} />
        </>
      )}

      {step === 'summary' && (
        <SummaryStep lines={lines} supplierDetail={supplierDetail} existingPO={existingPO}
          slipPoNumber={slipPoNumber} locationName={locationName}
          onBack={() => setStep('lines')} onConfirm={handleConfirm}
          executing={executing} error={execError} />
      )}

      {docsFilePath && (
        <RightSidebar
          title="Receiving Intake Guide"
          docsFilePath={docsFilePath}
          onClose={() => setDocsFilePath(null)}
        />
      )}
    </div>
  )
}
