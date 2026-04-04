// src/utils/tableUtils.ts

/** Strip leading articles for sort purposes: "The Art of..." → "Art of..." */
export function sortTitle(title: string | null | undefined): string {
  if (!title) return ""
  return title.replace(/^(a |an |the )/i, "").toLowerCase()
}

/** Format YYYY-MM-DD or ISO timestamp to "Month DD, YYYY" */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "—"
  // Split YYYY-MM-DD directly to avoid timezone offset issues.
  // new Date("2026-04-07") parses as UTC midnight which shifts to the
  // prior day when converted to ET. Parsing parts directly avoids this.
  const parts = date.substring(0, 10).split("-")
  if (parts.length !== 3) return "—"
  const [year, month, day] = parts.map(Number)
  if (!year || !month || !day) return "—"
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

/** Operational stock status label for the Releases Upcoming section */
export function stockReceivedLabel(
  inventory: number,
  arrivalTiming: string | null | undefined
): { label: string; received: boolean } {
  // Primary signal: current inventory count.
  // If inventory is positive, stock is physically on hand now.
  // arrival_timing is not used here because it reflects historical
  // first-positive event which may have been a refund restock,
  // manual adjustment, or incoming PO allocation — not publisher receipt.
  if (inventory > 0) {
    return { label: "Stock in hand", received: true }
  }
  return { label: "Awaiting stock", received: false }
}

export type SortDirection = "asc" | "desc"

export interface SortConfig<T> {
  key: keyof T
  direction: SortDirection
}

/** Returns next sort direction, toggling asc/desc, defaulting to asc */
export function nextSortDirection<T>(
  config: SortConfig<T> | null,
  key: keyof T
): SortDirection {
  if (config?.key === key && config.direction === "asc") return "desc"
  return "asc"
}

/** Sort icon element */
export function SortIcon({
  active,
  direction,
}: {
  active: boolean
  direction: SortDirection
}) {
  if (!active) return <span className="ml-1 text-gray-300 dark:text-gray-600">↕</span>
  return (
    <span className="ml-1 text-blue-500">
      {direction === "asc" ? "↑" : "↓"}
    </span>
  )
}