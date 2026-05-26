// ReceivingEntryFlow.tsx
// Entry point for all receiving sessions — both standard PO and ad hoc.
//
// Route: /receiving/new
//
// Flow:
//   Step 1: PO Resolution
//     - Staff enter PO number from packing slip (or skip if not present)
//     - System looks up against PO registry
//     - Exact match → proceed to standard ReceivingWizard
//     - Fuzzy match → staff confirm which PO
//     - No match → ad hoc path
//
//   Step 2 (ad hoc only): Supplier identification
//     - Staff search for supplier or create new
//
//   Step 3: Line item entry
//     - Staff enter ISBNs one by one (or will be populated from packing slip scan)
//     - Each ISBN is resolved: existing product or new
//     - New products trigger NewProductWizard inline
//
//   Step 4: Session summary
//     - All lines shown with resolution status
//     - Missing fields flagged per new product
//     - Staff confirm → execute (create PO + add lines)
//     - After PO is created and lines added, redirect to ReceivingWizard
//       to fire the actual inventory adjustments

import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  lookupPurchaseOrders, lookupProductByISBN,
  fetchSuppliers, fetchSupplierDetail,
  createPurchaseOrder, createPOLine,
  POLookupResult, VariantSearchResult,
} from '../../api/supplyChainApi'
import { SupplierParty, SupplierDetail } from '../suppliers/supplierTypes'
import { PurchaseOrder } from '../purchase-orders/purchaseOrderTypes'
import { useLocations } from '../hooks/useLocations'
import NewProductWizard from '../receiving/NewProductWizard'

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

type LineResolution = 'pending' | 'resolving' | 'existing' | 'new' | 'skipped'

interface SessionLine {
  _key: string
  isbn: string
  quantity: number
  unit_cost: string
  title_from_slip: string
  resolution: LineResolution
  // Populated after resolution
  existing_product?: VariantSearchResult & { current_stock?: number }
  new_product?: {
    shopify_product_id: string
    inventory_item_id: string
    variant_id: string
    title: string
    missing_fields: string[]
  }
  po_line_id?: string // set after PO line is created
}

type FlowStep =
  | 'po_lookup'        // Step 1: Enter/lookup PO number
  | 'po_fuzzy'         // Step 1b: Staff confirms fuzzy match
  | 'supplier'         // Step 2: Identify supplier (ad hoc path)
  | 'lines'            // Step 3: Add line items
  | 'new_product'      // Step 3b: Create new product (inline)
  | 'summary'          // Step 4: Review and confirm
  | 'executing'        // Executing PO creation + lines
  | 'done'             // All done, redirect to receiving

// ---------------------------------------------------------------------------
// Small shared components
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

