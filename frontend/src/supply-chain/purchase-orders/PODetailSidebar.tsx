// PODetailSidebar.tsx
// Right sidebar for PO detail view.
//
// Changes in this version:
//   - Ad Hoc badge on POs where is_ad_hoc = true
//   - informal_ref displayed as "Supplier ref" field
//   - ad_hoc_source displayed as "Order source" field
//   - Receipt history section — shows receipts linked to this PO
//   - ordered_at / expected_at displayed clearly with labels

import React, { useEffect, useRef, useState } from 'react'
import {
  PurchaseOrder, PurchaseOrderLine, PurchaseOrderDetail,
  Receipt, ReceiptLine,
  PO_STATUS_LABELS, PO_STATUS_COLORS, AD_HOC_SOURCE_LABELS,
} from './purchaseOrderTypes'
import {
  fetchReceiptsForPO,
} from '../../api/supplyChainApi'
import { useLocations } from '../hooks/useLocations'
import { submitPurchaseOrder, confirmPurchaseOrder } from '../../api/supplyChainApi'

interface Props {
  detail: PurchaseOrderDetail | null
  onClose: () => void
  onReceive: (poId: string) => void
  onRefresh?: () => void  // called after status transitions to trigger detail reload
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
      {[1, 2].map(i => (
        <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      ))}
    </div>
  )

  if (receipts.length === 0) return (
    <p className="text-xs text-gray-400 dark:text-gray-500">No receipts recorded yet.</p>
  )

  return (
    <div className="space-y-2">
      {receipts.map(r => (
        <div key={r.id} className="border dark:border-gray-700 rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded(prev => prev === r.id ? null : r.id)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
          >
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase
                ${r.status === 'applied'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-gray-100 text-gray-500'}`}>
                {r.status}
              </span>
              <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                {r.id.slice(0, 8)}
              </span>
            </div>
            <span className="text-[11px] text-gray-400">{formatDateTime(r.received_at)}</span>
          </button>

          {expanded === r.id && (
            <ReceiptLines receiptId={r.id} />
          )}
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

  if (loading) return (
    <div className="px-3 py-2">
      <div className="h-4 w-full bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
    </div>
  )

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
          {line.shopify_group_id && (
            <p className="text-[10px] font-mono text-gray-300 dark:text-gray-600 mt-0.5">
              Shopify group: {line.shopify_group_id}
            </p>
          )}
          {line.restock_applied_at && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              Applied {formatDateTime(line.restock_applied_at)}
            </p>
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
  const contentRef = useRef<HTMLDivElement>(null)
  const wasNullRef = useRef(true)

  const { locationName } = useLocations()

  useEffect(() => {
    const isNull = detail === null
    const wasNull = wasNullRef.current
    wasNullRef.current = isNull

    if (!isNull && wasNull) {
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setIsOpen(true)))
    } else if (isNull && !wasNull) {
      setIsOpen(false)
      const t = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(t)
    }
  }, [detail])

  useEffect(() => {
    if (detail) contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [detail?.order.id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isOpen, onClose])

  if (!mounted || !detail) return null

  const { order, lines } = detail
  const canReceive = ['submitted', 'confirmed', 'partial'].includes(order.status)
  const totalOrdered = lines.reduce((s, l) => s + l.quantity_ordered, 0)
  const totalReceived = lines.reduce((s, l) => s + l.quantity_received, 0)

  const handleTransition = async (action: 'submit' | 'confirm') => {
     if (!detail) return
     setTransitioning(true)
     setTransitionError(null)
     try {
       if (action === 'submit') await submitPurchaseOrder(detail.order.id)
       if (action === 'confirm') await confirmPurchaseOrder(detail.order.id)
       onRefresh?.()  // caller reloads the detail
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
              <h3 className="font-bold text-base text-gray-900 dark:text-white font-mono">
                {order.po_number}
              </h3>
              <StatusBadge status={order.status} />
              {order.is_ad_hoc && <AdHocBadge />}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {order.supplier_name ?? order.account_label ?? order.supplier_account_id}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {canReceive && (
              <button
                onClick={() => onReceive(order.id)}
                className="px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
              >
                Receive →
              </button>
            )}
            <button onClick={onClose} className="text-sm text-gray-500 hover:underline">Close</button>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-5 space-y-7 pb-10 text-sm">

          {/* Order details */}
          <section>
            <SectionHeader label="Order" />
            <div className="space-y-2">
              <DetailItem label="Supplier" value={order.supplier_name ?? order.account_label} />
              <DetailItem label="Account" value={order.account_label} />
              <DetailItem label="Receiving at" value={locationName(order.destination_location_id)} />
              <DetailItem label="Ordered" value={formatDate(order.ordered_at)} />
              <DetailItem label="Expected" value={formatDate(order.expected_at)} />

              {/* Ad hoc fields — only shown when is_ad_hoc */}
              {order.is_ad_hoc && (
                <>
                  <DetailItem
                    label="Order source"
                    value={order.ad_hoc_source ? AD_HOC_SOURCE_LABELS[order.ad_hoc_source] : undefined}
                  />
                  {order.informal_ref && (
                    <DetailItem label="Supplier ref" value={order.informal_ref} />
                  )}
                </>
              )}

              {order.notes && (
                <div className="flex flex-col py-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">Notes</span>
                  <p className="text-gray-700 dark:text-gray-300 mt-0.5 text-sm leading-relaxed">
                    {order.notes}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Lines */}
          <section>
            <SectionHeader label={`Lines (${lines.length})`} />
            {lines.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No lines on this PO.</p>
            ) : (
              <>
                <div className="divide-y dark:divide-gray-800">
                  {lines.map(line => (
                    <div key={line.id} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">
                          {line.title ?? line.inventory_item_id.split('/').pop()}
                        </p>
                        <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
                          {line.isbn ?? line.supplier_sku ?? ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {line.quantity_received}/{line.quantity_ordered}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">rcvd/ord</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t dark:border-gray-700 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
                  <span>{totalReceived} / {totalOrdered} units received</span>
                </div>
              </>
            )}
          </section>

          {/* Supersession context */}
          {(order.supersedes_ids?.length > 0 || order.superseded_by) && (
            <section>
              <SectionHeader label="Supersession" />
              {order.superseded_by && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  This PO was superseded. See replacement order.
                </p>
              )}
              {order.supersedes_ids?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Replaces:</p>
                  {order.supersedes_ids.map(id => (
                    <p key={id} className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{id}</p>
                  ))}
                </div>
              )}
              {order.cancellation_reason && (
                <DetailItem label="Cancellation reason" value={order.cancellation_reason} />
              )}
            </section>
          )}

          {/* Receipt history */}
          <section>
            <SectionHeader label="Receipts" />
            <ReceiptSection poId={order.id} />
          </section>

          {/* Status actions — bottom of content, after Receipts section */}
          {detail && (
            <section>
              <SectionHeader label="Actions" />
              <div className="space-y-2">
                {order.status === 'draft' && (
                  <button
                    onClick={() => handleTransition('submit')}
                    disabled={transitioning || lines.length === 0}
                    className="w-full px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {transitioning ? 'Submitting…' : 'Submit PO → Submitted'}
                  </button>
                )}
                {order.status === 'submitted' && (
                  <button
                    onClick={() => handleTransition('confirm')}
                    disabled={transitioning}
                    className="w-full px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {transitioning ? 'Confirming…' : 'Mark as Confirmed'}
                  </button>
                )}
                {order.status === 'draft' && lines.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                    Add lines before submitting
                  </p>
                )}
                {order.status === 'received' && (
                  <p className="text-xs text-center text-green-600 dark:text-green-400 font-semibold">
                    ✓ Fully received — no further actions
                  </p>
                )}
                {transitionError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{transitionError}</p>
                )}
              </div>
            </section>
          )}

        </div>
      </div>
    </>
  )
}

export default PODetailSidebar
