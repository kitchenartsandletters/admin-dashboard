// StockWaitingModal.tsx
//
// Detail for the "In stock, orders waiting" card on the welcome page.
//
// These titles are physically on the shelf while customer orders sit
// unfulfilled — a FULFILLMENT problem, not a receiving one. KAL has no shipping
// module (fulfillment lives in Shopify and ShipStation), so this modal's job is
// to name the problem precisely and hand off: every product and every order
// links straight into the Shopify admin.
//
// Structure:
//   Title row     — title, ISBN, on hand, units committed, orders waiting,
//                   longest wait, product link. Expands to:
//     Order rows  — order name, units, days elapsed, order link.
//
// Deliberately read-only. Nothing here mutates inventory or orders; the work
// happens in Shopify. No customer data is shown — staff see the customer on the
// Shopify order itself, so the dashboard doesn't duplicate PII.

import { useEffect, useState } from 'react'
import type { StockWaitingResult, StockWaitingItem } from '../api/supplyChainApi'

function dayLabel(days: number | null): string {
  if (days === null || days === undefined) return '—'
  if (days === 0) return 'today'
  return `${days}d`
}

// Escalating emphasis with age. A two-day wait is worth noticing; a two-week
// wait is worth interrupting someone over.
function ageClass(days: number | null): string {
  if (days === null || days === undefined) return 'text-gray-400'
  if (days >= 14) return 'text-red-700 dark:text-red-300 font-bold'
  if (days >= 7)  return 'text-red-600 dark:text-red-400 font-semibold'
  return 'text-amber-600 dark:text-amber-400 font-semibold'
}

function OrderRows({ item }: { item: StockWaitingItem }) {
  const orders = item.orders ?? []
  if (orders.length === 0) {
    return (
      <div className="px-4 py-3 text-[12px] text-gray-400 dark:text-gray-500 italic">
        Order detail unavailable for this title.
      </div>
    )
  }
  return (
    <div className="bg-gray-50 dark:bg-gray-900/40">
      <div className="px-4 pt-2.5 pb-1 grid grid-cols-[1fr_auto_auto] gap-3 text-[10px] font-bold
                      uppercase tracking-wider text-gray-400 dark:text-gray-500">
        <span>Order</span><span className="text-right">Qty</span><span className="text-right">Waiting</span>
      </div>
      {orders.map((o, i) => (
        <div
          key={o.order_id ?? `${o.order_name}-${i}`}
          className="px-4 py-2 grid grid-cols-[1fr_auto_auto] gap-3 items-center border-t
                     border-gray-100 dark:border-gray-800 text-[12.5px]"
        >
          <span className="min-w-0 truncate">
            {o.admin_url ? (
              <a
                href={o.admin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
              >
                {o.order_name ?? 'Order'} ↗
              </a>
            ) : (
              <span className="font-mono text-gray-700 dark:text-gray-300">{o.order_name ?? 'Order'}</span>
            )}
          </span>
          <span className="text-right tabular-nums text-gray-700 dark:text-gray-300">{o.units}</span>
          <span className={`text-right tabular-nums ${ageClass(o.days_waiting)}`}>{dayLabel(o.days_waiting)}</span>
        </div>
      ))}
      {item.orders_truncated && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400">
          Showing {orders.length} of {item.orders_waiting} orders — see the product in Shopify for the rest.
        </div>
      )}
    </div>
  )
}

function TitleRow({ item }: { item: StockWaitingItem }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className={`mt-1 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 truncate">
            {item.title ?? 'Untitled product'}
          </span>
          <span className="block text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
            {item.isbn ?? '—'}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11.5px] text-gray-500 dark:text-gray-400">
            <span>On hand <strong className="tabular-nums text-gray-800 dark:text-gray-200">{item.on_hand}</strong></span>
            <span>Committed <strong className="tabular-nums text-gray-800 dark:text-gray-200">{item.committed ?? '—'}</strong></span>
            <span>
              <strong className="tabular-nums text-gray-800 dark:text-gray-200">{item.units_waiting}</strong>
              {' '}unit{item.units_waiting === 1 ? '' : 's'} across{' '}
              <strong className="tabular-nums text-gray-800 dark:text-gray-200">{item.orders_waiting}</strong>
              {' '}order{item.orders_waiting === 1 ? '' : 's'}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block text-[13px] tabular-nums ${ageClass(item.days_waiting)}`}>
            {dayLabel(item.days_waiting)}
          </span>
          <span className="block text-[10px] text-gray-400 mt-0.5">longest</span>
        </span>
      </button>

      {/* Product link sits outside the expand toggle so clicking it doesn't
          collapse/expand the row. */}
      <div className="px-4 pb-2.5 pl-10">
        {item.product_admin_url ? (
          <a
            href={item.product_admin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11.5px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Open product in Shopify ↗
          </a>
        ) : (
          <span className="text-[11.5px] text-gray-400">Product link unavailable</span>
        )}
      </div>

      {open && <OrderRows item={item} />}
    </div>
  )
}

export default function StockWaitingModal({
  open,
  data,
  onClose,
}: {
  open: boolean
  data: StockWaitingResult | null
  onClose: () => void
}) {
  // Escape to close, and lock background scroll while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const items = data?.items ?? []
  const asOf = data?.as_of
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      }).format(new Date(data.as_of))
    : null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4 pb-10">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Titles in stock with orders waiting"
          className="w-full max-w-2xl bg-white dark:bg-gray-950 rounded-xl border border-gray-200
                     dark:border-gray-800 shadow-2xl flex flex-col max-h-full"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-4 shrink-0">
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">In stock, orders waiting</h2>
              <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                These titles are on the shelf with customer orders unfulfilled for more than{' '}
                {data?.min_age_days ?? 2} days. Fulfil them in Shopify or ShipStation.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-sm text-gray-500 dark:text-gray-400 hover:underline shrink-0"
            >
              Close
            </button>
          </div>

          {/* Freshness — this figure is computed daily, not live, so say so. */}
          {(asOf || data?.stale) && (
            <div className={`px-5 py-2 text-[11.5px] border-b border-gray-200 dark:border-gray-800 shrink-0
              ${data?.stale
                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                : 'bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400'}`}>
              {data?.stale
                ? `Last refresh failed — showing figures from ${asOf ?? 'an earlier run'}.`
                : `Checked ${asOf} · refreshed daily`}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                Nothing waiting right now.
              </p>
            ) : (
              items.map(item => <TitleRow key={item.variant_id} item={item} />)
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Expand a title to see the individual orders waiting on it.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
