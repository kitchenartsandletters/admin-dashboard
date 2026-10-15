import { daysPastPub, isDelayedImportHold } from "../../utils/preorderFlags"

interface DelayedImportBadgeProps {
  row: {
    classification: string
    pub_date: string | null
    arrival_record_is_live?: boolean | null
  }
  className?: string
}

// Sibling of the "Stock received" pill. Explains why an active preorder shows a
// past pub date: the import is delayed and the title is held open on purpose.
export default function DelayedImportBadge({ row, className = "" }: DelayedImportBadgeProps) {
  if (!isDelayedImportHold(row)) return null
  const days = daysPastPub(row.pub_date) ?? 0
  return (
    <span
      title={`Pub date passed ${days} day${days === 1 ? "" : "s"} ago and stock hasn't arrived. Held as an active preorder on purpose while presale orders are open.`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold whitespace-nowrap bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300 ${className}`}
    >
      ⏸ Held · awaiting stock
    </span>
  )
}
