// PODetailSidebar.tsx
import React, { useEffect, useRef, useState } from 'react'
import { PurchaseOrderDetail, PO_STATUS_LABELS, PO_STATUS_COLORS, PO_LINE_STATUS_COLORS } from './purchaseOrderTypes'
import { formatDate } from '../../utils/tableUtils'
import { submitPurchaseOrder, confirmPurchaseOrder, cancelPurchaseOrder } from '../../api/supplyChainApi'

interface Props {
  detail: PurchaseOrderDetail | null
  onClose: () => void
  onReceive: (poId: string) => void
  onRefresh: () => void
}

const DetailItem = ({
  label, value, mono = false,
}: { label: string; value: string | number | null | undefined; mono?: boolean }) => (
  <div className="flex flex-col py-1 border-b border-gray-50 dark:border-gray-800 last:border-0">
    <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">{label}</span>
    <span className={`text-gray-900 dark:text-gray-100 mt-0.5 text-sm ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
  </div>
)

const SectionHeader = ({ label, color }: { label: string; color: string }) => {
  const borders: Record<string, string> = {
    blue: 'border-blue-500', purple: 'border-purple-500',
    green: 'border-green-500', amber: 'border-amber-500', gray: 'border-gray-400',
  }
  return (
    <h4 className={`font-bold text-gray-900 dark:text-white uppercase text-[11px] tracking-widest border-l-2 ${borders[color] ?? 'border-gray-400'} pl-2 mb-4`}>
      {label}
    </h4>
  )
}

const PODetailSidebar: React.FC<Props> = ({ detail, onClose, onReceive, onRefresh }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (detail) {
      setShouldRender(true)
      setTimeout(() => { setIsVisible(true); contentRef.current?.scrollTo(0, 0) }, 10)
    } else {
      setIsVisible(false)
      const t = setTimeout(() => setShouldRender(false), 300)
      return () => clearTimeout(t)
    }
  }, [detail])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isVisible) handleClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isVisible])

  const handleClose = () => { setIsVisible(false); setTimeout(onClose, 300) }

  const handleTransition = async (action: 'submit' | 'confirm' | 'cancel') => {
    if (!detail) return
    setBusy(true)
    setActionError(null)
    try {
      if (action === 'submit') await submitPurchaseOrder(detail.order.id)
      if (action === 'confirm') await confirmPurchaseOrder(detail.order.id)
      if (action === 'cancel') await cancelPurchaseOrder(detail.order.id)
      onRefresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  if (!shouldRender || !detail) return null

  const { order, lines } = detail
  const totalOrdered  = lines.reduce((s, l) => s + l.quantity_ordered, 0)
  const totalReceived = lines.reduce((s, l) => s + l.quantity_received, 0)
  const receivableStatuses = ['submitted', 'confirmed', 'partial', 'draft']
  const canReceive = receivableStatuses.includes(order.status)
  const canSubmit  = order.status === 'draft'
  const canConfirm = order.status === 'submitted'
  const canCancel  = !['received', 'cancelled'].includes(order.status)

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[28rem] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 transition-transform duration-300 transform ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white font-mono">{order.po_number}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${PO_STATUS_COLORS[order.status]}`}>
                {PO_STATUS_LABELS[order.status]}
              </span>
              {order.is_ad_hoc && (
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Ad hoc</span>
              )}
            </div>
          </div>
          <button onClick={handleClose} className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:underline">Close</button>
        </div>

        {/* Content */}
        <div ref={contentRef} className="p-5 text-sm space-y-8 overflow-y-auto h-[calc(100%-4.5rem)] pb-10">

          {/* Order info */}
          <section>
            <SectionHeader label="Order" color="blue" />
            <div className="space-y-3">
              <DetailItem label="PO Number"  value={order.po_number} mono />
              <DetailItem label="Ordered"    value={order.ordered_at ? formatDate(order.ordered_at) : undefined} />
              <DetailItem label="Expected"   value={order.expected_at ? formatDate(order.expected_at) : undefined} />
              {order.informal_ref && <DetailItem label="Supplier ref" value={order.informal_ref} mono />}
              {order.notes && (
                <div className="flex flex-col py-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">Notes</span>
                  <p className="text-gray-700 dark:text-gray-300 mt-0.5 text-sm leading-relaxed">{order.notes}</p>
                </div>
              )}
            </div>
          </section>

          {/* Lines */}
          <section>
            <SectionHeader label={`Lines (${lines.length}) · ${totalReceived} / ${totalOrdered} received`} color="purple" />
            <div className="space-y-2">
              {lines.map(line => (
                <div key={line.id} className="rounded-md border dark:border-gray-800 px-3 py-2.5 bg-gray-50/50 dark:bg-gray-900/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-500 truncate">
                      {line.inventory_item_id.split('/').pop()}
                    </span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${PO_LINE_STATUS_COLORS[line.status]}`}>
                      {line.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <span>Ordered: <strong>{line.quantity_ordered}</strong></span>
                    <span>Received: <strong>{line.quantity_received}</strong></span>
                    {line.quantity_backordered > 0 && <span className="text-amber-600 dark:text-amber-400">BO: {line.quantity_backordered}</span>}
                    {line.unit_cost != null && <span className="ml-auto font-mono">${line.unit_cost.toFixed(2)}</span>}
                  </div>
                  {line.notes && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 italic">{line.notes}</p>}
                </div>
              ))}
              {lines.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-600 italic">No lines on this order.</p>
              )}
            </div>
          </section>

          {/* Error */}
          {actionError && (
            <div className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              {actionError}
            </div>
          )}

          {/* Actions */}
          <section className="space-y-2">
            {canReceive && (
              <button
                onClick={() => onReceive(order.id)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-md text-sm transition-colors active:scale-[0.98]"
              >
                Receive Stock →
              </button>
            )}
            {canSubmit && (
              <button
                disabled={busy || lines.length === 0}
                onClick={() => handleTransition('submit')}
                className="w-full bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-gray-300 text-white dark:text-gray-900 font-semibold py-2.5 rounded-md text-sm transition-colors disabled:opacity-50 active:scale-[0.98]"
              >
                {busy ? 'Working…' : 'Submit Order'}
              </button>
            )}
            {canConfirm && (
              <button
                disabled={busy}
                onClick={() => handleTransition('confirm')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-md text-sm transition-colors disabled:opacity-50 active:scale-[0.98]"
              >
                {busy ? 'Working…' : 'Mark Confirmed'}
              </button>
            )}
            {canCancel && (
              <button
                disabled={busy}
                onClick={() => handleTransition('cancel')}
                className="w-full border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium py-2 rounded-md text-sm transition-colors disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Cancel Order'}
              </button>
            )}
          </section>
        </div>
      </div>
    </>
  )
}

export default PODetailSidebar
