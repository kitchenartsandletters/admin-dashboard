// BackorderTable.tsx
// Product-level table of titles owed to customers, urgency-sorted.
import type { BackorderProductRow, UrgencyBucket } from '../../types/backorderTypes'

const BADGE_STYLES: Record<UrgencyBucket, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  low:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

const STATUS_LABELS: Record<string, string> = {
  backorderable:   'Backorderable',
  temporarily_oos: 'Temporarily OOS',
  oop_suspect:     'OOP suspect',
  restock_pending: 'Restock pending',
  resolved:        'Resolved',
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—'

interface Props {
  data: BackorderProductRow[]
  onRowClick: (row: BackorderProductRow) => void
}

export default function BackorderTable({ data, onRowClick }: Props) {
  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {['Title', 'Owed', 'Orders', 'Days open', 'On order', 'Expected', 'Notified', 'Status', 'Urgency'].map(h => (
              <th key={h} className="px-4 py-3 border-b dark:border-gray-700 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {data.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No backorders match the current filters.
              </td>
            </tr>
          )}
          {data.map((row) => (
            <tr
              key={row.product_id}
              onClick={() => onRowClick(row)}
              className="even:bg-gray-50/50 dark:even:bg-gray-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900 dark:text-white">{row.title ?? '—'}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {row.sku ?? ''}{row.vendor ? ` ·${row.vendor}` : ''}
                </div>
              </td>
              <td className="px-4 py-3 tabular-nums font-semibold">{row.open_backorder_qty}</td>
              <td className="px-4 py-3 tabular-nums">{row.open_orders_count}</td>
              <td className="px-4 py-3 tabular-nums">{row.days_open}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {row.on_order_qty > 0 ? (
                  <span className="tabular-nums">
                    {row.on_order_qty}
                    {row.po_numbers?.length ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400"> ({row.po_numbers.join(', ')})</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-medium">No</span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{fmtDate(row.next_expected_at)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {row.unnotified_open_lines > 0 ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
                    {row.unnotified_open_lines} pending
                  </span>
                ) : (
                  fmtDate(row.last_customer_notified_at)
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-xs">{STATUS_LABELS[row.status] ?? row.status}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${BADGE_STYLES[row.urgency_bucket]}`}>
                  {row.urgency_bucket} ·{row.urgency_score}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
