// src/utils/preorderFlags.ts
//
// Display-only flags layered on top of the backend classification.
// The dashboard never re-derives preorder state: `classification` from
// preorder-service is the authority. These helpers only add context that the
// classification alone does not convey, the same way the stock-received flag
// does.
//
// The two flags are mutually exclusive by construction: stock received needs a
// live arrival record, the delayed-import hold needs its absence.

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

/** Whole days between pub_date and today (ET). Positive once the date has passed. */
export function daysPastPub(pubDate: string | null): number | null {
  if (!pubDate) return null
  const pub = Date.parse(pubDate.substring(0, 10) + "T00:00:00Z")
  const today = Date.parse(todayET() + "T00:00:00Z")
  if (Number.isNaN(pub)) return null
  return Math.round((today - pub) / 86_400_000)
}

/**
 * Stock received: an active preorder with a live inventory_arrival record.
 * Fulfillable now even if demand oversold it into negative inventory;
 * a candidate for shipping-profile detachment.
 */
export function hasReceivedStock(row: FlagFields): boolean {
  return row.classification === "active_preorder" && row.arrival_record_is_live === true
}

/**
 * Delayed-import hold: still an active preorder after its pub date because
 * stock never arrived and presale commitments are open. The backend keeps it
 * active on purpose. This is not stale data.
 *
 * Pub day itself is excluded: a title is legitimately active on its pub date
 * (the engine's active check is inclusive), so the hold starts the day after.
 */
export function isDelayedImportHold(row: FlagFields): boolean {
  if (row.classification !== "active_preorder") return false
  if (row.arrival_record_is_live === true) return false
  const days = daysPastPub(row.pub_date)
  return days !== null && days > 0
}
