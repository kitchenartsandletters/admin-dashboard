// PODetailSidebar.tsx
// Right sidebar for PO detail view.
//
// Fixes in this version:
//   1. onRefresh no longer closes/reopens sidebar — uses targeted state update
//   2. Lines and Add Lines moved below Order details
//   3. Actions section sticky at bottom
//   4. Cross-party product add shows clear error message
//   5. Line items editable (qty update + delete) in draft mode
//   6. Duplicate line detection with UI error
//   7. EditableOrderFields for draft PO header editing

import React, { useEffect, useRef, useState } from 'react'
import {
  PurchaseOrder, PurchaseOrderLine, PurchaseOrderDetail,
  Receipt, ReceiptLine,
  PO_STATUS_LABELS, PO_STATUS_COLORS, AD_HOC_SOURCE_LABELS,
} from './purchaseOrderTypes'
import {
  fetchReceiptsForPO,
  submitPurchaseOrder,
  confirmPurchaseOrder,
  searchVariants,
  createPOLine,
  updatePOLine,
  removePOLine,
  updatePurchaseOrder,
} from '../../api/supplyChainApi'
import type { VariantSearchResult } from '../../api/supplyChainApi'
import { useLocations } from '../hooks/useLocations'

interface Props {
  detail: PurchaseOrderDetail | null
  onClose: () => void
  onReceive: (poId: string) => void
  onRefresh?: () => void
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const DetailItem = ({
  label, value, mono = false,
}: { label: string; value: string | number | null | undefined; mono?: boolean }) => (
  <div className="flex flex-col py-1 border-b border-gray-50 dark:border-gray-800 last:border-0">
    <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">
      {label}
    </span>
    <span className={`text-gray-900 dark:text-gray-100 mt-0.5 text-sm ${mono ? 'font-mono' : ''}`}>
      {value ?? '—'}
    </span>
  </div>
)

const SectionHeader = ({ label }: { label: string }) => (
  <h4 className="font-bold text-gray-900 dark:text-white uppercase text-[11px] tracking-widest border-l-2 border-blue-500 pl-2 mb-3">
    {label}
  </h4>
)

function StatusBadge({ status }: { status: string }) {
  const colors = PO_STATUS_COLORS[status as keyof typeof PO_STATUS_COLORS]
    ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${colors}`}>
      {PO_STATUS_LABELS[status as keyof typeof PO_STATUS_LABELS] ?? status}
    </span>
  )
}

function AdHocBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 uppercase tracking-wide">
      Ad Hoc
    </span>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// EditableOrderFields — draft PO header editing
// ---------------------------------------------------------------------------

function EditableOrderFields({
  order,
  onSaved,
}: {
  order: PurchaseOrder
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [expectedAt, setExpectedAt] = useState(order.expected_at?.slice(0, 10) ?? '')
  const [informalRef, setInformalRef] = useState(order.informal_ref ?? '')
  const [notes, setNotes] = useState(order.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await updatePurchaseOrder(order.id, {
        expected_at:  expectedAt || undefined,
        informal_ref: informalRef || undefined,
        notes:        notes || undefined,
      })
      setEditing(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 text-xs text-gray-500 dark:text-gray-400 min-w-0">
          {order.expected_at && <p>Expected: {formatDate(order.expected_at)}</p>}
          {order.informal_ref && <p>Ref: <span className="font-mono">{order.informal_ref}</span></p>}
          {order.notes && <p className="italic truncate">{order.notes.slice(0, 80)}{order.notes.length > 80 ? '…' : ''}</p>}
          {!order.expected_at && !order.informal_ref && !order.notes && (
            <p className="text-gray-300 dark:text-gray-600 text-[11px]">No details set — click Edit to add</p>
          )}
        </div>
        <button type="button" onClick={() => setEditing(true)}
          className="text-[10px] text-blue-500 hover:underline shrink-0">
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Expected arrival</p>
        <input type="date" value={expectedAt} onChange={e => setExpectedAt(e.target.value)}
          className="w-full px-2.5 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Supplier ref</p>
        <input value={informalRef} onChange={e => setInformalRef(e.target.value)}
          placeholder="Supplier's order or invoice number"
          className="w-full px-2.5 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Notes</p>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className="w-full px-2.5 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none resize-none" />
      </div>
      {error && <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setEditing(false)} disabled={saving}
          className="px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-[10px] text-gray-600 dark:text-gray-300 disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex-1 px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InlineLineEntry — add lines to a draft PO
// ---------------------------------------------------------------------------

function InlineLineEntry({
  poId,
  existingItemIds,
  onLineAdded,
}: {
  poId: string
  existingItemIds: Set<string>   // Fix 6: duplicate detection
  onLineAdded: (newLine: PurchaseOrderLine) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VariantSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [qty, setQty] = useState(1)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(() => {
      searchVariants(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setResults([])
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleAdd = async (variant: VariantSearchResult) => {
    setError(null)

    // Fix 6: duplicate detection
    if (existingItemIds.has(variant.inventory_item_id)) {
      setError(`"${variant.title}" is already on this PO.`)
      setResults([])
      setQuery('')
      return
    }

    setAdding(variant.inventory_item_id)
    try {
      const newLine = await createPOLine(poId, {
        inventory_item_id: variant.inventory_item_id,
        variant_id:        variant.variant_id,
        quantity_ordered:  Number(qty),
      }) as PurchaseOrderLine
      setQuery('')
      setResults([])
      setQty(1)
      onLineAdded(newLine)
    } catch (e) {
      // Fix 4: clear error message for cross-party and other failures
      const msg = e instanceof Error ? e.message : 'Failed to add line'
      if (msg.includes('500') || msg.includes('fetch')) {
        setError('Could not add this title — it may belong to a different supplier. Check the vendor and try again.')
      } else {
        setError(msg)
      }
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="space-y-2" ref={ref}>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input value={query} onChange={e => { setQuery(e.target.value); setError(null) }}
            placeholder="Search by title or ISBN…"
            className="w-full px-2.5 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none" />
          {searching && (
            <span className="absolute right-2 top-1.5 text-[10px] text-gray-400 animate-pulse">searching…</span>
          )}
        </div>
        <input type="number" min={1} value={qty}
          onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-14 px-2 py-1.5 border rounded text-xs text-center dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none"
          title="Quantity" />
      </div>

      {results.length > 0 && (
        <div className="border dark:border-gray-700 rounded overflow-hidden bg-white dark:bg-gray-900 shadow-lg">
          {results.slice(0, 6).map(r => {
            const isDuplicate = existingItemIds.has(r.inventory_item_id)
            return (
              <button key={r.inventory_item_id} type="button"
                disabled={!!adding || isDuplicate}
                onMouseDown={e => { e.preventDefault(); handleAdd(r) }}
                className={`w-full text-left px-3 py-2 border-b dark:border-gray-800 last:border-0
                  ${isDuplicate
                    ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-900'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50'}`}
              >
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                  {adding === r.inventory_item_id ? 'Adding…' : r.title}
                  {isDuplicate && <span className="ml-1 text-[10px] text-amber-500">(already added)</span>}
                </p>
                <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">{r.isbn}</p>
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p className="text-[10px] text-red-600 dark:text-red-400 leading-snug">{error}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LineItemRow — individual line with edit/delete for draft POs
// ---------------------------------------------------------------------------

function LineItemRow({
  line,
  isDraft,
  onQtyChange,
  onDelete,
}: {
  line: PurchaseOrderLine
  isDraft: boolean
  onQtyChange: (lineId: string, qty: number) => Promise<void>
  onDelete: (lineId: string) => Promise<void>
}) {
  const [editQty, setEditQty] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleQtySave = async () => {
    if (editQty === null || editQty === line.quantity_ordered) {
      setEditQty(null)
      return
    }
    setSaving(true)
    try {
      await onQtyChange(line.id, editQty)
      setEditQty(null)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(line.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`py-2.5 flex items-start justify-between gap-2 ${deleting ? 'opacity-40' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">
          {line.title ?? line.inventory_item_id.split('/').pop()}
        </p>
        <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
          {line.isbn ?? line.supplier_sku ?? ''}
        </p>
      </div>

      {isDraft ? (
        <div className="flex items-center gap-1.5 shrink-0">
          {editQty !== null ? (
            <>
              <input type="number" min={1} value={editQty}
                onChange={e => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 px-1.5 py-1 border rounded text-xs text-center dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-1 focus:ring-blue-500 outline-none"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleQtySave(); if (e.key === 'Escape') setEditQty(null) }}
              />
              <button type="button" onClick={handleQtySave} disabled={saving}
                className="text-[10px] text-blue-500 hover:underline disabled:opacity-50">
                {saving ? '…' : '✓'}
              </button>
              <button type="button" onClick={() => setEditQty(null)}
                className="text-[10px] text-gray-400 hover:text-gray-600">✕</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setEditQty(line.quantity_ordered)}
                className="text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-blue-500 tabular-nums min-w-[2rem] text-right"
                title="Click to edit quantity">
                {line.quantity_ordered}
              </button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-base leading-none ml-1 disabled:opacity-40"
                title="Remove line">
                ×
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {line.quantity_received}/{line.quantity_ordered}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">rcvd/ord</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Receipt section
// ---------------------------------------------------------------------------

function ReceiptSection({ poId }: { poId: string }) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetchReceiptsForPO(poId)
      .then(setReceipts)
      .catch(() => setReceipts([]))
      .finally(() => setLoading(false))
  }, [poId])

  if (loading) return (
    <div className="space-y-1">
      {[1, 2].map(i => <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}
    </div>
  )
  if (receipts.length === 0) return (
    <p className="text-xs text-gray-400 dark:text-gray-500">No receipts recorded yet.</p>
  )

  return (
    <div className="space-y-2">
      {receipts.map(r => (
        <div key={r.id} className="border dark:border-gray-700 rounded-md overflow-hidden">
          <button type="button"
            onClick={() => setExpanded(prev => prev === r.id ? null : r.id)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-left">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase
                ${r.status === 'applied'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-gray-100 text-gray-500'}`}>
                {r.status}
              </span>
              <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{r.id.slice(0, 8)}</span>
            </div>
            <span className="text-[11px] text-gray-400">{formatDateTime(r.received_at)}</span>
          </button>
          {expanded === r.id && <ReceiptLines receiptId={r.id} />}
        </div>
      ))}
    </div>
  )
}

function ReceiptLines({ receiptId }: { receiptId: string }) {
  const [lines, setLines] = useState<ReceiptLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    import('../../api/supplyChainApi').then(({ fetchReceipt }) => {
      fetchReceipt(receiptId)
        .then(result => setLines(result.lines as ReceiptLine[]))
        .catch(() => setLines([]))
        .finally(() => setLoading(false))
    })
  }, [receiptId])

  if (loading) return <div className="px-3 py-2"><div className="h-4 w-full bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></div>

  return (
    <div className="divide-y dark:divide-gray-800">
      {lines.map(line => (
        <div key={line.id} className="px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-gray-500 dark:text-gray-400 truncate text-[10px]">
              {line.inventory_item_id.split('/').pop()}
            </span>
            <span className={`font-semibold ${(line.delta ?? line.quantity_received) > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              +{line.delta ?? line.quantity_received}
            </span>
          </div>
          {line.restock_applied_at && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500">Applied {formatDateTime(line.restock_applied_at)}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

const PODetailSidebar: React.FC<Props> = ({ detail, onClose, onReceive, onRefresh }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionError, setTransitionError] = useState<string | null>(null)

  // Fix 1: local lines state — updated without full sidebar remount
  const [localLines, setLocalLines] = useState<PurchaseOrderLine[]>([])

  const contentRef = useRef<HTMLDivElement>(null)
  const wasNullRef = useRef(true)
  const { locationName } = useLocations()

  useEffect(() => {
    const isNull = detail === null
    const wasNull = wasNullRef.current
    wasNullRef.current = isNull

    if (!isNull && wasNull) {
      setMounted(true)
      setLocalLines(detail?.lines ?? [])
      requestAnimationFrame(() => requestAnimationFrame(() => setIsOpen(true)))
    } else if (isNull && !wasNull) {
      setIsOpen(false)
      const t = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(t)
    } else if (!isNull) {
      // Detail updated (e.g. after save) — sync lines without remount
      setLocalLines(detail?.lines ?? [])
    }
  }, [detail])

  useEffect(() => {
    if (detail) contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [detail?.order.id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose() }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isOpen, onClose])

  if (!mounted || !detail) return null

  const { order } = detail
  const isDraft = order.status === 'draft'
  const canReceive = ['submitted', 'confirmed', 'partial'].includes(order.status)
  const totalOrdered = localLines.reduce((s, l) => s + l.quantity_ordered, 0)
  const totalReceived = localLines.reduce((s, l) => s + l.quantity_received, 0)
  const existingItemIds = new Set(localLines.map(l => l.inventory_item_id))

  // Fix 1: add line without remounting sidebar
  const handleLineAdded = (newLine: PurchaseOrderLine) => {
    setLocalLines(prev => [...prev, newLine])
  }

  // Fix 5: update qty inline
  const handleQtyChange = async (lineId: string, qty: number) => {
    await updatePOLine(lineId, { quantity_ordered: qty })
    setLocalLines(prev => prev.map(l => l.id === lineId ? { ...l, quantity_ordered: qty } : l))
    onRefresh?.()
  }

  // Fix 5: delete line inline
  const handleDeleteLine = async (lineId: string) => {
    await removePOLine(lineId)
    setLocalLines(prev => prev.filter(l => l.id !== lineId))
    onRefresh?.()
  }

  const handleTransition = async (action: 'submit' | 'confirm') => {
    setTransitioning(true)
    setTransitionError(null)
    try {
      if (action === 'submit') await submitPurchaseOrder(order.id)
      if (action === 'confirm') await confirmPurchaseOrder(order.id)
      onRefresh?.()
    } catch (e) {
      setTransitionError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setTransitioning(false)
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[30rem] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-bold text-base text-gray-900 dark:text-white font-mono">{order.po_number}</h3>
              <StatusBadge status={order.status} />
              {order.is_ad_hoc && <AdHocBadge />}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {order.supplier_name ?? order.account_label ?? order.supplier_account_id}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {canReceive && (
              <button onClick={() => onReceive(order.id)}
                className="px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
                Receive →
              </button>
            )}
            <button onClick={onClose} className="text-sm text-gray-500 hover:underline">Close</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-5 space-y-7 pb-4 text-sm">

          {/* Order details */}
          <section>
            <SectionHeader label="Order" />
            <div className="space-y-2">
              <DetailItem label="Supplier" value={order.supplier_name ?? order.account_label} />
              <DetailItem label="Account" value={order.account_label} />
              <DetailItem label="Receiving at" value={locationName(order.destination_location_id)} />
              <DetailItem label="Ordered" value={formatDate(order.ordered_at)} />
              <DetailItem label="Expected" value={formatDate(order.expected_at)} />
              {order.is_ad_hoc && (
                <>
                  <DetailItem label="Order source"
                    value={order.ad_hoc_source ? AD_HOC_SOURCE_LABELS[order.ad_hoc_source] : undefined} />
                  {order.informal_ref && <DetailItem label="Supplier ref" value={order.informal_ref} />}
                </>
              )}
              {order.notes && (
                <div className="flex flex-col py-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">Notes</span>
                  <p className="text-gray-700 dark:text-gray-300 mt-0.5 text-sm leading-relaxed">{order.notes}</p>
                </div>
              )}
              {isDraft && (
                <div className="pt-2 border-t dark:border-gray-800">
                  <EditableOrderFields order={order} onSaved={() => onRefresh?.()} />
                </div>
              )}
            </div>
          </section>

          {/* Lines — Fix 2: moved below Order */}
          <section>
            <SectionHeader label={`Lines (${localLines.length})`} />
            {localLines.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No lines on this PO.</p>
            ) : (
              <>
                <div className="divide-y dark:divide-gray-800">
                  {localLines.map(line => (
                    <LineItemRow
                      key={line.id}
                      line={line}
                      isDraft={isDraft}
                      onQtyChange={handleQtyChange}
                      onDelete={handleDeleteLine}
                    />
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t dark:border-gray-700 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{localLines.length} line{localLines.length !== 1 ? 's' : ''}</span>
                  <span>{isDraft ? `${totalOrdered} units ordered` : `${totalReceived} / ${totalOrdered} units received`}</span>
                </div>
              </>
            )}

            {/* Add line — Fix 2: part of Lines section */}
            {isDraft && (
              <div className="mt-3 pt-3 border-t dark:border-gray-700">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-2">
                  Add line
                </p>
                <InlineLineEntry
                  poId={order.id}
                  existingItemIds={existingItemIds}
                  onLineAdded={handleLineAdded}
                />
              </div>
            )}
          </section>

          {/* Receipts */}
          <section>
            <SectionHeader label="Receipts" />
            <ReceiptSection poId={order.id} />
          </section>

          {/* Supersession */}
          {(order.supersedes_ids?.length > 0 || order.superseded_by) && (
            <section>
              <SectionHeader label="Supersession" />
              {order.superseded_by && (
                <p className="text-xs text-amber-600 dark:text-amber-400">This PO was superseded.</p>
              )}
              {order.supersedes_ids?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Replaces:</p>
                  {order.supersedes_ids.map(id => (
                    <p key={id} className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{id}</p>
                  ))}
                </div>
              )}
            </section>
          )}

        </div>

        {/* Fix 3: Actions sticky at bottom */}
        <div className="shrink-0 border-t dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-3 space-y-2">
          {isDraft && (
            <button onClick={() => handleTransition('submit')}
              disabled={transitioning || localLines.length === 0}
              className="w-full px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
              {transitioning ? 'Submitting…' : 'Submit PO → Submitted'}
            </button>
          )}
          {order.status === 'submitted' && (
            <button onClick={() => handleTransition('confirm')}
              disabled={transitioning}
              className="w-full px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
              {transitioning ? 'Confirming…' : 'Mark as Confirmed'}
            </button>
          )}
          {isDraft && localLines.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">Add lines before submitting</p>
          )}
          {order.status === 'received' && (
            <p className="text-xs text-center text-green-600 dark:text-green-400 font-semibold">✓ Fully received</p>
          )}
          {transitionError && (
            <p className="text-xs text-red-600 dark:text-red-400">{transitionError}</p>
          )}
        </div>
      </div>
    </>
  )
}

export default PODetailSidebar
