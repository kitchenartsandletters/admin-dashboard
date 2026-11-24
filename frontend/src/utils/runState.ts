// src/utils/runState.ts
//
// Run awareness for titles with a closed prior run (a limited reissue on the
// same product and ISBN). preorder.lifecycle_snapshot keeps one lifecycle per
// product, so several per-title columns describe run 1, not the reissue:
// data_confidence, live/estimated presales, arrival_timing,
// first_positive_inventory_at, already_reported. For these titles the
// dashboard reads current-run figures from vw_run_state and shows run-1 facts
// only in a separate, labelled "previous run" panel.
//
// A row without run_state (not covered by the view, or the endpoint is not
// available) behaves exactly as before.

import type { RunStateRow } from "../../api/preorderApi"

export type RunState = RunStateRow

export interface WithRunState {
  run_state?: RunState | null
}

/** True when the title has a closed prior run, so run-1 columns are stale. */
export function hasPriorRun(row: unknown): boolean {
  return (row as WithRunState | null)?.run_state?.has_prior_closed_run === true
}

/**
 * Reporting status for the run that is live now. For a reissue,
 * already_reported is run 1's NYT submission; reading it as current could get
 * the reissue queued as if already handled. Where run state is present,
 * current_run_reported is authoritative (it equals already_reported for every
 * single-run title).
 */
export function isReportedNow(row: { already_reported?: boolean | null } & WithRunState): boolean {
  if (row.run_state) return row.run_state.current_run_reported === true
  return row.already_reported === true
}

/** Attach run state to rows by product_id. A null/undefined source is a no-op. */
export function withRunState<T extends { product_id: number }>(
  rows: T[],
  states: RunState[] | null | undefined,
): Array<T & WithRunState> {
  if (!states) return rows
  const byId = new Map(states.map((s) => [s.product_id, s]))
  return rows.map((row) => {
    const s = byId.get(row.product_id)
    return s ? { ...row, run_state: s } : row
  })
}

/** "Mar 31, 2026" from an ISO timestamp, in Eastern time. */
export function formatRunCutoff(ts: string | null | undefined): string {
  if (!ts) return "—"
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
  })
}

/** Real inventory text, showing oversell instead of hiding it at 0. */
export function inventoryText(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  if (n < 0) return `${n.toLocaleString()} (oversold by ${(-n).toLocaleString()})`
  return n.toLocaleString()
}
