import { hasPriorRun, formatRunCutoff, type WithRunState } from "../../utils/runState"

// Marks a title with a closed prior run (a reissue). Shown beside the status so
// nobody reads its figures as continuous with run 1.
export function ReissueBadge({ row, className = "" }: { row: WithRunState; className?: string }) {
  if (!hasPriorRun(row)) return null
  const cutoff = formatRunCutoff(row.run_state?.current_run_started_at)
  return (
    <span
      title={`Reissue. A previous run closed on ${cutoff}; figures shown are for the current run only.`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold whitespace-nowrap bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300 ${className}`}
    >
      ↻ Reissue
    </span>
  )
}

/**
 * The presale figure for a list cell. For a reissue, run 1's live/total
 * presales and data_confidence don't describe the current run (the cohort
 * window even merges both runs), so it shows current_run_open_units instead.
 */
export function presaleCell(
  row: WithRunState & { live_presale_qty: number; total_presale_qty: number; data_confidence: string },
  figure: "live" | "total",
): { qty: number; tag: string; reissue: boolean } {
  if (hasPriorRun(row)) {
    return { qty: row.run_state!.current_run_open_units, tag: "current run", reissue: true }
  }
  return {
    qty: figure === "total" ? row.total_presale_qty : row.live_presale_qty,
    tag: row.data_confidence,
    reissue: false,
  }
}

export const CURRENT_RUN_TAG_CLASS =
  "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border-0 ml-1.5 bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
