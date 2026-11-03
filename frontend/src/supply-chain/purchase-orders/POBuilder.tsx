// POBuilder.tsx
// Modal form for creating a new purchase order.
//
// Flow:
//   Step 1 — Header: supplier account, destination location, dates, flags
//   Step 2 — Lines: add line items by ISBN/title search, or scan an order image (#56)
//   Step 3 — Review: summary before submission
//
// On save:
//   POST /api/purchase-orders            → creates the PO (draft status)
//   POST /api/purchase-orders/{id}/lines → one call per line item
//   Optionally: POST /api/purchase-orders/{id}/submit → moves to submitted
//
// The PO is always created as draft first. Staff can submit from the
// detail sidebar if they want to send it immediately, or leave as draft.
//
// Drop-ship POs (is_drop_ship=true) require a venue selection.
// Ad hoc POs capture the source and an informal reference number.
//
// Line ordering:
//   `lines` holds insertion order and is the submission order — handleCreate
//   iterates it directly. The UI renders `displayLines` (newest first) so the
//   line just added sits at the top where it can be checked without scrolling.
//   Display and submission are deliberately decoupled; changing one must not
//   change the other.
//
// Quantity entry (supply-chain-service docs/PO_QUANTITY_ENTRY.md §4):
//   Picking a title from search opens LineEntryModal over the builder. Its
//   quantity starts EMPTY and is required — there is no default 1 to ride
//   through unnoticed, and nothing for a typed digit to prepend to (the "14"
//   meant as "4" bug). Focus and tab select the whole field so entry replaces.
//   Editing a line reuses the same modal. Scanned lines arrive with the
//   quantity the document printed and skip the modal.
//
// Single-line quantity-1 warning (warning_code single_line_qty_one):
//   A PO isn't single-line until the operator stops adding lines, so this is
//   evaluated on the Review step, never at line entry. It warns and never
//   blocks. Every appearance is logged (warning_shown) so there is a
//   denominator; the outcome is warning_heeded if a later edit means it no
//   longer applies, or warning_overridden if the PO is saved in that shape.
//   One flow_id per appearance ties the two together.
//
// Price: there is no unit-cost input. unit_cost is a deprecated name for MSRP
//   (supply-chain-service docs/PRICING_FIELDS.md); scanned lines still carry
//   the document's MSRP in it and handleCreate still sends it. Totals built
//   from it are list value, never cost.
//
// Multi-location accounts:
//   A supplier party can hold more than one account, each optionally tied to a
//   location (location_id). Some publishers (PRH, MPS) issue a distinct account
//   number per ship-to location. Rather than binding an account at supplier-
//   select time, we keep the party's full list of active accounts and derive
//   the *effective* account from the chosen destination location — preferring a
//   location_id match, then the primary, then the first active account. The
//   effective account is recomputed whenever the destination location changes.
//
// Frame: ModalShell. A backdrop tap does nothing (it used to discard the whole
// PO); closing with lines entered asks first.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useLocations } from '../hooks/useLocations'
import {
  createPurchaseOrder,
  createPOLine,
  searchVariants,
  submitPurchaseOrder,
  downloadPOPdf,
  fetchPurchaseOrders,
  discardPurchaseOrder,
  cancelPurchaseOrder,
  recordPOEntryEvents,
  type POEntryEvent,
} from '../../api/supplyChainApi'
import { createSupplierAccount, fetchB2bCustomers, createB2bCustomer } from '../../api/supplyChainApi'
import { SupplierParty, SupplierAccount } from '../suppliers/supplierTypes'
import type { B2bCustomer } from '../b2b-customers/b2bCustomerTypes'
import type { SupplierDetail } from '../suppliers/supplierTypes'
import { AdHocSource, PurchaseOrder } from '../purchase-orders/purchaseOrderTypes'
import SupplierAccountPicker, { resolveAccountForLocation } from '../suppliers/SupplierAccountPicker'
import OrderImageScan, { type ScannedLine } from './OrderImageScan'
import ModalShell from '../../components/ModalShell'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItem {
  _key: string
  inventory_item_id: string
  variant_id: string
  title: string
  isbn: string
  quantity_ordered: number
  unit_cost: string   // MSRP (legacy name) — set by the scanner only; no input
  notes: string
}

// A title picked from search, before its quantity has been entered.
type PickedItem = Omit<LineItem, '_key' | 'quantity_ordered' | 'unit_cost' | 'notes'>

interface VariantSearchResult {
  inventory_item_id: string
  variant_id: string
  title: string
  isbn: string
  vendor: string
}

const QTY_ONE_WARNING = 'single_line_qty_one'

// ---------------------------------------------------------------------------
// Shared field primitives
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

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={`w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 ${props.className ?? ''}`}
  />
)

const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    rows={2}
    className={`w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 resize-none ${props.className ?? ''}`}
  />
)

// ---------------------------------------------------------------------------
// Variant / line item search
// ---------------------------------------------------------------------------

