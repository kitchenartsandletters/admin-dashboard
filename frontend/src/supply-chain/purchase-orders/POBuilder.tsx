// POBuilder.tsx
// Modal form for creating a new purchase order.
//
// Flow:
//   Step 1 — Header: supplier account, destination location, dates, flags
//   Step 2 — Lines: add line items by ISBN/title search
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

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useLocations } from '../hooks/useLocations'
import {
  fetchSuppliers,
  fetchSupplierDetail,
  createPurchaseOrder,
  createPOLine,
  searchVariants,
} from '../../api/supplyChainApi'
import { SupplierParty, SupplierAccount } from '../suppliers/supplierTypes'
import type { SupplierDetail } from '../suppliers/supplierTypes'
import { AdHocSource } from '../purchase-orders/purchaseOrderTypes'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItem {
  _key: string                // local temp key for React list
  inventory_item_id: string
  variant_id: string
  title: string
  isbn: string
  quantity_ordered: number
  unit_cost: string           // string for input control; parsed on save
  notes: string
}

interface VariantSearchResult {
  inventory_item_id: string
  variant_id: string
  title: string
  isbn: string
  vendor: string
}

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
// Supplier account picker
// ---------------------------------------------------------------------------

function SupplierAccountPicker({
  value,
  onChange,
}: {
  value: { party: SupplierParty; account: SupplierAccount } | null
  onChange: (val: { party: SupplierParty; account: SupplierAccount } | null) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SupplierParty[]>([])
  const [open, setOpen] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (search.length < 2) { setResults([]); return }
    fetchSuppliers({ search, activeOnly: true })
      .then(r => setResults(r.slice(0, 8)))
      .catch(() => {})
  }, [search])

  const selectParty = async (party: SupplierParty) => {
    setLoadingAccounts(true)
    setOpen(false)
    try {
      const detail = await fetchSupplierDetail(party.id)
      const primary = detail.accounts.find(a => a.is_primary) ?? detail.accounts[0]
      if (primary) {
        onChange({ party, account: primary })
        setSearch(party.name)
      }
    } catch {
      // ignore
    } finally {
      setLoadingAccounts(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <Label required>Supplier</Label>
      <Input
        value={value ? value.party.name : search}
        onChange={e => {
          setSearch(e.target.value)
          onChange(null)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search active suppliers…"
        disabled={loadingAccounts}
      />
      {loadingAccounts && (
        <p className="text-xs text-gray-400 mt-1">Loading accounts…</p>
      )}
      {value && (
        <div className="mt-1.5 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs">
          <span className="font-semibold text-blue-800 dark:text-blue-200">
            {value.account.label}
          </span>
          {value.account.account_number && (
            <span className="text-blue-600 dark:text-blue-300 ml-2">
              #{value.account.account_number}
            </span>
          )}
          {value.account.ordering_method && (
            <span className="text-blue-500 dark:text-blue-400 ml-2 capitalize">
              via {value.account.ordering_method.replace('_', ' ')}
            </span>
          )}
          <button
            type="button"
            onClick={() => { onChange(null); setSearch('') }}
            className="ml-2 text-blue-400 hover:text-red-500"
          >
            ✕
          </button>
        </div>
      )}
      {open && results.length > 0 && !value && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow-xl overflow-hidden">
          {results.map(party => (
            <button
              key={party.id}
              type="button"
              onMouseDown={() => selectParty(party)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 last:border-0"
            >
              <span className="font-medium text-gray-900 dark:text-gray-100">{party.name}</span>
              {party.roles.length > 0 && (
                <span className="text-xs text-gray-400 ml-2">{party.roles[0]}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant / line item search
// ---------------------------------------------------------------------------

function VariantSearchRow({
  onAdd,
  existingItemIds,
}: {
  onAdd: (item: Omit<LineItem, '_key' | 'quantity_ordered' | 'unit_cost' | 'notes'>) => void
  existingItemIds: Set<string>
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
        const data = await searchVariants(query)
        setResults(data.slice(0, 10))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const handleSelect = (v: VariantSearchResult) => {
    onAdd({
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
// Individual line item row
// ---------------------------------------------------------------------------

function LineRow({
  line,
  onChange,
  onRemove,
}: {
  line: LineItem
  onChange: (patch: Partial<LineItem>) => void
  onRemove: () => void
}) {
  return (
    <div className="border dark:border-gray-700 rounded-md p-3 space-y-2 bg-gray-50/50 dark:bg-gray-800/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{line.title}</p>
          <p className="text-xs text-gray-400 font-mono">{line.isbn}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none shrink-0 mt-0.5"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label required>Qty</Label>
          <Input
            type="number"
            min={1}
            value={line.quantity_ordered}
            onChange={e => onChange({ quantity_ordered: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </div>
        <div>
          <Label>Unit cost ($)</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={line.unit_cost}
            onChange={e => onChange({ unit_cost: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label>Notes</Label>
          <Input
            value={line.notes}
            onChange={e => onChange({ notes: e.target.value })}
            placeholder="Optional"
          />
        </div>
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
    <div className="flex items-center gap-2 px-5 py-3 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
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
  initialSupplier?: SupplierDetail  // pre-loads supplier when opened from sidebar
  onClose: () => void
  onCreated: (poId: string) => void
}

export default function POBuilder({ onClose, onCreated, initialSupplier }: Props) {
  const [isVisible, setIsVisible] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const { locations, locationName } = useLocations()

  // Header fields
  // Pre-load supplier from initialSupplier prop
  const getInitialSelection = () => {
    if (!initialSupplier) return null
    const primary = initialSupplier.accounts.find(a => a.is_primary) ?? initialSupplier.accounts[0]
    if (!primary) return null
    return { party: initialSupplier.party, account: primary }
  }

  const [supplierSelection, setSupplierSelection] = useState<{
    party: SupplierParty
    account: SupplierAccount
  } | null>(getInitialSelection)
  const [destinationLocationId, setDestinationLocationId] = useState('')
  const [orderedAt, setOrderedAt] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [poNotes, setPoNotes] = useState('')
  const [isAdHoc, setIsAdHoc] = useState(false)
  const [adHocSource, setAdHocSource] = useState<AdHocSource | ''>('')
  const [informalRef, setInformalRef] = useState('')
  const [isDropShip, setIsDropShip] = useState(false)
  const [dropShipAddress, setDropShipAddress] = useState('')

  // Line items
  const [lines, setLines] = useState<LineItem[]>([])

  // Slide in on mount
  useEffect(() => {
    setTimeout(() => setIsVisible(true), 10)
  }, [])

  // Default destination to HQ (first active non-seasonal location)
  useEffect(() => {
    if (locations.length > 0 && !destinationLocationId) {
      const hq = locations.find(l => l.is_active && !l.is_seasonal) ?? locations[0]
      setDestinationLocationId(hq.id)
    }
  }, [locations])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()   // prevents sidebar from also closing
        handleClose()
      }
    }
    window.addEventListener('keydown', handleEsc, true)  // capture phase
    return () => window.removeEventListener('keydown', handleEsc, true)
  }, [])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 300)
  }

  // Step 1 validation
  const step1Valid = !!supplierSelection && !!destinationLocationId &&
    (!isDropShip || dropShipAddress.trim().length > 0)

  // Step 2 can proceed with zero lines (ad hoc POs sometimes have no lines at creation)
  const step2Valid = true

  const addLine = (item: Omit<LineItem, '_key' | 'quantity_ordered' | 'unit_cost' | 'notes'>) => {
    setLines(prev => [...prev, {
      ...item,
      _key: crypto.randomUUID(),
      quantity_ordered: 1,
      unit_cost: '',
      notes: '',
    }])
  }

  const updateLine = (key: string, patch: Partial<LineItem>) => {
    setLines(prev => prev.map(l => l._key === key ? { ...l, ...patch } : l))
  }

  const removeLine = (key: string) => {
    setLines(prev => prev.filter(l => l._key !== key))
  }

  const existingItemIds = new Set(lines.map(l => l.inventory_item_id))

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const handleCreate = async (andSubmit: boolean) => {
    if (!supplierSelection || !destinationLocationId) return
    setBusy(true)
    setError(null)

    try {
      // 1. Create the PO header
      const po = await createPurchaseOrder({
        supplier_account_id:     supplierSelection.account.id,
        destination_location_id: destinationLocationId,
        ordered_at:              orderedAt  || undefined,
        expected_at:             expectedAt || undefined,
        notes:                   poNotes.trim() || undefined,
        is_ad_hoc:               isAdHoc,
        ad_hoc_source:           (adHocSource || undefined) as AdHocSource | undefined,
        informal_ref:            informalRef.trim() || undefined,
        is_drop_ship:            isDropShip,
        drop_ship_address:       isDropShip ? dropShipAddress.trim() : undefined,
      })

      // 2. Add lines sequentially
      for (const line of lines) {
        await createPOLine(po.id, {
          inventory_item_id: line.inventory_item_id,
          variant_id:        line.variant_id,
          quantity_ordered:  line.quantity_ordered,
          unit_cost:         line.unit_cost !== '' ? parseFloat(line.unit_cost) : undefined,
          notes:             line.notes.trim() || undefined,
        })
      }

      // 3. Optionally submit
      if (andSubmit) {
        await fetch(
          `${import.meta.env.VITE_SC_BASE_URL}/api/purchase-orders/${po.id}/submit`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Token': import.meta.env.VITE_SC_ADMIN_TOKEN,
            },
          }
        )
      }

      onCreated(po.id)
      handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create purchase order')
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const totalLines = lines.length
  const totalQty = lines.reduce((s, l) => s + l.quantity_ordered, 0)
  const totalCost = lines.reduce((s, l) => s + (parseFloat(l.unit_cost) || 0) * l.quantity_ordered, 0)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div className={`fixed inset-0 z-50 flex items-start justify-center pt-6 px-4 pb-6 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="w-full max-w-2xl bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[92vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800 shrink-0">
            <h2 className="font-bold text-gray-900 dark:text-white text-lg">New Purchase Order</h2>
            <button onClick={handleClose} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
              Cancel
            </button>
          </div>

          {/* Step bar */}
          <StepBar step={step} />

          {/* Content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

            {/* ── STEP 1: Header ── */}
            {step === 1 && (
              <div className="space-y-5">

                <SupplierAccountPicker
                  value={supplierSelection}
                  onChange={setSupplierSelection}
                />

                {/* Destination location */}
                <div>
                  <Label required>Receiving location</Label>
                  <Select
                    value={destinationLocationId}
                    onChange={e => setDestinationLocationId(e.target.value)}
                  >
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

                {/* Dates */}
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

                {/* Flags */}
                <div className="space-y-3">
                  {/* Ad hoc */}
                  <div className="flex items-center justify-between rounded-md border dark:border-gray-700 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Ad hoc order</p>
                      <p className="text-[11px] text-gray-400">Order placed outside standard purchasing workflow</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAdHoc(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                        ${isAdHoc ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
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
                        <Input
                          value={informalRef}
                          onChange={e => setInformalRef(e.target.value)}
                          placeholder="INV-12345"
                        />
                      </div>
                    </div>
                  )}

                  {/* Drop-ship */}
                  <div className="flex items-center justify-between rounded-md border dark:border-gray-700 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Drop-ship</p>
                      <p className="text-[11px] text-gray-400">Supplier ships directly to an event venue — HQ will not receive</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDropShip(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                        ${isDropShip ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isDropShip ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {isDropShip && (
                    <div className="pl-2">
                      <Label required>Ship-to address</Label>
                      <Textarea
                        value={dropShipAddress}
                        onChange={e => setDropShipAddress(e.target.value)}
                        placeholder="Museum of Food and Drink&#10;62 Bayard Street, Brooklyn NY 11222"
                      />
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <Label>PO notes</Label>
                  <Textarea
                    value={poNotes}
                    onChange={e => setPoNotes(e.target.value)}
                    placeholder="Special instructions, catalog notes, publisher contact…"
                  />
                </div>
              </div>
            )}

            {/* ── STEP 2: Lines ── */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    Add line items by searching ISBN or title. You can also save the PO as draft now and add lines later.
                  </p>
                  <VariantSearchRow onAdd={addLine} existingItemIds={existingItemIds} />
                </div>

                {lines.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                    No lines added yet.
                    <br />
                    <span className="text-xs">Search above or save as draft and add lines later.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lines.map(line => (
                      <LineRow
                        key={line._key}
                        line={line}
                        onChange={patch => updateLine(line._key, patch)}
                        onRemove={() => removeLine(line._key)}
                      />
                    ))}
                  </div>
                )}

                {lines.length > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 px-1 pt-1">
                    <span>{totalLines} line{totalLines !== 1 ? 's' : ''} · {totalQty} units</span>
                    {totalCost > 0 && (
                      <span>Est. cost: ${totalCost.toFixed(2)}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 3: Review ── */}
            {step === 3 && (
              <div className="space-y-4">
                {/* PO summary */}
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Order header
                    </h4>
                  </div>
                  <div className="px-4 py-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Supplier</span>
                      <span className="font-medium">{supplierSelection?.party.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Account</span>
                      <span>{supplierSelection?.account.label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Receiving at</span>
                      <span>{locationName(destinationLocationId)}</span>
                    </div>
                    {orderedAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Order date</span>
                        <span>{orderedAt}</span>
                      </div>
                    )}
                    {expectedAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Expected</span>
                        <span>{expectedAt}</span>
                      </div>
                    )}
                    {isAdHoc && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Type</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Ad hoc</span>
                      </div>
                    )}
                    {isDropShip && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Drop-ship to</span>
                        <span className="text-right max-w-[60%] text-xs">{dropShipAddress}</span>
                      </div>
                    )}
                    {poNotes && (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500 shrink-0">Notes</span>
                        <span className="text-right text-xs text-gray-600 dark:text-gray-400">{poNotes}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lines summary */}
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Line items
                    </h4>
                    <span className="text-xs text-gray-400">
                      {totalLines} line{totalLines !== 1 ? 's' : ''} · {totalQty} units
                      {totalCost > 0 && ` · $${totalCost.toFixed(2)}`}
                    </span>
                  </div>
                  {lines.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 italic">
                      No lines — PO will be saved as draft for line entry later.
                    </div>
                  ) : (
                    <div className="divide-y dark:divide-gray-800">
                      {lines.map(line => (
                        <div key={line._key} className="px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{line.title}</p>
                            <p className="text-xs text-gray-400 font-mono">{line.isbn}</p>
                          </div>
                          <div className="text-right shrink-0 text-xs text-gray-500">
                            <p>Qty: <span className="font-semibold text-gray-900 dark:text-gray-100">{line.quantity_ordered}</span></p>
                            {line.unit_cost && <p>${parseFloat(line.unit_cost).toFixed(2)} ea</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {error && (
                  <div className="px-3 py-2.5 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t dark:border-gray-800 flex items-center justify-between shrink-0 bg-gray-50/50 dark:bg-gray-900/30">
            {/* Back */}
            <button
              type="button"
              onClick={() => setStep(s => Math.max(1, s - 1) as 1 | 2 | 3)}
              disabled={step === 1 || busy}
              className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
            >
              Back
            </button>

            <div className="flex gap-2">
              {step < 3 && (
                <button
                  type="button"
                  onClick={() => setStep(s => Math.min(3, s + 1) as 1 | 2 | 3)}
                  disabled={(step === 1 && !step1Valid) || busy}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]"
                >
                  Next
                </button>
              )}

              {step === 3 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleCreate(false)}
                    disabled={busy}
                    className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {busy ? 'Saving…' : 'Save as draft'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreate(true)}
                    disabled={busy}
                    className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]"
                  >
                    {busy ? 'Submitting…' : 'Save & submit'}
                  </button>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
