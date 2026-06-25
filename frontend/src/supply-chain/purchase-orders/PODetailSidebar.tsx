// PODetailSidebar.tsx
//
// Layout modes:
//   Draft + desktop  → split pane: order details left, lines/add-line right
//   Draft + mobile   → single column, lines below order details
//   Non-draft        → single column, compact read-only lines
//
// Refresh fix: sidebar never receives null during a refresh.
// POService passes `detail` directly (not `detailLoading ? null : detail`).
// The sidebar syncs localLines from detail updates without toggling open state.
//
// #40: Receipt PDF download available per receipt in the Receipts section.
//      Each receipt row shows status + ID on the first line, and
//      datetime + ↓ PDF on the second line — two-line layout avoids
//      overlap in the narrow sidebar column.
//
// #41: LineItemRow now surfaces damage context for non-draft lines:
//      - quantity_damaged > 0 shows an amber "X dmg" badge inline
//      - damage_resolution shown as "credit" (green) or "repl." (blue)
//      - quantity_received = 0 with damage does NOT show a green ✓ badge
//      - Unresolved damage lines show a "Resolve" action that calls
//        PATCH /api/receiving/lines/{po_line_id}/damage
//
// #46: LinesPanel sorts lines alphabetically by title (leading-article agnostic:
//      strips "A ", "An ", "The " before comparing). Non-draft POs split into
//      two collapsible groups — Pending (0 received) above Received/Done below.
//
// #47: LinesPanel has a search input that filters by title, ISBN, or supplier SKU.
//      When a query is active the Pending/Received split collapses to a single
//      flat list of matching lines. Clearing the query restores the grouped view.

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PurchaseOrder, PurchaseOrderLine, PurchaseOrderDetail,
  Receipt, ReceiptLine,
  PO_STATUS_LABELS, PO_STATUS_COLORS, AD_HOC_SOURCE_LABELS,
  DamageResolution,
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
  downloadPOPdf,
  downloadReceiptPdf,
  resolveDamage,
} from '../../api/supplyChainApi'
import type { VariantSearchResult } from '../../api/supplyChainApi'
import { useLocations } from '../hooks/useLocations'

