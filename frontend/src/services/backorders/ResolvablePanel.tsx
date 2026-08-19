// ResolvablePanel.tsx
// "Ready to ship" — backorders fillable from stock on hand right now.
// Allocation is chronological (oldest order first). Partial coverage is shown
// explicitly: 2 owed / 1 in stock => oldest order fillable, 1 unit stranded.
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ResolvableProduct, Fillability } from '../../types/backorderTypes'

const FILL_BADGE: Record<Fillability, string> = {
  fully_fillable:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  partially_fillable: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  not_fillable:       'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const FILL_LABEL: Record<Fillability, string> = {
  fully_fillable:     'Ship now',
  partially_fillable: 'Partial',
  not_fillable:       'Stranded',
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—'

interface Props {
  products: ResolvableProduct[]
  meta: { products: number; fillable_units: number; stranded_units: number } | null
  loading: boolean
  onOpenProduct?: (productId: number) => void
}

export default function ResolvablePanel({ products, meta, loading, onOpenProduct }: Props) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  if (loading) {
    return (
      <div className="border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm text-gray-500 dark:text-gray-400">
        Nothing is currently fillable from stock on hand.
      </div>
    )
  }

  return (
    <div className="border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 border-b dark:border-gray-700 bg-emerald-50/60 dark:bg-emerald-900/10 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Ready to ship</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Stock on hand covers these open backorders — oldest orders first.
          </p>
        </div>
        {meta && (
          <div className="text-xs text-gray-600 dark:text-gray-300 tabular-nums whitespace-nowrap">
            <span className="font-semibold">{meta.fillable_units}</span> fillable
            {meta.stranded_units > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {meta.stranded_units}
                </span>{' '}
                still short
              </>
            )}
          </div>
        )}
      </div>

      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {products.map((p) => {
          const isOpen = !!expanded[p.product_id]
          const shipNow = p.lines.filter((l) => l.fillability === 'fully_fillable').length
          return (
            <li key={p.product_id}>
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [p.product_id]: !prev[p.product_id] }))
                  }
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                >
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>

                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => onOpenProduct?.(p.product_id)}
                    className="text-left block w-full"
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-blue-600">
                      {p.title ?? p.sku ?? p.product_id}
                    </div>
                  </button>
                  <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    {p.available} in stock · {p.open_backorder_qty} owed ·{' '}
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {p.resolvable_qty} fillable
                    </span>
                    {p.stranded_qty > 0 && (
                      <>
                        {' · '}
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          {p.stranded_qty} short
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap shrink-0">
                  {shipNow} of {p.lines.length} order{p.lines.length === 1 ? '' : 's'}
                </span>
              </div>

              {isOpen && (
                <div className="px-4 pb-3 overflow-x-auto">
                  <table className="min-w-full text-xs border rounded dark:border-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        {['#', 'Order', 'Customer', 'Owed', 'Fillable', 'Placed', 'Age', 'Status'].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b dark:border-gray-700"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {p.lines.map((l) => (
                        <tr
                          key={`${l.order_id}-${l.line_item_id}`}
                          className="even:bg-gray-50/50 dark:even:bg-gray-800/50"
                        >
                          <td className="px-3 py-2 tabular-nums text-gray-500">{l.queue_position}</td>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {l.order_name ?? l.order_id}
                          </td>
                          <td className="px-3 py-2 max-w-[160px] truncate">{l.customer_email ?? '—'}</td>
                          <td className="px-3 py-2 tabular-nums">{l.open_qty}</td>
                          <td className="px-3 py-2 tabular-nums font-semibold">{l.fillable_qty}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.order_created_at)}</td>
                          <td className="px-3 py-2 tabular-nums">{l.days_open}d</td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${FILL_BADGE[l.fillability]}`}
                            >
                              {FILL_LABEL[l.fillability]}
                              {l.fillability === 'partially_fillable' &&
                                ` ${l.fillable_qty}/${l.open_qty}`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
