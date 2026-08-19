// BackorderDetailSidebar.tsx
// Right-side drill-down for a backordered title: per-order lines (what is owed
// to whom), open PO lines from reporting.on_order_lines, action buttons, and
// the action history trail.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type {
  BackorderProductRow,
  BackorderOrderLine,
  BackorderAction,
  BackorderPoLine,
} from '../../types/backorderTypes'
import { createBackorderAction, fetchProductOrders } from '../../api/backorderApi'

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—'

interface Props {
  row: BackorderProductRow | null
  onClose: () => void
  onChanged?: () => void
}

export default function BackorderDetailSidebar({ row, onClose, onChanged }: Props) {
  const [lines, setLines] = useState<BackorderOrderLine[]>([])
  const [actions, setActions] = useState<BackorderAction[]>([])
  const [poLines, setPoLines] = useState<BackorderPoLine[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (productId: number) => {
    setLoading(true)
    setError(null)
    try {
      const detail = await fetchProductOrders(productId)
      setLines(detail.lines)
      setActions(detail.actions)
      setPoLines(detail.po_lines ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load detail')
      setLines([])
      setActions([])
      setPoLines([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (row) load(row.product_id)
  }, [row?.product_id])

  if (!row) return null

  const act = async (body: Parameters<typeof createBackorderAction>[0]) => {
    setBusy(true)
    setError(null)
    try {
      await createBackorderAction(body)
      await load(row.product_id)
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const logVendorInquiry = () => {
    const note = window.prompt('Vendor / publisher inquiry note:')
    if (note === null) return
    act({ scope: 'product', product_id: row.product_id, action_type: 'vendor_inquiry', details: { note } })
  }

  const setEta = () => {
    const eta = window.prompt('Expected date (YYYY-MM-DD):')
    if (!eta) return
    act({ scope: 'product', product_id: row.product_id, action_type: 'eta_updated', eta_date: eta, details: { source: 'manual' } })
  }

  const markNotified = (line: BackorderOrderLine) => {
    act({
      scope: 'order_line',
      product_id: row.product_id,
      order_id: line.order_id,
      line_item_id: line.line_item_id,
      action_type: 'customer_notified',
      details: { channel: 'manual' },
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[560px] bg-white dark:bg-gray-900 border-l dark:border-gray-700 shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {row.title ?? row.sku ?? row.product_id}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {row.vendor ?? ''}{row.sku ? ` · ${row.sku}` : ''} · {row.available ?? '—'} in stock
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-700 text-xs dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Fillable-now callout */}
          {row.has_resolvable && (
            <div className="px-3 py-2 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300">
              <span className="font-semibold tabular-nums">{row.resolvable_qty}</span> of{' '}
              <span className="tabular-nums">{row.open_backorder_qty}</span> owed units can ship from
              stock on hand now (oldest orders first).
            </div>
          )}

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Owed', value: row.open_backorder_qty },
              { label: 'On order', value: row.on_order_qty > 0 ? row.on_order_qty : 'No' },
              { label: 'Expected', value: fmtDate(row.next_expected_at) },
            ].map((s) => (
              <div key={s.label} className="border rounded-md dark:border-gray-700 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{s.label}</div>
                <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={logVendorInquiry}
              disabled={busy}
              className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium"
            >
              Log vendor inquiry
            </button>
            <button
              onClick={setEta}
              disabled={busy}
              className="px-3 py-1.5 rounded-md border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 text-xs font-medium"
            >
              Set expected date
            </button>
          </div>

          {/* Open PO lines (reporting.on_order_lines) */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Open purchase orders ({poLines.length})
            </h3>
            {loading ? (
              <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ) : poLines.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Nothing on order for this title. This is the main driver of its urgency score.
              </p>
            ) : (
              <ul className="space-y-2">
                {poLines.map((po, i) => (
                  <li key={`${po.po_number}-${i}`} className="border rounded-md dark:border-gray-700 p-2.5 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {po.po_number ?? '—'}
                        {po.supplier_name ? (
                          <span className="font-normal text-gray-500 dark:text-gray-400"> · {po.supplier_name}</span>
                        ) : null}
                      </span>
                      <span className="tabular-nums whitespace-nowrap">
                        {po.quantity_outstanding ?? 0} outstanding
                      </span>
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                      {po.line_status ?? po.po_status ?? ''}
                      {po.ordered_at ? ` · ordered ${fmtDate(po.ordered_at)}` : ''}
                      {po.expected_at ? ` · expected ${fmtDate(po.expected_at)}` : ''}
                    </div>
                    {po.supply_status_note && (
                      <div className="mt-1 text-gray-700 dark:text-gray-200 italic">
                        “{po.supply_status_note}”
                        {po.supply_status_noted_at ? (
                          <span className="not-italic text-gray-400"> — {fmtDate(po.supply_status_noted_at)}</span>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Order lines */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Orders owed ({lines.length})
            </h3>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="border rounded-md dark:border-gray-700 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Order', 'Customer', 'Open', 'Status', 'Placed', 'Notified', ''].map((h, i) => (
                        <th key={i} className="px-3 py-2 border-b dark:border-gray-700 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {lines.map((l) => (
                      <tr key={`${l.order_id}-${l.line_item_id}`} className="even:bg-gray-50/50 dark:even:bg-gray-800/50">
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{l.order_name ?? l.order_id}</td>
                        <td className="px-3 py-2 max-w-[120px] truncate">{l.customer_email ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums">{l.open_qty}/{l.qty_backordered}</td>
                        <td className="px-3 py-2">{l.status}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.order_created_at)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {l.last_customer_notified_at
                            ? `${fmtDate(l.last_customer_notified_at)} (${l.notification_count}x)`
                            : 'Never'}
                        </td>
                        <td className="px-3 py-2">
                          {(l.status === 'open' || l.status === 'partial') && (
                            <button
                              onClick={() => markNotified(l)}
                              disabled={busy}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-medium whitespace-nowrap"
                            >
                              Mark notified
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Action history */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Action history</h3>
            {actions.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No actions logged yet. Log a vendor inquiry or set an expected date to start the trail.
              </p>
            ) : (
              <ul className="space-y-2">
                {actions.map((a) => (
                  <li key={a.id} className="border-t dark:border-gray-700 pt-2 text-xs">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {a.action_type.replace(/_/g, ' ')}
                    </span>
                    {a.order_id ? ` · order ${a.order_id}` : ''}
                    {a.eta_date ? ` · ETA ${a.eta_date}` : ''}
                    <span className="text-gray-500 dark:text-gray-400">
                      {' — '}{new Date(a.created_at).toLocaleString()}
                      {a.actor ? ` by ${a.actor}` : ''}
                    </span>
                    {a.details && 'note' in a.details && (
                      <div className="text-gray-600 dark:text-gray-300 mt-0.5">{String(a.details.note)}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