function VariantSearchRow({
  onPick,
  existingItemIds,
  partyId,
}: {
  onPick: (item: PickedItem) => void
  existingItemIds: Set<string>
  // Scope the catalog search to the PO's supplier so wrong-supplier titles
  // don't appear. The server-side guardrail is authoritative; this is UX.
  partyId?: string | null
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VariantSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setResults([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (query.length < 3) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await searchVariants(query, partyId)
        setResults(data.slice(0, 15))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, partyId])

  const handleSelect = (v: VariantSearchResult) => {
    onPick({
      inventory_item_id: v.inventory_item_id,
      variant_id: v.variant_id,
      title: v.title,
      isbn: v.isbn,
    })
    setQuery('')
    setResults([])
  }

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by ISBN or title to add a line…"
      />
      {searching && (
        <div className="absolute right-3 top-2.5 text-xs text-gray-400">Searching…</div>
      )}
      {results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {results.map(v => {
            const already = existingItemIds.has(v.inventory_item_id)
            return (
              <button
                key={v.inventory_item_id}
                type="button"
                disabled={already}
                onMouseDown={() => !already && handleSelect(v)}
                className={`w-full text-left px-3 py-2.5 border-b dark:border-gray-800 last:border-0 text-sm
                  ${already
                    ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
              >
                <span className="font-medium text-gray-900 dark:text-gray-100 block truncate">
                  {v.title}
                </span>
                <span className="text-xs text-gray-400">
                  {v.isbn}{already ? ' — already added' : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Line entry / edit modal
//
// Opens over the builder (ModalShell nests it a layer up automatically).
// Quantity is a text field, not type=number: native spinners can't be styled
// or enlarged, and the − / + buttons replace them. Digits only.
// ---------------------------------------------------------------------------

function LineEntryModal({
  mode,
  title,
  isbn,
  initialQty,
  initialNotes,
  onSave,
  onClose,
}: {
  mode: 'add' | 'edit'
  title: string
  isbn: string
  initialQty?: number
  initialNotes?: string
  onSave: (qty: number, notes: string) => void
  onClose: () => void
}) {
  const [qtyText, setQtyText] = useState(initialQty != null ? String(initialQty) : '')
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [notesOpen, setNotesOpen] = useState(!!initialNotes)
  const qtyRef = useRef<HTMLInputElement>(null)

  const qty = /^\d+$/.test(qtyText) ? parseInt(qtyText, 10) : NaN
  const valid = Number.isInteger(qty) && qty >= 1

  // Select on the next frame: selecting inside the focus event itself is
  // undone by the click that focused the field on some mobile browsers.
  const selectAll = (el: HTMLInputElement) => { requestAnimationFrame(() => el.select()) }
  const bump = (d: number) => setQtyText(String(Math.max(1, (valid ? qty : 0) + d)))
  const save = () => { if (valid) onSave(qty, notes.trim()) }

  const stepBtn = `h-12 w-12 shrink-0 flex items-center justify-center rounded-md border
    border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200
    hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 disabled:opacity-30 transition`

  return (
    <ModalShell
      title={mode === 'add' ? 'Add line' : 'Edit line'}
      size="sm"
      onClose={onClose}
      initialFocusRef={qtyRef}
      footer={({ requestClose }) => (
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={requestClose}
            className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!valid}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]">
            {mode === 'add' ? 'Add line' : 'Save'}
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
          <p className="text-xs text-gray-400 font-mono">{isbn}</p>
        </div>

        <div>
          <Label required>Quantity</Label>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Decrease quantity" onClick={() => bump(-1)}
              disabled={!valid || qty <= 1} className={stepBtn}>
              <Minus className="w-5 h-5" />
            </button>
            <input
              ref={qtyRef}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-label="Quantity"
              placeholder="Qty"
              value={qtyText}
              onChange={e => setQtyText(e.target.value.replace(/\D/g, '').slice(0, 5))}
              onFocus={e => selectAll(e.currentTarget)}
              onKeyDown={e => {
                if (e.key === 'Enter')     { e.preventDefault(); save() }
                if (e.key === 'ArrowUp')   { e.preventDefault(); bump(1) }
                if (e.key === 'ArrowDown') { e.preventDefault(); if (valid && qty > 1) bump(-1) }
              }}
              className="h-12 flex-1 min-w-0 px-3 text-center text-2xl font-semibold tabular-nums border rounded-md
                         bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600
                         focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-base placeholder:font-normal placeholder:text-gray-300"
            />
            <button type="button" aria-label="Increase quantity" onClick={() => bump(1)} className={stepBtn}>
              <Plus className="w-5 h-5" />
            </button>
          </div>
          {qtyText !== '' && !valid && (
            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">Enter a whole number, 1 or more.</p>
          )}
        </div>

        {notesOpen ? (
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        ) : (
          <button type="button" onClick={() => setNotesOpen(true)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            + Add a note
          </button>
        )}
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Individual line item row — abbreviated; edit happens in LineEntryModal.
//
// Edit / remove icons fade in on hover where there is a mouse. On touch
// screens (no hover) they are always shown — keyed on the pointer, not the
// screen width, so a tablet doesn't hide them.
// ---------------------------------------------------------------------------

function LineRow({
  line,
  onEdit,
  onRemove,
}: {
  line: LineItem
  onEdit: () => void
  onRemove: () => void
}) {
  const iconBtn = 'p-1.5 rounded text-gray-400 dark:text-gray-500 transition-colors'
  return (
    <div className="group flex items-center gap-3 border dark:border-gray-700 rounded-md px-3 py-2 bg-gray-50/50 dark:bg-gray-800/30
                    hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
      <button type="button" onClick={onEdit} title="Edit quantity or notes" className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{line.title}</p>
        <p className="text-xs text-gray-400 font-mono">{line.isbn}</p>
        {line.notes && (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic truncate mt-0.5">{line.notes}</p>
        )}
      </button>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">× {line.quantity_ordered}</span>
      <div className="flex items-center gap-0.5 shrink-0 transition-opacity
                      [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
                      [@media(hover:hover)]:group-focus-within:opacity-100">
        <button type="button" onClick={onEdit} aria-label={`Edit ${line.title}`}
          className={`${iconBtn} hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30`}>
          <Pencil className="w-4 h-4" />
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${line.title}`}
          className={`${iconBtn} hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30`}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step indicators
// ---------------------------------------------------------------------------

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Header', 'Lines', 'Review']
  return (
    <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
      {steps.map((label, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <React.Fragment key={n}>
            {i > 0 && (
              <div className={`flex-1 h-px ${done ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                ${active ? 'bg-blue-600 text-white' : done ? 'bg-blue-200 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}
              >
                {done ? '✓' : n}
              </div>
              <span className={`text-xs font-medium hidden sm:block
                ${active ? 'text-blue-600 dark:text-blue-400' : done ? 'text-blue-400' : 'text-gray-400'}`}
              >
                {label}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main POBuilder component
// ---------------------------------------------------------------------------

interface Props {
  initialSupplier?: SupplierDetail
  onClose: () => void
  onCreated: (poId: string) => void
}

export default function POBuilder({ onClose, onCreated, initialSupplier }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [scanOpen, setScanOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { locations, locationName } = useLocations()

  const [draftPOs, setDraftPOs] = useState<PurchaseOrder[]>([])
  const [showDraftPrompt, setShowDraftPrompt] = useState(false)
  const [selectedDraftPO, setSelectedDraftPO] = useState<string | null>(null)

  const [isTest, setIsTest] = useState(false)

  const navigate = useNavigate()

  const getInitialSelection = () => {
    if (!initialSupplier) return null
    const active = initialSupplier.accounts.filter(a => a.is_active)
    const accounts = active.length > 0 ? active : initialSupplier.accounts
    if (accounts.length === 0) return null
    return { party: initialSupplier.party, accounts }
  }

  const [supplierSelection, setSupplierSelection] = useState<{
    party: SupplierParty
    accounts: SupplierAccount[]
  } | null>(getInitialSelection)
  const [destinationLocationId, setDestinationLocationId] = useState('')
  const [orderedAt, setOrderedAt] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [poNotes, setPoNotes] = useState('')
  const [poNumberPrefix, setPoNumberPrefix] = useState('')
  const [isAdHoc, setIsAdHoc] = useState(false)
  const [adHocSource, setAdHocSource] = useState<AdHocSource | ''>('')
  const [informalRef, setInformalRef] = useState('')
  const [isDropShip, setIsDropShip] = useState(false)
  const [dropShipAddress, setDropShipAddress] = useState('')
  // B2B: wholesale-to-a-business order. Uses the party's is_b2b account
  // regardless of destination. Orthogonal to drop-ship — to ship to the third
  // party, staff also enable Drop-ship and enter that address there (interim,
  // until the B2B customer directory fills it in).
  const [isB2b, setIsB2b] = useState(false)
  const [b2bAccountNumber, setB2bAccountNumber] = useState('')
  const [creatingB2bAccount, setCreatingB2bAccount] = useState(false)
  // B2B customer (sell-side ship-to) picked from the directory, or created on
  // the fly. Its ship_to_address becomes the PO's ship-to.
  const [b2bCustomer, setB2bCustomer] = useState<B2bCustomer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<B2bCustomer[]>([])
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerAddress, setNewCustomerAddress] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)

  const effectiveAccount = useMemo(
    () => supplierSelection
      ? resolveAccountForLocation(supplierSelection.accounts, destinationLocationId || null, isB2b)
      : null,
    [supplierSelection, destinationLocationId, isB2b],
  )
  // Does the selected party already have a B2B account? If B2B is on and it
  // doesn't, we prompt to create one on the fly before the order can proceed.
  const partyHasB2bAccount = !!supplierSelection?.accounts.some(a => a.is_b2b)
  const needsB2bAccount = isB2b && !!supplierSelection && !partyHasB2bAccount

  const [lines, setLines] = useState<LineItem[]>([])

  // The line-entry modal: adding a just-picked title, or editing a line.
  const [lineModal, setLineModal] = useState<
    | { mode: 'add'; item: PickedItem }
    | { mode: 'edit'; key: string }
    | null
  >(null)

  useEffect(() => {
    if (locations.length > 0 && !destinationLocationId) {
      const hq = locations.find(l => l.is_active && !l.is_seasonal) ?? locations[0]
      setDestinationLocationId(hq.id)
    }
  }, [locations])

  useEffect(() => {
    if (!supplierSelection || !effectiveAccount) { setDraftPOs([]); return }
    fetchPurchaseOrders({
      supplierAccountId: effectiveAccount.id,
      status: 'draft',
      limit: 5,
    }).then(orders => {
      setDraftPOs(orders)
      if (orders.length > 0) setShowDraftPrompt(true)
    }).catch(() => {})
  }, [effectiveAccount?.id])

  useEffect(() => {
    if (!isB2b || customerSearch.length < 2) { setCustomerResults([]); return }
    const t = setTimeout(() => {
      fetchB2bCustomers({ search: customerSearch, activeOnly: true })
        .then(r => setCustomerResults(r.slice(0, 8)))
        .catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [customerSearch, isB2b])

  /* Every way out of the builder (x, Escape) passes through this. Entered
     lines are the work worth protecting; the header alone is quick to redo. */
  const confirmDiscard = () =>
    lines.length === 0 || window.confirm('Discard this purchase order? The lines you added will be lost.')

  const step1Valid = !!supplierSelection && !!effectiveAccount && !!destinationLocationId &&
    (!isDropShip || dropShipAddress.trim().length > 0) &&
    (!isB2b || (partyHasB2bAccount && !!b2bCustomer))

  // A title picked from search opens the line modal; the line is added only
  // once a quantity has been entered there.
  const openAddLine = (item: PickedItem) => setLineModal({ mode: 'add', item })
  const addLine = (item: PickedItem, quantity: number, notes: string) => {
    setLines(prev => [...prev, { ...item, _key: crypto.randomUUID(), quantity_ordered: quantity, unit_cost: '', notes }])
  }
  // Add lines produced by the image scanner (#56). Each scanned line already
  // carries qty and cost, so we push directly rather than through addLine.
  // De-dupe against lines already on the PO by inventory_item_id.
  const addScannedLines = (scanned: ScannedLine[]) => {
    setLines(prev => {
      const have = new Set(prev.map(l => l.inventory_item_id))
      const additions = scanned
        .filter(s => !have.has(s.inventory_item_id))
        .map(s => ({
          _key: crypto.randomUUID(),
          inventory_item_id: s.inventory_item_id,
          variant_id: s.variant_id,
          title: s.title,
          isbn: s.isbn,
          quantity_ordered: s.quantity_ordered,
          unit_cost: s.unit_cost,
          notes: '',
        }))
      return [...prev, ...additions]
    })
    setScanOpen(false)
  }
  const updateLine = (key: string, patch: Partial<LineItem>) => {
    setLines(prev => prev.map(l => l._key === key ? { ...l, ...patch } : l))
  }
  const removeLine = (key: string) => setLines(prev => prev.filter(l => l._key !== key))
  const existingItemIds = new Set(lines.map(l => l.inventory_item_id))

  // Display order only — newest line first, so the line just added sits at the
  // top of the list and can be checked without scrolling to the bottom.
  //
  // `lines` itself keeps insertion order and is what handleCreate submits, so
  // the order the supplier sees is unchanged. Reverse a copy, never `lines`
  // directly: Array.prototype.reverse mutates in place and would corrupt state.
  const displayLines = useMemo(() => [...lines].reverse(), [lines])

  // ── Single-line quantity-1 warning ──────────────────────────────────────
  const qtyOneLine = lines.length === 1 && lines[0].quantity_ordered === 1 ? lines[0] : null
  const [qtyOneFlow, setQtyOneFlow] = useState<string | null>(null)

  // Fire-and-forget: a logging failure must never get in the way of the PO.
  const logQtyOne = (
    event_type: POEntryEvent['event_type'],
    flow_id: string,
    extra: Partial<POEntryEvent> = {},
  ) => {
    recordPOEntryEvents([{
      client_event_id: crypto.randomUUID(),
      event_type,
      warning_code: QTY_ONE_WARNING,
      surface: 'po_builder',
      flow_id,
      occurred_at: new Date().toISOString(),
      ...extra,
    }]).catch(e => console.warn('PO entry event not recorded:', e))
  }

  useEffect(() => {
    if (qtyOneFlow && !qtyOneLine) {
      // Shown earlier, and an edit since means it no longer applies.
      logQtyOne('warning_heeded', qtyOneFlow, {
        context: { line_count: lines.length, quantity_ordered: lines.length === 1 ? lines[0].quantity_ordered : null },
      })
      setQtyOneFlow(null)
    } else if (!qtyOneFlow && qtyOneLine && step === 3) {
      const flow = crypto.randomUUID()
      setQtyOneFlow(flow)
      logQtyOne('warning_shown', flow, {
        inventory_item_id: qtyOneLine.inventory_item_id,
        context: { line_count: 1, quantity_ordered: 1 },
      })
    }
    // Re-evaluated whenever the step or the warning's condition changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, !!qtyOneLine])

  const handleCreateB2bAccount = async () => {
    if (!supplierSelection || !b2bAccountNumber.trim()) return
    setCreatingB2bAccount(true)
    setError(null)
    try {
      const acct = await createSupplierAccount(supplierSelection.party.id, {
        label: `${supplierSelection.party.name} B2B Account`,
        account_number: b2bAccountNumber.trim(),
        is_b2b: true,
      })
      // Append the new account so resolveAccountForLocation(..., isB2b) picks it.
      setSupplierSelection({ party: supplierSelection.party, accounts: [...supplierSelection.accounts, acct] })
      setB2bAccountNumber('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create B2B account')
    } finally {
      setCreatingB2bAccount(false)
    }
  }

  const handleCreateB2bCustomer = async () => {
    if (!newCustomerName.trim()) return
    setSavingCustomer(true)
    setError(null)
    try {
      const cust = await createB2bCustomer({
        business_name:   newCustomerName.trim(),
        ship_to_address: newCustomerAddress.trim() || undefined,
      })
      setB2bCustomer(cust)
      setShowNewCustomer(false)
      setNewCustomerName(''); setNewCustomerAddress('')
      setCustomerSearch(''); setCustomerResults([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create B2B customer')
    } finally {
      setSavingCustomer(false)
    }
  }

  const handleCreate = async (andSubmit: boolean) => {
    if (!supplierSelection || !effectiveAccount || !destinationLocationId) return
    setBusy(true)
    setError(null)
    try {
      const po = await createPurchaseOrder({
        supplier_account_id:     effectiveAccount.id,
        destination_location_id: destinationLocationId,
        ordered_at:              orderedAt  || undefined,
        expected_at:             expectedAt || undefined,
        notes:                   poNotes.trim() || undefined,
        po_number_prefix:        poNumberPrefix.trim() || undefined,
        is_ad_hoc:               isAdHoc,
        ad_hoc_source:           (adHocSource || undefined) as AdHocSource | undefined,
        informal_ref:            informalRef.trim() || undefined,
        is_drop_ship:            isDropShip,
        drop_ship_venue_id:      undefined,
        drop_ship_address:       isDropShip ? dropShipAddress.trim() : undefined,
        is_b2b:                  isB2b,
        b2b_customer_id:         isB2b ? b2bCustomer?.id : undefined,
        is_test:                 isTest,
      })
      try {
        // Submission order: `lines` in insertion order, deliberately not
        // `displayLines`. The display reversal must not reach the supplier.
        for (const line of lines) {
          await createPOLine(po.id, {
            inventory_item_id: line.inventory_item_id,
            variant_id:        line.variant_id,
            quantity_ordered:  line.quantity_ordered,
            unit_cost:         line.unit_cost !== '' ? parseFloat(line.unit_cost) : undefined,
            notes:             line.notes.trim() || undefined,
          })
        }
      } catch (lineErr) {
        // A line was rejected (e.g. the supplier guardrail 400). Don't leave an
        // orphaned PO behind: roll the just-created PO back, then surface the
        // failure. discard hard-deletes it while it's still an empty draft; if
        // some lines already landed, fall back to cancel (discard refuses a PO
        // that has lines).
        try {
          await discardPurchaseOrder(po.id)
        } catch {
          try { await cancelPurchaseOrder(po.id) } catch { /* best effort */ }
        }
        throw lineErr
      }
      if (qtyOneFlow && qtyOneLine) {
        logQtyOne('warning_overridden', qtyOneFlow, {
          purchase_order_id: po.id,
          inventory_item_id: qtyOneLine.inventory_item_id,
          context: { line_count: 1, quantity_ordered: 1, submitted: andSubmit },
        })
      }
      if (andSubmit) {
        await submitPurchaseOrder(po.id)
        downloadPOPdf(po.id, po.po_number).catch(e => console.warn('PDF download failed:', e))
      }
      onCreated(po.id)
      // Straight to onClose, not requestClose: the PO is saved, so there is
      // nothing left to confirm discarding.
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create purchase order')
    } finally {
      setBusy(false)
    }
  }

  const totalLines = lines.length
  const totalQty   = lines.reduce((s, l) => s + l.quantity_ordered, 0)
  // MSRP × quantity — list value, not cost. Only scanned lines carry a price.
  const totalList  = lines.reduce((s, l) => s + (parseFloat(l.unit_cost) || 0) * l.quantity_ordered, 0)

  const editingLine = lineModal?.mode === 'edit' ? lines.find(l => l._key === lineModal.key) : undefined

  return (
    <ModalShell
      title="New Purchase Order"
      size="lg"
      onClose={onClose}
      onBeforeClose={confirmDiscard}
      dismissible={!busy}
      subheader={<StepBar step={step} />}
      footer={
        <div className="flex items-center justify-between">
          <button type="button"
            onClick={() => setStep(s => Math.max(1, s - 1) as 1 | 2 | 3)}
            disabled={step === 1 || busy}
            className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
            Back
          </button>
          <div className="flex gap-2">
            {step < 3 && (
              <button type="button"
                onClick={() => setStep(s => Math.min(3, s + 1) as 1 | 2 | 3)}
                disabled={(step === 1 && !step1Valid) || busy}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]">
                Next
              </button>
            )}
            {step === 3 && (
              <>
                <button type="button" onClick={() => handleCreate(false)} disabled={busy}
                  className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
                  {busy ? 'Saving…' : 'Save as draft'}
                </button>
                <button type="button" onClick={() => handleCreate(true)} disabled={busy}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]">
                  {busy ? 'Submitting…' : 'Save, submit + download PDF'}
                </button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">

          {showDraftPrompt && draftPOs.length > 0 && step === 1 && supplierSelection && (
            <div className="px-4 py-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                {draftPOs.length} open draft PO{draftPOs.length !== 1 ? 's' : ''} for {supplierSelection.party.name}
              </p>
              <div className="space-y-1 mb-3">
                {draftPOs.map(po => (
                  <label key={po.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="draft_po" value={po.id}
                      checked={selectedDraftPO === po.id}
                      onChange={() => setSelectedDraftPO(po.id)}
                      className="accent-amber-600"
                    />
                    <span className="text-xs font-mono text-amber-700 dark:text-amber-300">{po.po_number}</span>
                    {po.informal_ref && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">· {po.informal_ref}</span>
                    )}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { if (selectedDraftPO) { onClose(); navigate(`/receiving?po=${selectedDraftPO}`) } }}
                  disabled={!selectedDraftPO}
                  className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Add lines to selected PO
                </button>
                <button onClick={() => setShowDraftPrompt(false)}
                  className="px-3 py-1.5 rounded border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs">
                  Create new PO instead
                </button>
              </div>
            </div>
          )}

            {step === 1 && (
              <div className="space-y-5">
                {/* Shared SupplierAccountPicker — same behaviour as before, now from shared file */}
                <SupplierAccountPicker
                  value={supplierSelection}
                  effectiveAccount={effectiveAccount}
                  onChange={setSupplierSelection}
                />

                <div>
                  <Label required>Receiving location</Label>
                  <Select value={destinationLocationId} onChange={e => setDestinationLocationId(e.target.value)}>
                    <option value="">— select location —</option>
                    {locations.filter(l => l.is_active).map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </Select>
                  {isDropShip && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Drop-ship: this location is for records only. Stock ships direct to the address below.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Order date</Label>
                    <Input type="date" value={orderedAt} onChange={e => setOrderedAt(e.target.value)} />
                  </div>
                  <div>
                    <Label>Expected arrival</Label>
                    <Input type="date" value={expectedAt} onChange={e => setExpectedAt(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-md border dark:border-gray-700 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Ad hoc order</p>
                      <p className="text-[11px] text-gray-400">Order placed outside standard purchasing workflow</p>
                    </div>
                    <button type="button" onClick={() => setIsAdHoc(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAdHoc ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isAdHoc ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {isAdHoc && (
                    <div className="grid grid-cols-2 gap-3 pl-2">
                      <div>
                        <Label>Source</Label>
                        <Select value={adHocSource} onChange={e => setAdHocSource(e.target.value as AdHocSource | '')}>
                          <option value="">— select —</option>
                          <option value="email">Email</option>
                          <option value="phone">Phone</option>
                          <option value="invoice">Invoice</option>
                          <option value="packing_slip">Packing slip</option>
                          <option value="verbal">Verbal</option>
                          <option value="other">Other</option>
                        </Select>
                      </div>
                      <div>
                        <Label>Supplier ref / invoice #</Label>
                        <Input value={informalRef} onChange={e => setInformalRef(e.target.value)} placeholder="INV-12345" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-md border dark:border-gray-700 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Drop-ship</p>
                      <p className="text-[11px] text-gray-400">Supplier ships directly to an event venue — HQ will not receive</p>
                    </div>
                    <button type="button" onClick={() => setIsDropShip(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDropShip ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isDropShip ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {isDropShip && (
                    <div className="pl-2">
                      <Label required>Ship-to address</Label>
                      <Textarea value={dropShipAddress} onChange={e => setDropShipAddress(e.target.value)}
                        placeholder="Museum of Food and Drink&#10;62 Bayard Street, Brooklyn NY 11222" />
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-md border dark:border-gray-700 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">B2B order</p>
                      <p className="text-[11px] text-gray-400">Wholesale to a business — uses the supplier's B2B account regardless of location</p>
                    </div>
                    <button type="button" onClick={() => setIsB2b(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isB2b ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isB2b ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {isB2b && needsB2bAccount && (
                    <div className="pl-2 space-y-2">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {supplierSelection?.party.name} has no B2B account yet. Enter its B2B account number to create one.
                      </p>
                      <div className="flex gap-2">
                        <Input value={b2bAccountNumber} onChange={e => setB2bAccountNumber(e.target.value)}
                          placeholder="B2B account number" disabled={creatingB2bAccount} />
                        <button type="button" onClick={handleCreateB2bAccount}
                          disabled={creatingB2bAccount || !b2bAccountNumber.trim()}
                          className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 shrink-0 transition-colors">
                          {creatingB2bAccount ? 'Creating…' : 'Create'}
                        </button>
                      </div>
                    </div>
                  )}

                  {isB2b && partyHasB2bAccount && (
                    <div className="pl-2 space-y-2">
                      <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
                        Using {supplierSelection?.party.name}'s B2B account{effectiveAccount?.account_number ? ` · #${effectiveAccount.account_number}` : ''}.
                      </p>
                      <div>
                        <Label required>B2B customer (ship-to)</Label>
                        {b2bCustomer ? (
                          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200 truncate">{b2bCustomer.business_name}</p>
                              {b2bCustomer.ship_to_address && <p className="text-[11px] text-indigo-500 dark:text-indigo-400 truncate">{b2bCustomer.ship_to_address}</p>}
                            </div>
                            <button type="button" onClick={() => setB2bCustomer(null)}
                              className="text-indigo-400 hover:text-red-500 shrink-0 ml-2" aria-label="Clear customer">✕</button>
                          </div>
                        ) : showNewCustomer ? (
                          <div className="space-y-2">
                            <Input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
                              placeholder="Business name" disabled={savingCustomer} />
                            <Textarea value={newCustomerAddress} onChange={e => setNewCustomerAddress(e.target.value)}
                              placeholder="Ship-to address" />
                            <div className="flex gap-2">
                              <button type="button" onClick={handleCreateB2bCustomer}
                                disabled={savingCustomer || !newCustomerName.trim()}
                                className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
                                {savingCustomer ? 'Saving…' : 'Add customer'}
                              </button>
                              <button type="button" onClick={() => setShowNewCustomer(false)}
                                className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <Input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                              placeholder="Search B2B customers…" />
                            {customerResults.length > 0 && (
                              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                                {customerResults.map(c => (
                                  <button key={c.id} type="button"
                                    onMouseDown={() => { setB2bCustomer(c); setCustomerSearch(''); setCustomerResults([]) }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 last:border-0">
                                    <span className="font-medium text-gray-900 dark:text-gray-100 block truncate">{c.business_name}</span>
                                    {c.ship_to_address && <span className="text-[11px] text-gray-400 truncate block">{c.ship_to_address}</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                            <button type="button" onClick={() => { setShowNewCustomer(true); setNewCustomerName(customerSearch) }}
                              className="mt-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline">
                              + Add a new B2B customer
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className={`flex items-center justify-between rounded-md border px-3 py-2.5
                  ${isTest ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-600'
                           : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
                      Test mode
                      {isTest && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 font-bold uppercase tracking-wide">Beta</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {isTest ? 'PO will be created and receiving will run — but NO inventory changes in Shopify.'
                               : 'Full production mode — all inventory changes apply to Shopify.'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setIsTest(v => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isTest ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isTest ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div>
                  <Label>PO number prefix</Label>
                  <Input value={poNumberPrefix} maxLength={8}
                    onChange={e => setPoNumberPrefix(e.target.value)}
                    placeholder="none (optional)" />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Optional. Sets the auto-number prefix, e.g. {poNumberPrefix.trim() ? `${poNumberPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}-10001` : '10001'}. Leave blank for no prefix — PO numbers are plain from now on.
                  </p>
                </div>

                <div>
                  <Label>PO notes</Label>
                  <Textarea value={poNotes} onChange={e => setPoNotes(e.target.value)}
                    placeholder="Special instructions, catalog notes, publisher contact…" />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Add line items by searching ISBN or title, or scan an order form / invoice / screenshot. You can also save the PO as draft now and add lines later.
                </p>

                {/* Image scan path (#56) — collapsible so it doesn't crowd manual search */}
                <div>
                  {!scanOpen ? (
                    <button type="button" onClick={() => setScanOpen(true)}
                      className="w-full px-3 py-2 rounded-md border border-dashed border-blue-300 dark:border-blue-700 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                      📷 Scan an order form, invoice, or screenshot
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Scan to add lines</p>
                        <button type="button" onClick={() => setScanOpen(false)}
                          className="text-xs text-gray-400 hover:underline">Close scanner</button>
                      </div>
                      <OrderImageScan
                        selectedSupplierName={supplierSelection?.party.name ?? null}
                        existingIsbns={new Set(lines.map(l => l.isbn).filter(Boolean))}
                        onLinesAccepted={addScannedLines}
                      />
                    </div>
                  )}
                </div>

                <VariantSearchRow onPick={openAddLine} existingItemIds={existingItemIds} partyId={supplierSelection?.party.id ?? null} />
                {effectiveAccount?.is_wholesaler && (
                  <p className="text-[11px] text-blue-600 dark:text-blue-400">
                    {supplierSelection?.party.name} is a convenience vendor — the full catalog is searchable here, not just its own titles.
                  </p>
                )}

                <div className="space-y-2 pt-1">
                  {lines.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                      No lines added yet.<br />
                      <span className="text-xs">Search above or save as draft and add lines later.</span>
                    </div>
                  ) : (
                    <>
                      {displayLines.map(line => (
                        <LineRow key={line._key} line={line}
                          onEdit={() => setLineModal({ mode: 'edit', key: line._key })}
                          onRemove={() => removeLine(line._key)} />
                      ))}
                      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 px-1 pt-1">
                        <span>{totalLines} line{totalLines !== 1 ? 's' : ''} · {totalQty} units</span>
                        {totalList > 0 && <span>List value: ${totalList.toFixed(2)}</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {qtyOneLine && (
                  <div className="px-4 py-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 space-y-2">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">One title at quantity 1</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      This PO has a single line ordered at 1 copy. That is sometimes right — but a quantity
                      left at 1 by mistake looks exactly the same. Check it before saving.
                    </p>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setLineModal({ mode: 'edit', key: qtyOneLine._key })}
                        className="px-3 py-1.5 rounded border border-amber-400 dark:border-amber-600 text-xs font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40">
                        Change quantity
                      </button>
                      <span className="text-[11px] text-amber-600 dark:text-amber-400">Saving keeps quantity 1.</span>
                    </div>
                  </div>
                )}

                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Order header</h4>
                  </div>
                  <div className="px-4 py-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Supplier</span><span className="font-medium">{supplierSelection?.party.name}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Account</span><span>{effectiveAccount?.label}{effectiveAccount?.account_number ? ` · #${effectiveAccount.account_number}` : ''}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Receiving at</span><span>{locationName(destinationLocationId)}</span></div>
                    {orderedAt && <div className="flex justify-between"><span className="text-gray-500">Order date</span><span>{orderedAt}</span></div>}
                    {expectedAt && <div className="flex justify-between"><span className="text-gray-500">Expected</span><span>{expectedAt}</span></div>}
                    {isAdHoc && <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="text-amber-600 dark:text-amber-400 font-medium">Ad hoc</span></div>}
                    {isB2b && <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="text-indigo-600 dark:text-indigo-400 font-medium">B2B</span></div>}
                    {isB2b && b2bCustomer && <div className="flex justify-between"><span className="text-gray-500">Ship-to (B2B)</span><span className="text-right max-w-[60%] text-xs">{b2bCustomer.business_name}{b2bCustomer.ship_to_address ? ` — ${b2bCustomer.ship_to_address}` : ''}</span></div>}
                    {isDropShip && <div className="flex justify-between"><span className="text-gray-500">Drop-ship to</span><span className="text-right max-w-[60%] text-xs">{dropShipAddress}</span></div>}
                    {poNotes && <div className="flex justify-between gap-4"><span className="text-gray-500 shrink-0">Notes</span><span className="text-right text-xs text-gray-600 dark:text-gray-400">{poNotes}</span></div>}
                  </div>
                </div>

                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Line items</h4>
                    <span className="text-xs text-gray-400">
                      {totalLines} line{totalLines !== 1 ? 's' : ''} · {totalQty} units{totalList > 0 ? ` · $${totalList.toFixed(2)} list` : ''}
                    </span>
                  </div>
                  {lines.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 italic">No lines — PO will be saved as draft for line entry later.</div>
                  ) : (
                    <div className="divide-y dark:divide-gray-800">
                      {displayLines.map(line => (
                        <div key={line._key} className="px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{line.title}</p>
                            <p className="text-xs text-gray-400 font-mono">{line.isbn}</p>
                            {line.notes && <p className="text-xs text-gray-500 dark:text-gray-400 italic truncate">{line.notes}</p>}
                          </div>
                          <div className="text-right shrink-0 text-xs text-gray-500">
                            <p>Qty: <span className="font-semibold text-gray-900 dark:text-gray-100">{line.quantity_ordered}</span></p>
                            {line.unit_cost && <p>List ${parseFloat(line.unit_cost).toFixed(2)}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {isTest && (
                  <div className="px-3 py-2.5 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠ Test mode active — this PO will NOT update Shopify inventory when received.
                  </div>
                )}

                {error && (
                  <div className="px-3 py-2.5 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">{error}</div>
                )}
              </div>
            )}

        {/* Line entry / edit — rendered inside the builder's ModalShell so it
            stacks one layer above it and Escape closes it first. */}
        {lineModal?.mode === 'add' && (
          <LineEntryModal
            mode="add"
            title={lineModal.item.title}
            isbn={lineModal.item.isbn}
            onSave={(qty, notes) => { addLine(lineModal.item, qty, notes); setLineModal(null) }}
            onClose={() => setLineModal(null)}
          />
        )}
        {lineModal?.mode === 'edit' && editingLine && (
          <LineEntryModal
            mode="edit"
            title={editingLine.title}
            isbn={editingLine.isbn}
            initialQty={editingLine.quantity_ordered}
            initialNotes={editingLine.notes}
            onSave={(qty, notes) => { updateLine(editingLine._key, { quantity_ordered: qty, notes }); setLineModal(null) }}
            onClose={() => setLineModal(null)}
          />
        )}
      </div>
    </ModalShell>
  )
}
