// src/utils/preorderFlags.ts
//
// Display-only flags layered on top of the backend classification.
// The dashboard never re-derives preorder state: `classification` from
// preorder-service is the authority. These helpers only add context that the
// classification alone does not convey.

interface FlagFields {
  classification: string
  pub_date: string | null
  arrival_record_is_live?: boolean | null
}

/** Today's date as YYYY-MM-DD in America/New_York (the store's business day). */
export function todayET(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/**
 * Stock received: an active preorder with a live inventory_arrival record.
 * Fulfillable now even if demand oversold it into negative inventory;
 * a candidate for shipping-profile detachment.
 */
export function hasReceivedStock(row: FlagFields): boolean {
  return row.classification === "active_preorder" && row.arrival_record_is_live === true
}

// ── Preorder holds ─────────────────────────────────────────────────────────────────────
//
// A hold is an explicit record a person sets deliberately, with an end date
// (preorder.preorder_hold). It is never inferred from pub date or stock: once
// a pub date passes without stock, the title is historical with unresolved
// commitments, not held.
//
// A held title stays in the Preorder collection on purpose. Collection
// membership drives the rewards incentive, so that membership (and the
// preorder copy in the description) is what is being held. That is why a
// held title must never be offered Full Cleanup.
//
//   event          — a signing or similar; the incentive runs past pub date
//   awaiting_stock — stock genuinely in transit; keep preorder presentation

export type HoldReason = "event" | "awaiting_stock"

/** PROVISIONAL shape, pending the backend's final field names. */
export interface PreorderHold {
  hold_until: string // YYYY-MM-DD, last held day (inclusive)
  reason: HoldReason
}

/**
 * The one place the dashboard reads a hold from a row.
 *
 * Returns null until preorder-service exposes the hold on its responses, so
 * every hold-dependent behaviour is currently off: no label, and Full Cleanup
 * and the Needs Cleanup filter behave as they did before holds existed.
 * When the backend lands, map its field here and nowhere else.
 */
export function getHold(_row: unknown): PreorderHold | null {
  return null
}

/** True while today (ET) is on or before hold_until. Pure, so it is testable. */
export function isHoldInForce(hold: PreorderHold | null, today: string = todayET()): boolean {
  if (!hold || !hold.hold_until) return false
  return hold.hold_until.substring(0, 10) >= today
}

/** The row's hold if it is still in force today (ET), otherwise null. */
export function activeHold(row: unknown): PreorderHold | null {
  const hold = getHold(row)
  return isHoldInForce(hold) ? hold : null
}

/** True only while an explicit, unexpired hold exists. */
export function isHeld(row: unknown): boolean {
  return activeHold(row) !== null
}

const HOLD_REASON_LABEL: Record<HoldReason, string> = {
  event: "event",
  awaiting_stock: "awaiting stock",
}

/** "Oct 20" from YYYY-MM-DD, without timezone drift. */
function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.substring(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** e.g. "Held until Oct 20 · event". */
export function holdLabel(hold: PreorderHold): string {
  const reason = HOLD_REASON_LABEL[hold.reason] ?? String(hold.reason).replace(/_/g, " ")
  return `Held until ${shortDate(hold.hold_until)} · ${reason}`
}