function StepHeader({ step, label, sub }: { step: number; label: string; sub?: string }) {
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
// Step 1: PO lookup
// ---------------------------------------------------------------------------

function POLookupStep({
  onExactMatch,
  onFuzzyMatches,
  onNoMatch,
}: {
  onExactMatch: (po: PurchaseOrder) => void
  onFuzzyMatches: (pos: POLookupResult[]) => void
  onNoMatch: (poNumber: string) => void
}) {
  const [poNumber, setPoNumber] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLookup = async () => {
    if (!poNumber.trim()) { onNoMatch(''); return }
    setSearching(true)
    setError(null)
    try {
      const results = await lookupPurchaseOrders({ poNumber: poNumber.trim() })
      const exact = results.filter(r => r.match_type === 'exact')
      const fuzzy = results.filter(r => r.match_type === 'fuzzy')

      if (exact.length === 1) {
        onExactMatch(exact[0])
      } else if (exact.length > 1 || fuzzy.length > 0) {
        onFuzzyMatches(results)
      } else {
        onNoMatch(poNumber.trim())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-5">
      <StepHeader
        step={1}
        label="PO Resolution"
        sub="Enter the PO number from the packing slip, or skip if none is present."
      />

      <div className="space-y-3">
        <div>
          <Label>PO number from packing slip</Label>
          <Input
            value={poNumber}
            onChange={e => setPoNumber(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
            placeholder="PO-20260515-7D4B or supplier reference"
            autoFocus
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleLookup}
            disabled={searching}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {searching ? 'Searching…' : 'Look up PO'}
          </button>
          <button
            onClick={() => onNoMatch('')}
            className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            No PO number — create ad hoc
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1b: Fuzzy match confirmation
// ---------------------------------------------------------------------------

function POFuzzyStep({
  candidates,
  slipPoNumber,
  onSelect,
  onReject,
}: {
  candidates: POLookupResult[]
  slipPoNumber: string
  onSelect: (po: PurchaseOrder) => void
  onReject: () => void
}) {
  const exact = candidates.filter(c => c.match_type === 'exact')
  const fuzzy = candidates.filter(c => c.match_type === 'fuzzy')

  return (
    <div className="space-y-5">
      <StepHeader
        step={1}
        label="Confirm PO"
        sub={
          exact.length > 1
            ? `Multiple POs match "${slipPoNumber}" — select the correct one.`
            : `"${slipPoNumber}" wasn't found exactly. These POs may be a match.`
        }
      />

      {exact.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Exact matches</p>
          {exact.map(po => (
            <POCandidate key={po.id} po={po} onSelect={onSelect} />
          ))}
        </div>
      )}

      {fuzzy.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Possible matches</p>
          {fuzzy.map(po => (
            <POCandidate key={po.id} po={po} onSelect={onSelect} />
          ))}
        </div>
      )}

      <button
        onClick={onReject}
        className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:underline"
      >
        None of these — create ad hoc PO
      </button>
    </div>
  )
}

function POCandidate({ po, onSelect }: { po: POLookupResult; onSelect: (po: PurchaseOrder) => void }) {
  return (
    <button
      onClick={() => onSelect(po)}
      className="w-full text-left border dark:border-gray-700 rounded-lg px-4 py-3 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm">{po.po_number}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase
          ${po.match_type === 'exact'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
          {po.match_type}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        {po.supplier_name ?? po.account_label} · {po.status} ·{' '}
        {po.ordered_at ? new Date(po.ordered_at).toLocaleDateString() : '—'}
      </p>
      {po.informal_ref && (
        <p className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-0.5">ref: {po.informal_ref}</p>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Supplier identification (ad hoc path)
// ---------------------------------------------------------------------------

function SupplierStep({
  onSelect,
}: {
  onSelect: (detail: SupplierDetail) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SupplierParty[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SupplierDetail | null>(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    fetchSuppliers({ search: query, activeOnly: false })
      .then(r => setResults(r.slice(0, 8)))
      .catch(() => {})
  }, [query])

  const handleSelect = async (party: SupplierParty) => {
    setLoading(true)
    setResults([])
    try {
      const detail = await fetchSupplierDetail(party.id)
      setSelected(detail)
      setQuery(party.name)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = () => {
    if (selected) onSelect(selected)
  }

  // Derive ordering pathway from selected detail
  const primaryAccount = selected?.accounts.find(a => a.is_primary && a.is_active)
    ?? selected?.accounts[0]

  return (
    <div className="space-y-5">
      <StepHeader
        step={2}
        label="Identify Publisher"
        sub="Search by publisher name. The system will show you the ordering pathway."
      />

      <div className="space-y-3">
        <div>
          <Label required>Publisher or distributor name</Label>
          <Input
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null) }}
            placeholder="Graywolf Press, Phaidon, Brian Voll…"
            autoFocus
            disabled={loading}
          />
        </div>

        {/* Ordering pathway confirmation — shown after selection */}
        {selected && (
          <div className="px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                  {selected.party.name}
                </p>
                {/* Show distributor relationship if this is an imprint/distribution client */}
                {selected.party.parent_id && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    ↳ Orders via parent distributor
                  </p>
                )}
                {primaryAccount && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    {primaryAccount.label}
                    {primaryAccount.account_number && ` · #${primaryAccount.account_number}`}
                    {primaryAccount.ordering_method && ` · via ${primaryAccount.ordering_method}`}
                  </p>
                )}
                {selected.party.shopify_vendor_codes?.length ? (
                  <p className="text-[11px] text-blue-400 dark:text-blue-500 mt-1">
                    Shopify vendor: <span className="font-semibold">{selected.party.name}</span>
                    {selected.party.shopify_vendor_codes.length > 0 && (
                      <span className="ml-1 opacity-70">(legacy: {selected.party.shopify_vendor_codes.join(', ')})</span>
                    )}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => { setSelected(null); setQuery('') }}
                className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 text-sm ml-2"
              >
                ✕
              </button>
            </div>
            <button
              onClick={handleConfirm}
              className="w-full px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
            >
              Continue with {selected.party.name} →
            </button>
          </div>
        )}

        {results.length > 0 && !selected && (
          <div className="border dark:border-gray-700 rounded-md overflow-hidden">
            {results.map(party => (
              <button
                key={party.id}
                onClick={() => handleSelect(party)}
                disabled={loading}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 last:border-0 disabled:opacity-50"
              >
                <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{party.name}</span>
                {party.shopify_vendor_codes?.[0] && (
                  <span className="text-xs font-mono text-gray-400 ml-2">{party.shopify_vendor_codes[0]}</span>
                )}
                {!party.is_active && (
                  <span className="text-xs text-amber-500 ml-2">draft</span>
                )}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <p className="text-sm text-gray-400 animate-pulse">Loading supplier…</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Line item entry
// ---------------------------------------------------------------------------

function LineEntryStep({
  lines,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  onOpenNewProduct,
  onDone,
}: {
  lines: SessionLine[]
  onAddLine: (isbn: string, qty: number, cost: string, title: string) => void
  onUpdateLine: (key: string, patch: Partial<SessionLine>) => void
  onRemoveLine: (key: string) => void
  onOpenNewProduct: (line: SessionLine) => void
  onDone: () => void
}) {
  const [isbn, setIsbn] = useState('')
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('')
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!isbn.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      await onAddLine(isbn.trim(), parseInt(qty) || 1, cost, title)
      setIsbn('')
      setQty('1')
      setCost('')
      setTitle('')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add line')
    } finally {
      setAdding(false)
    }
  }

  const resolvedCount = lines.filter(l => l.resolution !== 'pending' && l.resolution !== 'resolving').length

  return (
    <div className="space-y-5">
      <StepHeader
        step={3}
        label="Line Items"
        sub="Enter each ISBN from the packing slip. The system will resolve it to an existing product or prompt you to create a new one."
      />

      {/* Add line form */}
      <div className="border dark:border-gray-700 rounded-lg p-4 space-y-3 bg-gray-50/50 dark:bg-gray-900/30">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Add line item</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 sm:col-span-1">
            <Label required>ISBN</Label>
            <Input
              value={isbn}
              onChange={e => setIsbn(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="9780231221290"
              autoFocus
            />
          </div>
          <div>
            <Label required>Qty</Label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={e => setQty(e.target.value)}
            />
          </div>
          <div>
            <Label>Unit cost ($)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={cost}
              onChange={e => setCost(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <div>
          <Label>Title (from slip, optional)</Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="On Taste"
          />
        </div>
        {addError && (
          <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>
        )}
        <button
          onClick={handleAdd}
          disabled={!isbn.trim() || adding}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {adding ? 'Resolving…' : '+ Add line'}
        </button>
      </div>

      {/* Line list */}
      {lines.length > 0 && (
        <div className="space-y-2">
          {lines.map(line => (
            <LineItemRow
              key={line._key}
              line={line}
              onUpdateQty={qty => onUpdateLine(line._key, { quantity: qty })}
              onSkip={() => onUpdateLine(line._key, { resolution: 'skipped' })}
              onRemove={() => onRemoveLine(line._key)}
              onCreateProduct={() => onOpenNewProduct(line)}
            />
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {resolvedCount}/{lines.length} lines resolved
          </p>
          <button
            onClick={onDone}
            disabled={lines.some(l => l.resolution === 'pending' || l.resolution === 'resolving')}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            Review summary →
          </button>
        </div>
      )}
    </div>
  )
}

function LineItemRow({
  line,
  onUpdateQty,
  onSkip,
  onRemove,
  onCreateProduct,
}: {
  line: SessionLine
  onUpdateQty: (qty: number) => void
  onSkip: () => void
  onRemove: () => void
  onCreateProduct: () => void
}) {
  const statusColor = {
    pending:    'border-gray-200 dark:border-gray-700',
    resolving:  'border-blue-300 dark:border-blue-700 animate-pulse',
    existing:   'border-green-300 dark:border-green-700',
    new:        'border-purple-300 dark:border-purple-700',
    skipped:    'border-gray-200 dark:border-gray-700 opacity-50',
  }[line.resolution]

  return (
    <div className={`border rounded-lg p-3 transition-colors ${statusColor}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
              {line.isbn}
            </span>
            {/* Resolution badge */}
            {line.resolution === 'resolving' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-semibold">
                Resolving…
              </span>
            )}
            {line.resolution === 'existing' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-semibold">
                ✓ In catalog
              </span>
            )}
            {line.resolution === 'new' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-semibold">
                ✓ New product
              </span>
            )}
            {line.resolution === 'pending' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-semibold">
                Not found
              </span>
            )}
          </div>

          {/* Title */}
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 truncate">
            {line.existing_product?.title
              ?? line.new_product?.title
              ?? line.title_from_slip
              ?? '—'}
          </p>

          {/* Missing fields warning for new products */}
          {line.resolution === 'new' && line.new_product?.missing_fields?.length ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              ⚠ Missing: {line.new_product.missing_fields.join(', ')}
            </p>
          ) : null}
        </div>

        {/* Qty and actions */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            min={1}
            value={line.quantity}
            onChange={e => onUpdateQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 px-2 py-1 border rounded text-sm text-center dark:bg-gray-800 dark:text-white dark:border-gray-600"
          />
          <button
            onClick={onRemove}
            className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Actions for unresolved lines */}
      {line.resolution === 'pending' && (
        <div className="flex gap-2 mt-2 pt-2 border-t dark:border-gray-700">
          <button
            onClick={onCreateProduct}
            className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold"
          >
            + Create new product
          </button>
          <button
            onClick={onSkip}
            className="text-xs text-gray-400 hover:underline"
          >
            Skip this line
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Session summary
// ---------------------------------------------------------------------------

function SummaryStep({
  lines,
  supplierDetail,
  existingPO,
  slipPoNumber,
  locationName,
  onBack,
  onConfirm,
  executing,
  error,
}: {
  lines: SessionLine[]
  supplierDetail: SupplierDetail | null
  existingPO: PurchaseOrder | null
  slipPoNumber: string
  locationName: (id: string) => string
  onBack: () => void
  onConfirm: () => void
  executing: boolean
  error: string | null
}) {
  const existing = lines.filter(l => l.resolution === 'existing')
  const newProducts = lines.filter(l => l.resolution === 'new')
  const skipped = lines.filter(l => l.resolution === 'skipped')
  const totalQty = lines.filter(l => l.resolution !== 'skipped').reduce((s, l) => s + l.quantity, 0)

  return (
    <div className="space-y-5">
      <StepHeader
        step={4}
        label="Review & Confirm"
        sub="Review the session before creating the PO and lines."
      />

      {/* PO info */}
      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Purchase Order</p>
        </div>
        <div className="px-4 py-3 space-y-1.5 text-sm">
          {existingPO ? (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">PO</span>
                <span className="font-mono font-semibold">{existingPO.po_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className="capitalize">{existingPO.status}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold">New ad hoc PO</span>
              </div>
              {slipPoNumber && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Slip ref</span>
                  <span className="font-mono text-xs">{slipPoNumber}</span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Supplier</span>
            <span>{supplierDetail?.party.name ?? existingPO?.supplier_name ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* Existing products */}
      {existing.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400">
              Existing products ({existing.length})
            </p>
            <p className="text-xs text-gray-400">{existing.reduce((s,l) => s+l.quantity, 0)} units</p>
          </div>
          {existing.map(line => (
            <div key={line._key} className="px-4 py-2.5 border-b dark:border-gray-800 last:border-0 flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {line.existing_product?.title ?? line.title_from_slip ?? line.isbn}
                </p>
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

      {/* New products */}
      {newProducts.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
              New products — will be created in Shopify ({newProducts.length})
            </p>
            <p className="text-xs text-gray-400">{newProducts.reduce((s,l) => s+l.quantity, 0)} units</p>
          </div>
          {newProducts.map(line => (
            <div key={line._key} className="px-4 py-2.5 border-b dark:border-gray-800 last:border-0 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {line.new_product?.title ?? line.title_from_slip ?? line.isbn}
                </p>
                <p className="font-semibold shrink-0 ml-4">× {line.quantity}</p>
              </div>
              {line.new_product?.missing_fields?.length ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                  ⚠ Follow up in Shopify: {line.new_product.missing_fields.join(', ')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Skipped */}
      {skipped.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {skipped.length} line{skipped.length !== 1 ? 's' : ''} skipped
        </p>
      )}

      {error && (
        <div className="px-3 py-2.5 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          disabled={executing}
          className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          onClick={onConfirm}
          disabled={executing || lines.filter(l => l.resolution !== 'skipped').length === 0}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors flex-1"
        >
          {executing ? 'Creating…' : `Confirm & create PO (${totalQty} units)`}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ReceivingEntryFlow() {
  const navigate = useNavigate()
  const { locationName } = useLocations()

  const [step, setStep] = useState<FlowStep>('po_lookup')
  const [slipPoNumber, setSlipPoNumber] = useState('')
  const [fuzzyMatches, setFuzzyMatches] = useState<POLookupResult[]>([])
  const [existingPO, setExistingPO] = useState<PurchaseOrder | null>(null)
  const [supplierDetail, setSupplierDetail] = useState<SupplierDetail | null>(null)
  const [lines, setLines] = useState<SessionLine[]>([])
  const [newProductTargetKey, setNewProductTargetKey] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)
  const [execError, setExecError] = useState<string | null>(null)

  const HQ_LOCATION_ID = 'gid://shopify/Location/40052293765'

  // ── PO resolution handlers ───────────────────────────────────────────────

  const handleExactMatch = useCallback((po: PurchaseOrder) => {
    // Exact match — go straight to standard receiving wizard with this PO
    navigate(`/receiving?po=${po.id}`)
  }, [navigate])

  const handleFuzzyMatches = useCallback((matches: POLookupResult[]) => {
    setFuzzyMatches(matches)
    setStep('po_fuzzy')
  }, [])

  const handleNoMatch = useCallback((poNumber: string) => {
    setSlipPoNumber(poNumber)
    setStep('supplier')
  }, [])

  const handleFuzzySelect = useCallback((po: PurchaseOrder) => {
    // Staff confirmed a fuzzy match — treat as exact, go to receiving wizard
    navigate(`/receiving?po=${po.id}`)
  }, [navigate])

  const handleFuzzyReject = useCallback(() => {
    setStep('supplier')
  }, [])

  const handleSupplierSelect = useCallback((detail: SupplierDetail) => {
    setSupplierDetail(detail)
    setStep('lines')
  }, [])

  // ── Line management ──────────────────────────────────────────────────────

  const addLine = useCallback(async (isbn: string, qty: number, cost: string, titleFromSlip: string) => {
    const key = crypto.randomUUID()

    // Add as pending immediately
    const pendingLine: SessionLine = {
      _key: key,
      isbn,
      quantity: qty,
      unit_cost: cost,
      title_from_slip: titleFromSlip,
      resolution: 'resolving',
    }
    setLines(prev => [...prev, pendingLine])

    try {
      const results = await lookupProductByISBN(isbn)
      if (results.length > 0) {
        // Found in catalog
        setLines(prev => prev.map(l => l._key === key ? {
          ...l,
          resolution: 'existing',
          existing_product: results[0],
          title_from_slip: titleFromSlip || results[0].title,
        } : l))
      } else {
        // Not found — needs new product creation
        setLines(prev => prev.map(l => l._key === key ? {
          ...l,
          resolution: 'pending',
        } : l))
      }
    } catch {
      setLines(prev => prev.map(l => l._key === key ? {
        ...l,
        resolution: 'pending',
      } : l))
    }
  }, [])

  const updateLine = useCallback((key: string, patch: Partial<SessionLine>) => {
    setLines(prev => prev.map(l => l._key === key ? { ...l, ...patch } : l))
  }, [])

  const removeLine = useCallback((key: string) => {
    setLines(prev => prev.filter(l => l._key !== key))
  }, [])

  const openNewProduct = useCallback((line: SessionLine) => {
    setNewProductTargetKey(line._key)
    setStep('new_product')
  }, [])

  // Called when NewProductWizard creates a product successfully
  const handleNewProductCreated = useCallback((
    productId: string,
    inventoryItemId: string,
    variantId: string,
    title: string,
    missingFields: string[],
  ) => {
    if (!newProductTargetKey) return
    setLines(prev => prev.map(l => l._key === newProductTargetKey ? {
      ...l,
      resolution: 'new',
      new_product: {
        shopify_product_id: productId,
        inventory_item_id:  inventoryItemId,
        variant_id:         variantId,
        title,
        missing_fields:     missingFields,
      },
    } : l))
    setNewProductTargetKey(null)
    setStep('lines')
  }, [newProductTargetKey])

  // ── Execute ──────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    setExecuting(true)
    setExecError(null)

    try {
      const activeLines = lines.filter(l => l.resolution !== 'skipped')
      const primaryAccount = supplierDetail?.accounts.find(a => a.is_primary && a.is_active)
        ?? supplierDetail?.accounts[0]

      if (!primaryAccount && !existingPO) {
        throw new Error('No supplier account available — cannot create PO')
      }

      // 1. Create ad hoc PO if needed
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

      // 2. Add lines — existing products and newly created products
      for (const line of activeLines) {
        const inventoryItemId = line.existing_product?.inventory_item_id
          ?? line.new_product?.inventory_item_id
        const variantId = line.existing_product?.variant_id
          ?? line.new_product?.variant_id

        if (!inventoryItemId || !variantId) continue

        await createPOLine(poId, {
          inventory_item_id: inventoryItemId,
          variant_id:        variantId,
          quantity_ordered:  line.quantity,
          unit_cost:         line.unit_cost ? parseFloat(line.unit_cost) : undefined,
        })
      }

      // 3. Navigate to receiving wizard with the PO pre-loaded
      navigate(`/receiving?po=${poId}`)
    } catch (e) {
      setExecError(e instanceof Error ? e.message : 'Failed to create PO')
      setExecuting(false)
    }
  }, [lines, supplierDetail, existingPO, slipPoNumber, navigate])

  // ── Render ───────────────────────────────────────────────────────────────

  // NewProductWizard inline — needs the line's prefill data
  if (step === 'new_product' && newProductTargetKey) {
    const targetLine = lines.find(l => l._key === newProductTargetKey)
    if (!targetLine) { setStep('lines'); return null }

    return (
      <NewProductWizard
        prefill={{
          isbn:           targetLine.isbn,
          title:          targetLine.title_from_slip ?? '',
          unit_cost:      targetLine.unit_cost,
          supplier_party: supplierDetail?.party ?? null,
        }}
        onCreated={(productId, inventoryItemId, variantId, title, missingFields) => {
          handleNewProductCreated(productId, inventoryItemId, variantId, title, missingFields)
        }}
        onCancel={() => { setNewProductTargetKey(null); setStep('lines') }}
      />
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">New Receipt</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Receive stock from a packing slip — standard PO or ad hoc.
        </p>
      </div>

      {step === 'po_lookup' && (
        <POLookupStep
          onExactMatch={handleExactMatch}
          onFuzzyMatches={handleFuzzyMatches}
          onNoMatch={handleNoMatch}
        />
      )}

      {step === 'po_fuzzy' && (
        <POFuzzyStep
          candidates={fuzzyMatches}
          slipPoNumber={slipPoNumber}
          onSelect={handleFuzzySelect}
          onReject={handleFuzzyReject}
        />
      )}

      {step === 'supplier' && (
        <SupplierStep onSelect={handleSupplierSelect} />
      )}

      {step === 'lines' && (
        <>
          {/* Supplier/PO context bar */}
          <div className="mb-5 px-3 py-2.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm flex items-center justify-between">
            <span className="text-blue-800 dark:text-blue-200 font-medium">
              {supplierDetail?.party.name ?? existingPO?.supplier_name}
            </span>
            {slipPoNumber && (
              <span className="text-xs font-mono text-blue-500 dark:text-blue-400">
                ref: {slipPoNumber}
              </span>
            )}
          </div>
          <LineEntryStep
            lines={lines}
            onAddLine={addLine}
            onUpdateLine={updateLine}
            onRemoveLine={removeLine}
            onOpenNewProduct={openNewProduct}
            onDone={() => setStep('summary')}
          />
        </>
      )}

      {step === 'summary' && (
        <SummaryStep
          lines={lines}
          supplierDetail={supplierDetail}
          existingPO={existingPO}
          slipPoNumber={slipPoNumber}
          locationName={locationName}
          onBack={() => setStep('lines')}
          onConfirm={handleConfirm}
          executing={executing}
          error={execError}
        />
      )}
    </div>
  )
}
