import { activeHold, holdLabel } from "../../utils/preorderFlags"

interface HoldBadgeProps {
  row: unknown
  className?: string
}

// Shown on titles with an explicit, unexpired preorder hold. Reads the hold
// record via utils/preorderFlags; renders nothing when there is none.
export default function HoldBadge({ row, className = "" }: HoldBadgeProps) {
  const hold = activeHold(row)
  if (!hold) return null
  return (
    <span
      title="A person set this hold. The title stays in the Preorder collection, keeping the preorder incentive and copy, until the hold ends."
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold whitespace-nowrap bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300 ${className}`}
    >
      ⏸ {holdLabel(hold)}
    </span>
  )
}