interface Props {
  detail: PurchaseOrderDetail | null
  onClose: () => void
  onReceive: (poId: string) => void
  onRefresh?: () => void
  wide?: boolean
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const DetailItem = ({
  label, value, mono = false,
}: { label: string; value: string | number | null | undefined; mono?: boolean }) => (
  <div className="flex flex-col py-1 border-b border-gray-50 dark:border-gray-800 last:border-0">
    <span className="kal-text-label text-gray-400 dark:text-gray-500">{label}</span>
    <span className={`text-gray-900 dark:text-gray-100 mt-0.5 text-[var(--text-body)] ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
  </div>
)

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h4 className="font-bold text-gray-900 dark:text-white uppercase kal-text-label border-l-2 border-blue-500 pl-2 mb-3">
    {children}
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
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[var(--text-label)] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 uppercase tracking-wide">
      Ad Hoc
    </span>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Article-agnostic sort key (#46)
// ---------------------------------------------------------------------------

function titleSortKey(line: PurchaseOrderLine): string {
  const raw = (line.title ?? line.isbn ?? line.inventory_item_id ?? '').toLowerCase()
  return raw.replace(/^(a |an |the )/i, '').trim()
}

function sortLines(lines: PurchaseOrderLine[]): PurchaseOrderLine[] {
  return [...lines].sort((a, b) => titleSortKey(a).localeCompare(titleSortKey(b)))
}

function isLineDone(line: PurchaseOrderLine): boolean {
  return line.status === 'received' || line.quantity_received >= line.quantity_ordered
}

// ---------------------------------------------------------------------------
// Line search filter (#47)
// Matches case-insensitively against title, isbn, and supplier_sku.
// ---------------------------------------------------------------------------

function filterLines(lines: PurchaseOrderLine[], query: string): PurchaseOrderLine[] {
  const q = query.trim().toLowerCase()
  if (!q) return lines
  return lines.filter(l =>
    (l.title        ?? '').toLowerCase().includes(q) ||
    (l.isbn         ?? '').toLowerCase().includes(q) ||
    (l.supplier_sku ?? '').toLowerCase().includes(q)
  )
}

// ---------------------------------------------------------------------------
// LineGroupHeader
// ---------------------------------------------------------------------------

function LineGroupHeader({
  label, count, expanded, onToggle, accent,
}: {
  label: string; count: number; expanded: boolean
  onToggle: () => void; accent: 'amber' | 'green' | 'gray'
}) {
  const dotColor = { amber: 'bg-amber-400', green: 'bg-green-500', gray: 'bg-gray-400' }[accent]
  return (
    <button type="button" onClick={onToggle}
      className="w-full flex items-center justify-between py-1.5 text-left group">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label} ({count})
        </span>
      </div>
      <span className="text-[10px] text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors">
        {expanded ? '▾' : '▸'}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// EditableOrderFields
// ---------------------------------------------------------------------------

function EditableOrderFields({ order, onSaved }: { order: PurchaseOrder; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [expectedAt, setExpectedAt] = useState(order.expected_at?.slice(0, 10) ?? '')
  const [informalRef, setInformalRef] = useState(order.informal_ref ?? '')
  const [notes, setNotes] = useState(order.notes ?? '')
  const [orderedAt, setOrderedAt] = useState(order.ordered_at?.slice(0, 10) ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      await updatePurchaseOrder(order.id, {
        ordered_at:   orderedAt  || undefined,
        expected_at:  expectedAt || undefined,
        informal_ref: informalRef || undefined,
        notes:        notes || undefined,
      })
      setEditing(false); onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  if (!editing) return (
    <div className="flex items-start justify-between gap-2">
      <div className="space-y-0.5 text-xs text-gray-500 dark:text-gray-400 min-w-0">
        {order.ordered_at && <p>Ordered: {formatDate(order.ordered_at)}</p>}
        {order.expected_at && <p>Expected: {formatDate(order.expected_at)}</p>}
        {order.informal_ref && <p>Ref: <span className="font-mono">{order.informal_ref}</span></p>}
        {order.notes && <p className="italic truncate">{order.notes.slice(0, 80)}{order.notes.length > 80 ? '…' : ''}</p>}
        {!order.expected_at && !order.informal_ref && !order.notes && (
          <p className="text-gray-300 dark:text-gray-600 text-[var(--text-secondary)]">No details set</p>
        )}
      </div>
      <button type="button" onClick={() => setEditing(true)}
        className="text-[var(--text-secondary)] text-blue-500 hover:underline shrink-0">Edit</button>
    </div>
  )

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Order date</p>
        <input type="date" value={orderedAt} onChange={e => setOrderedAt(e.target.value)}
          className="w-full px-2.5 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none" />
      </div>
      <div>
        <p className="kal-text-label text-gray-400 dark:text-gray-500 mb-1">Expected arrival</p>
        <input type="date" value={expectedAt} onChange={e => setExpectedAt(e.target.value)}
          className="w-full px-2.5 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none" />
      </div>
      <div>
        <p className="kal-text-label text-gray-400 dark:text-gray-500 mb-1">Supplier ref</p>
        <input value={informalRef} onChange={e => setInformalRef(e.target.value)}
          placeholder="Supplier's order or invoice number"
          className="w-full px-2.5 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none" />
      </div>
      <div>
        <p className="kal-text-label text-gray-400 dark:text-gray-500 mb-1">Notes</p>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className="w-full px-2.5 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none resize-none" />
      </div>
      {error && <p className="text-[var(--text-label)] text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setEditing(false)} disabled={saving}
          className="px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-[var(--text-secondary)] text-gray-600 dark:text-gray-300 disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex-1 px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[var(--text-secondary)] font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LineItemRow (#41: damage-aware display for non-draft lines)
// ---------------------------------------------------------------------------

function LineItemRow({ line, isDraft, onQtyChange, onDelete, onDamageResolved }: {
  line: PurchaseOrderLine; isDraft: boolean
  onQtyChange: (id: string, qty: number) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onDamageResolved?: (lineId: string, resolution: DamageResolution) => void
}) {
  const [editQty, setEditQty]           = useState<number | null>(null)
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [resolvingDamage, setResolvingDamage] = useState(false)
  const [damageError, setDamageError]   = useState<string | null>(null)

  const handleQtySave = async () => {
    if (editQty === null || editQty === line.quantity_ordered) { setEditQty(null); return }
    setSaving(true)
    try { await onQtyChange(line.id, editQty); setEditQty(null) }
    finally { setSaving(false) }
  }
  const handleDelete = async () => {
    setDeleting(true); try { await onDelete(line.id) } finally { setDeleting(false) }
  }
  const handleResolve = async (resolution: DamageResolution) => {
    setResolvingDamage(true); setDamageError(null)
    try { await resolveDamage(line.id, resolution); onDamageResolved?.(line.id, resolution) }
    catch (e) { setDamageError(e instanceof Error ? e.message : 'Failed to save resolution') }
    finally { setResolvingDamage(false) }
  }

  const hasDamage       = (line.quantity_damaged ?? 0) > 0
  const isFullyDamaged  = hasDamage && line.quantity_received === 0
  const needsResolution = hasDamage && !line.damage_resolution

  return (
    <div className={`py-2 border-b dark:border-gray-800 last:border-0 ${deleting ? 'opacity-40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[var(--text-body)] font-medium text-gray-900 dark:text-gray-100 truncate leading-snug">
            {line.title ?? line.inventory_item_id.split('/').pop()}
          </p>
          {(line.isbn ?? line.supplier_sku) && (
            <p className="text-[var(--text-mono)] font-mono text-gray-400 dark:text-gray-500">{line.isbn ?? line.supplier_sku}</p>
          )}
        </div>
        {isDraft ? (
          <div className="flex items-center gap-1 shrink-0">
            {editQty !== null ? (
              <>
                <input type="number" min={1} value={editQty}
                  onChange={e => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                  onKeyDown={e => { if (e.key === 'Enter') handleQtySave(); if (e.key === 'Escape') setEditQty(null) }}
                  className="w-12 px-1 py-0.5 border rounded text-xs text-center dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-1 focus:ring-blue-500 outline-none"
                  autoFocus />
                <button type="button" onClick={handleQtySave} disabled={saving}
                  className="text-[var(--text-label)] text-blue-500 hover:underline disabled:opacity-50">{saving ? '…' : '✓'}</button>
                <button type="button" onClick={() => setEditQty(null)}
                  className="text-[var(--text-label)] text-gray-400 hover:text-gray-600">✕</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setEditQty(line.quantity_ordered)} title="Click to edit"
                  className="text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-blue-500 tabular-nums w-8 text-right">
                  {line.quantity_ordered}
                </button>
                <button type="button" onClick={handleDelete} disabled={deleting} title="Remove"
                  className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-sm leading-none ml-0.5 disabled:opacity-40">×</button>
              </>
            )}
          </div>
        ) : (
          <div className="text-right shrink-0 ml-2 space-y-0.5">
            <div className="flex items-center justify-end gap-1.5">
              {line.status === 'received' && !isFullyDamaged && (
                <span className="text-green-500 text-xs">✓</span>
              )}
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                {line.quantity_received}/{line.quantity_ordered}
              </p>
            </div>
            {hasDamage && (
              <div className="flex items-center justify-end gap-1 flex-wrap">
                <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-semibold">
                  {line.quantity_damaged} dmg
                </span>
                {line.damage_resolution === 'credit' && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-semibold">credit</span>
                )}
                {line.damage_resolution === 'replacement_pending' && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-semibold">repl.</span>
                )}
              </div>
            )}
            {!hasDamage && (
              <p className="text-[var(--text-label)] text-gray-400 dark:text-gray-500">rcvd/ord</p>
            )}
          </div>
        )}
      </div>
      {!isDraft && needsResolution && (
        <div className="mt-2 pt-2 border-t dark:border-gray-800">
          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mb-1.5">
            ⚠ {line.quantity_damaged} damaged — resolution needed
          </p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => handleResolve('credit')} disabled={resolvingDamage}
              className="flex-1 px-2 py-1.5 rounded text-[10px] font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 disabled:opacity-50 transition-colors">
              {resolvingDamage ? '…' : '✓ Credit taken'}
            </button>
            <button type="button" onClick={() => handleResolve('replacement_pending')} disabled={resolvingDamage}
              className="flex-1 px-2 py-1.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors">
              {resolvingDamage ? '…' : '⟳ Replacement pending'}
            </button>
          </div>
          {damageError && <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">{damageError}</p>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InlineLineEntry
// ---------------------------------------------------------------------------

function InlineLineEntry({ poId, existingItemIds, onLineAdded }: {
  poId: string; existingItemIds: Set<string>
  onLineAdded: (line: PurchaseOrderLine) => void
}) {
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState<VariantSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [qty, setQty]       = useState(1)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(() => {
      searchVariants(query).then(setResults).catch(() => setResults([])).finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setResults([]) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleAdd = async (v: VariantSearchResult) => {
    setError(null)
    if (existingItemIds.has(v.inventory_item_id)) {
      setError(`"${v.title}" is already on this PO.`); setResults([]); setQuery(''); return
    }
    setAdding(v.inventory_item_id)
    try {
      const rawLine = await createPOLine(poId, {
        inventory_item_id: v.inventory_item_id, variant_id: v.variant_id, quantity_ordered: Number(qty),
      }) as PurchaseOrderLine
      const enrichedLine: PurchaseOrderLine = {
        ...rawLine, title: rawLine.title ?? v.title ?? null, isbn: rawLine.isbn ?? v.isbn ?? null,
      }
      setQuery(''); setResults([]); setQty(1); onLineAdded(enrichedLine)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add line'
      setError(msg.includes('500') || msg.includes('fetch') ? 'Could not add this title — it may belong to a different supplier.' : msg)
    } finally { setAdding(null) }
  }

  return (
    <div className="space-y-1.5" ref={ref}>
      <div className="flex gap-1.5">
        <div className="flex-1 relative">
          <input value={query} onChange={e => { setQuery(e.target.value); setError(null) }}
            placeholder="Search title or ISBN…"
            className="w-full px-2 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none" />
          {searching && <span className="absolute right-2 top-1.5 text-[var(--text-label)] text-gray-400 animate-pulse">…</span>}
        </div>
        <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-12 px-1.5 py-1.5 border rounded text-xs text-center dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none" title="Qty" />
      </div>
      {results.length > 0 && (
        <div className="border dark:border-gray-700 rounded overflow-hidden bg-white dark:bg-gray-900 shadow-lg max-h-48 overflow-y-auto">
          {results.slice(0, 10).map(r => {
            const dup = existingItemIds.has(r.inventory_item_id)
            return (
              <button key={r.inventory_item_id} type="button" disabled={!!adding || dup}
                onMouseDown={e => { e.preventDefault(); handleAdd(r) }}
                className={`w-full text-left px-2.5 py-2 border-b dark:border-gray-800 last:border-0 text-xs ${dup ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50'}`}>
                <span className="font-medium text-gray-900 dark:text-gray-100 truncate block">
                  {adding === r.inventory_item_id ? 'Adding…' : r.title}
                  {dup && <span className="text-amber-500 ml-1">(added)</span>}
                </span>
                <span className="font-mono text-gray-400 text-[var(--text-label)]">{r.isbn}</span>
              </button>
            )
          })}
        </div>
      )}
      {error && <p className="text-[var(--text-secondary)] text-red-600 dark:text-red-400 leading-snug">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReceiptPdfButton (#40)
// ---------------------------------------------------------------------------

function ReceiptPdfButton({ receiptId }: { receiptId: string }) {
  const [downloading, setDownloading] = useState(false)
  const [dlError, setDlError]         = useState(false)

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation(); setDownloading(true); setDlError(false)
    try { await downloadReceiptPdf(receiptId) }
    catch { setDlError(true) }
    finally { setDownloading(false) }
  }

  return (
    <button type="button" onClick={handleDownload} disabled={downloading}
      title={dlError ? 'Download failed — try again' : 'Download receipt PDF'}
      className={`text-[10px] font-medium transition-colors ${dlError ? 'text-red-500 dark:text-red-400 hover:underline' : 'text-blue-500 dark:text-blue-400 hover:underline'} disabled:opacity-50`}>
      {downloading ? '…' : dlError ? '↓ retry' : '↓ Receipt PDF'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Receipt section (#40)
// ---------------------------------------------------------------------------

function ReceiptSection({ poId }: { poId: string }) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetchReceiptsForPO(poId).then(setReceipts).catch(() => setReceipts([])).finally(() => setLoading(false))
  }, [poId])

  if (loading) return <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
  if (receipts.length === 0) return <p className="text-xs text-gray-400 dark:text-gray-500">No receipts yet.</p>

  return (
    <div className="space-y-1.5">
      {receipts.map(r => {
        const hasPdf = r.status === 'applied' || r.status === 'test_applied'
        return (
          <div key={r.id} className="border dark:border-gray-700 rounded overflow-hidden">
            <button type="button" onClick={() => setExpanded(p => p === r.id ? null : r.id)}
              className="w-full text-left px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase shrink-0 ${
                  r.status === 'applied'      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : r.status === 'test_applied' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                  : r.status === 'failed'       ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>{r.status === 'test_applied' ? 'test run' : r.status}</span>
                <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{r.id.slice(0, 8)}</span>
              </div>
              <div className="flex items-center justify-between mt-1 gap-2">
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{formatDateTime(r.received_at)}</span>
                {hasPdf && <ReceiptPdfButton receiptId={r.id} />}
              </div>
            </button>
            {expanded === r.id && <ReceiptLines receiptId={r.id} />}
          </div>
        )
      })}
    </div>
  )
}

function ReceiptLines({ receiptId }: { receiptId: string }) {
  const [lines, setLines]   = useState<ReceiptLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    import('../../api/supplyChainApi').then(({ fetchReceipt }) => {
      fetchReceipt(receiptId).then(r => setLines(r.lines as ReceiptLine[])).catch(() => setLines([])).finally(() => setLoading(false))
    })
  }, [receiptId])

  if (loading) return <div className="px-3 py-2"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></div>

  return (
    <div className="divide-y dark:divide-gray-800">
      {lines.map(line => {
        const rcvd  = line.quantity_received ?? 0
        const dmg   = (line as any).quantity_damaged ?? 0
        const delta = line.delta ?? rcvd
        return (
          <div key={line.id} className="px-3 py-1.5 flex items-center justify-between text-xs gap-2">
            <span className="text-gray-600 dark:text-gray-300 truncate flex-1">
              {(line as any).title ?? line.inventory_item_id.split('/').pop()}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {delta > 0 && <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">+{delta}</span>}
              {dmg > 0 && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-semibold">{dmg} dmg</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Order details panel
// ---------------------------------------------------------------------------

function OrderDetailsPanel({ order, onRefresh }: { order: PurchaseOrder; onRefresh?: () => void }) {
  const { locationName } = useLocations()
  const isDraft = order.status === 'draft'
  return (
    <div className="space-y-2 text-sm">
      <DetailItem label="Supplier" value={order.supplier_name ?? order.account_label} />
      <DetailItem label="Account No." value={order.account_number} />
      <DetailItem label="Receiving at" value={locationName(order.destination_location_id)} />
      <DetailItem label="Ordered" value={formatDate(order.ordered_at)} />
      <DetailItem label="Expected" value={formatDate(order.expected_at)} />
      {order.is_ad_hoc && (
        <>
          <DetailItem label="Order source" value={order.ad_hoc_source ? AD_HOC_SOURCE_LABELS[order.ad_hoc_source] : undefined} />
          {order.informal_ref && <DetailItem label="Supplier ref" value={order.informal_ref} />}
        </>
      )}
      {order.notes && (
        <div className="flex flex-col py-1">
          <span className="kal-text-label text-gray-400 dark:text-gray-500">Notes</span>
          <p className="text-gray-700 dark:text-gray-300 mt-0.5 text-sm leading-relaxed">{order.notes}</p>
        </div>
      )}
      {isDraft && (
        <div className="pt-2 border-t dark:border-gray-800">
          <EditableOrderFields order={order} onSaved={() => onRefresh?.()} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lines panel (#46 + #47: sort, pending/received split, line search)
// ---------------------------------------------------------------------------

function LinesPanel({ order, lines, onLineAdded, onQtyChange, onDelete, onDamageResolved }: {
  order: PurchaseOrder; lines: PurchaseOrderLine[]
  onLineAdded: (l: PurchaseOrderLine) => void
  onQtyChange: (id: string, qty: number) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onDamageResolved?: (lineId: string, resolution: DamageResolution) => void
}) {
  const isDraft = order.status === 'draft'
  const existingItemIds = new Set(lines.map(l => l.inventory_item_id))
  const totalOrdered  = lines.reduce((s, l) => s + l.quantity_ordered, 0)
  const totalReceived = lines.reduce((s, l) => s + l.quantity_received, 0)

  const [pendingOpen, setPendingOpen] = useState(true)
  const [doneOpen,    setDoneOpen]    = useState(true)
  const [lineSearch,  setLineSearch]  = useState('')   // #47

  const sorted   = sortLines(lines)
  const filtered = filterLines(sorted, lineSearch)     // #47
  const searching = lineSearch.trim().length > 0

  // Groups only used when not searching
  const pendingLines = !isDraft ? sorted.filter(l => !isLineDone(l)) : []
  const doneLines    = !isDraft ? sorted.filter(l =>  isLineDone(l)) : []

  const renderRow = (line: PurchaseOrderLine) => (
    <LineItemRow key={line.id} line={line} isDraft={isDraft}
      onQtyChange={onQtyChange} onDelete={onDelete} onDamageResolved={onDamageResolved} />
  )

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Search input (#47) — shown whenever there are lines to search */}
      {lines.length > 0 && (
        <div className="relative mb-2 shrink-0">
          <input
            type="search"
            value={lineSearch}
            onChange={e => setLineSearch(e.target.value)}
            placeholder="Search title or ISBN…"
            className="w-full px-2.5 py-1.5 pr-7 border rounded text-xs
                       dark:bg-gray-900 dark:text-white dark:border-gray-700
                       focus:ring-1 focus:ring-blue-500 outline-none
                       placeholder-gray-400 dark:placeholder-gray-600"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setLineSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm leading-none"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {lines.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-2">No lines on this PO.</p>

        ) : searching ? (
          // Search active: flat filtered list, no groups (#47)
          <div>
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">
                No lines match "{lineSearch}"
              </p>
            ) : (
              <>
                {filtered.map(renderRow)}
                <p className="text-[10px] text-gray-400 dark:text-gray-500 pt-2">
                  {filtered.length} of {lines.length} line{lines.length !== 1 ? 's' : ''} matching
                </p>
              </>
            )}
          </div>

        ) : isDraft ? (
          // Draft, no search: flat alphabetical list
          <div>
            {sorted.map(renderRow)}
            <div className="pt-2 flex justify-between text-[var(--text-secondary)] text-gray-400 dark:text-gray-500">
              <span>{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
              <span className="tabular-nums">{totalOrdered} ordered</span>
            </div>
          </div>

        ) : (
          // Non-draft, no search: Pending / Received groups
          <div>
            {pendingLines.length > 0 && (
              <div className="mb-1">
                <div className="border-b dark:border-gray-800 mb-1">
                  <LineGroupHeader label="Pending" count={pendingLines.length}
                    expanded={pendingOpen} onToggle={() => setPendingOpen(v => !v)} accent="amber" />
                </div>
                {pendingOpen && pendingLines.map(renderRow)}
              </div>
            )}
            {doneLines.length > 0 && (
              <div className="mt-2">
                <div className="border-b dark:border-gray-800 mb-1">
                  <LineGroupHeader label="Received" count={doneLines.length}
                    expanded={doneOpen} onToggle={() => setDoneOpen(v => !v)} accent="green" />
                </div>
                {doneOpen && doneLines.map(renderRow)}
              </div>
            )}
            <div className="pt-2 mt-1 border-t dark:border-gray-800 flex justify-between text-[var(--text-secondary)] text-gray-400 dark:text-gray-500">
              <span>{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
              <span className="tabular-nums">{totalReceived} / {totalOrdered} received</span>
            </div>
          </div>
        )}
      </div>

      {isDraft && (
        <div className="shrink-0 pt-3 border-t dark:border-gray-700 mt-3">
          <p className="kal-text-label text-gray-400 dark:text-gray-500 mb-1.5">Add line</p>
          <InlineLineEntry poId={order.id} existingItemIds={existingItemIds} onLineAdded={onLineAdded} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

const PODetailSidebar: React.FC<Props> = ({ detail, onClose, onReceive, onRefresh, wide }) => {
  const [isOpen, setIsOpen]           = useState(false)
  const [mounted, setMounted]         = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [localLines, setLocalLines]   = useState<PurchaseOrderLine[]>([])
  const [pdfDownloading, setPdfDownloading] = useState(false)

  const wasNullRef     = useRef(true)
  const prevOrderIdRef = useRef<string | null>(null)

  useEffect(() => {
    const isNull  = detail === null
    const wasNull = wasNullRef.current
    wasNullRef.current = isNull

    if (!isNull && wasNull) {
      setMounted(true)
      setLocalLines(detail.lines ?? [])
      prevOrderIdRef.current = detail.order.id
      requestAnimationFrame(() => requestAnimationFrame(() => setIsOpen(true)))
    } else if (isNull && !wasNull) {
      setIsOpen(false)
      const t = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(t)
    } else if (!isNull) {
      if (detail.order.id !== prevOrderIdRef.current) {
        prevOrderIdRef.current = detail.order.id
        setLocalLines(detail.lines ?? [])
      } else {
        if (detail.lines.length >= localLines.length) setLocalLines(detail.lines)
      }
    }
  }, [detail])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose() }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [isOpen, onClose])

  if (!mounted || !detail) return null

  const { order } = detail
  const isDraft    = order.status === 'draft'
  const canReceive = ['submitted', 'confirmed', 'partial'].includes(order.status)

  const handleLineAdded    = (newLine: PurchaseOrderLine) => setLocalLines(prev => [...prev, newLine])
  const handleQtyChange    = async (lineId: string, qty: number) => {
    await updatePOLine(lineId, { quantity_ordered: qty })
    setLocalLines(prev => prev.map(l => l.id === lineId ? { ...l, quantity_ordered: qty } : l))
  }
  const handleDeleteLine   = async (lineId: string) => {
    await removePOLine(lineId); setLocalLines(prev => prev.filter(l => l.id !== lineId))
  }
  const handleDamageResolved = (lineId: string, resolution: DamageResolution) => {
    setLocalLines(prev => prev.map(l =>
      l.id === lineId ? { ...l, damage_resolution: resolution, status: resolution === 'credit' ? 'received' : l.status } : l
    ))
  }
  const handleTransition = async (action: 'submit' | 'confirm'): Promise<boolean> => {
    setTransitioning(true); setTransitionError(null)
    try {
      if (action === 'submit') await submitPurchaseOrder(order.id)
      if (action === 'confirm') await confirmPurchaseOrder(order.id)
      onRefresh?.(); return true
    } catch (e) {
      setTransitionError(e instanceof Error ? e.message : 'Action failed'); return false
    } finally { setTransitioning(false) }
  }
  const handleDownloadPdf = async () => {
    setPdfDownloading(true)
    try { await downloadPOPdf(order.id, order.po_number) }
    catch (e) { console.error('PDF download failed:', e) }
    finally { setPdfDownloading(false) }
  }

  const sidebarWidth = (isDraft || wide) ? 'sm:w-[56rem]' : 'sm:w-[30rem]'

  return createPortal(
    <>
      <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <div className={`fixed top-0 right-0 h-full w-full ${sidebarWidth} bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-bold text-base text-gray-900 dark:text-white font-mono">{order.po_number}</h3>
              <StatusBadge status={order.status} />
              {order.is_ad_hoc && <AdHocBadge />}
              {order.is_test && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 uppercase tracking-wide">Test</span>
              )}
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

        {/* Body */}
        {(isDraft || wide) ? (
          <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
            <div className="sm:w-64 shrink-0 border-b sm:border-b-0 sm:border-r dark:border-gray-800 overflow-y-auto p-5">
              <SectionLabel>Order</SectionLabel>
              <OrderDetailsPanel order={order} onRefresh={onRefresh} />
              <div className="mt-6"><SectionLabel>Receipts</SectionLabel><ReceiptSection poId={order.id} /></div>
            </div>
            <div className="flex-1 min-w-0 min-h-0 flex flex-col p-5">
              <SectionLabel>Lines ({localLines.length})</SectionLabel>
              <div className="flex-1 min-h-0">
                <LinesPanel order={order} lines={localLines} onLineAdded={handleLineAdded}
                  onQtyChange={handleQtyChange} onDelete={handleDeleteLine} onDamageResolved={handleDamageResolved} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-4">
            <section><SectionLabel>Order</SectionLabel><OrderDetailsPanel order={order} onRefresh={onRefresh} /></section>
            <section>
              <SectionLabel>Lines ({localLines.length})</SectionLabel>
              <LinesPanel order={order} lines={localLines} onLineAdded={handleLineAdded}
                onQtyChange={handleQtyChange} onDelete={handleDeleteLine} onDamageResolved={handleDamageResolved} />
            </section>
            <section><SectionLabel>Receipts</SectionLabel><ReceiptSection poId={order.id} /></section>
            {(order.supersedes_ids?.length > 0 || order.superseded_by) && (
              <section>
                <SectionLabel>Supersession</SectionLabel>
                {order.superseded_by && <p className="text-xs text-amber-600 dark:text-amber-400">This PO was superseded.</p>}
              </section>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 border-t dark:border-gray-800 bg-white dark:bg-gray-950 px-5 py-3 space-y-2">
          {order.is_test && (
            <div className="px-3 py-2 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-xs text-yellow-700 dark:text-yellow-300 text-center">
              Test PO — receiving will simulate the flow without touching Shopify inventory
            </div>
          )}
          {isDraft && (
            <div className="space-y-2">
              <button onClick={async () => { const ok = await handleTransition('submit'); if (ok) await handleDownloadPdf() }}
                disabled={transitioning || localLines.length === 0}
                className="w-full px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
                {transitioning ? 'Submitting…' : 'Submit PO + Download PDF'}
              </button>
              <button onClick={handleDownloadPdf} disabled={pdfDownloading || localLines.length === 0}
                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
                {pdfDownloading ? 'Generating…' : 'Download draft PDF'}
              </button>
            </div>
          )}
          {['submitted', 'confirmed', 'partial', 'received'].includes(order.status) && (
            <button onClick={handleDownloadPdf} disabled={pdfDownloading}
              className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
              {pdfDownloading ? 'Generating…' : 'Download PO PDF'}
            </button>
          )}
          {isDraft && localLines.length === 0 && <p className="text-xs text-amber-600 dark:text-amber-400 text-center">Add lines before submitting</p>}
          {order.status === 'received' && <p className="text-xs text-center text-green-600 dark:text-green-400 font-semibold">✓ Fully received</p>}
          {transitionError && <p className="text-xs text-red-600 dark:text-red-400">{transitionError}</p>}
        </div>
      </div>
    </>,
    document.body
  )
}

export default PODetailSidebar
