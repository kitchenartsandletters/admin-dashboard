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

/** Hold columns on vw_preorder_products (all null when no hold record exists). */
export interface HoldFields {
  hold_until?: string | null      // YYYY-MM-DD, last held day, inclusive
  hold_reason?: HoldReason | string | null
  hold_note?: string | null       // human wording, e.g. "signing with the author"
  hold_active?: boolean | null    // authoritative; evaluated server-side in ET
}

export interface PreorderHold {
  hold_until: string | null
  reason: string | null
  note: string | null
}

/**
 * The one place the dashboard reads a hold from a row.
 *
 * `hold_active` is authoritative. preorder-service evaluates it in Eastern
 * time with the same rule in the SQL view and the Python service, so the
 * dashboard never compares dates itself: the browser's clock and timezone
 * cannot make the label disagree with the classifier or the cleanup guard.
 */
export function getHold(row: unknown): PreorderHold | null {
  if (!row || typeof row !== "object") return null
  const r = row as HoldFields
  if (r.hold_active !== true) return null
  return {
    hold_until: r.hold_until ?? null,
    reason: r.hold_reason ?? null,
    note: r.hold_note?.trim() || null,
  }
}

/** The row's live hold, or null. Alias kept so call sites read naturally. */
export function activeHold(row: unknown): PreorderHold | null {
  return getHold(row)
}

/** True only while an explicit hold is live (per the backend's hold_active). */
export function isHeld(row: unknown): boolean {
  return getHold(row) !== null
}

const HOLD_REASON_LABEL: Record<string, string> = {
  event: "event",
  awaiting_stock: "awaiting stock",
}

/** "Oct 20" from YYYY-MM-DD, without timezone drift. */
function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.substring(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** What the hold is for: the note if someone wrote one, else the reason. */
export function holdPurpose(hold: PreorderHold): string {
  if (hold.note) return hold.note
  if (!hold.reason) return "hold"
  return HOLD_REASON_LABEL[hold.reason] ?? hold.reason.replace(/_/g, " ")
}

/** e.g. "Held until Oct 20 · signing with the author". */
export function holdLabel(hold: PreorderHold): string {
  const until = hold.hold_until ? `Held until ${shortDate(hold.hold_until)}` : "Held"
  return `${until} · ${holdPurpose(hold)}`
}

/**
 * Copy the hold columns from `source` rows onto `target` rows by product_id,
 * where the target doesn't carry them. /upcoming reads vw_preorder_release_queue,
 * which doesn't expose the hold columns; vw_preorder_products does.
 * If the release-queue view gains them, target values win and this is a no-op.
 */
export function withHoldFields<T extends { product_id: number }>(
  target: T[],
  source: Array<{ product_id: number } & HoldFields>,
): Array<T & HoldFields> {
  const byId = new Map(source.map((r) => [r.product_id, r]))
  return target.map((row) => {
    const t = row as T & HoldFields
    if (t.hold_active !== undefined) return t
    const s = byId.get(row.product_id)
    if (!s) return t
    return {
      ...t,
      hold_until: s.hold_until ?? null,
      hold_reason: s.hold_reason ?? null,
      hold_note: s.hold_note ?? null,
      hold_active: s.hold_active ?? null,
    }
  })
}
