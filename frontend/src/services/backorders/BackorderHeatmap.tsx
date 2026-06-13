// BackorderHeatmap.tsx
// Urgency-first tile grid: one tile per title owed to customers, colored by
// bucket. Click a tile for order-level detail + actions.
import type { BackorderProductRow, UrgencyBucket } from '../../types/backorderTypes'

const TILE_STYLES: Record<UrgencyBucket, string> = {
  critical: 'bg-red-600 hover:bg-red-700 text-white',
  high:     'bg-orange-500 hover:bg-orange-600 text-white',
  medium:   'bg-amber-400 hover:bg-amber-500 text-gray-900',
  low:      'bg-emerald-500 hover:bg-emerald-600 text-white',
}

interface Props {
  rows: BackorderProductRow[]
  onSelect: (row: BackorderProductRow) => void
}

export default function BackorderHeatmap({ rows, onSelect }: Props) {
  if (rows.length === 0) {
    return (
      <div className="border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 p-6 text-sm text-gray-500 dark:text-gray-400">
        No open backorders. Nothing is owed to customers right now.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {rows.map((p) => (
        <button
          key={p.product_id}
          onClick={() => onSelect(p)}
          title={`${p.title ?? p.sku ?? p.product_id} — urgency ${p.urgency_score}`}
          className={`w-44 rounded-md px-3 py-2 text-left shadow-sm transition-colors ${TILE_STYLES[p.urgency_bucket]}`}
        >
          <div className="text-xs font-semibold truncate">
            {p.title ?? p.sku ?? p.product_id}
          </div>
          <div className="text-[10px] opacity-90 tabular-nums">
            {p.open_backorder_qty} owed ·{p.days_open}d \u00b7{' '}
            {p.on_order_qty > 0 ? `${p.on_order_qty} on PO` : 'not ordered'}
          </div>
        </button>
      ))}
    </div>
  )
}
