import { activeHold, holdLabel } from "../../utils/preorderFlags"

interface HoldBadgeProps {
  row: unknown
  className?: string
}

const MAX_CHARS = 48

// Shown on titles with a live preorder hold (hold_active from the backend).
// Renders nothing when there is none. Long notes are shortened; the tooltip
// carries the full label.
export default function HoldBadge({ row, className = "" }: HoldBadgeProps) {
  const hold = activeHold(row)
  if (!hold) return null
  const label = holdLabel(hold)
  const shown = label.length > MAX_CHARS ? `${label.slice(0, MAX_CHARS - 1).trimEnd()}…` : label
  return (
    <span
      title={`${label}. A person set this hold; the title stays in the Preorder collection, keeping the preorder incentive and copy, until it ends.`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold whitespace-nowrap bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300 ${className}`}
    >
      ⏸ {shown}
    </span>
  )
}
