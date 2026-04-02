// src/utils/tableUtils.ts

/** Strip leading articles for sort purposes: "The Art of..." → "Art of..." */
export function sortTitle(title: string | null | undefined): string {
  if (!title) return ""
  return title.replace(/^(a |an |the )/i, "").toLowerCase()
}

/** Format YYYY-MM-DD or ISO timestamp to "Month DD, YYYY" */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "—"
  const d = new Date(date)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  })
}

/** Operational stock status label for the Releases Upcoming section */
export function stockReceivedLabel(
  arrivalTiming: string | null | undefined
): { label: string; received: boolean } {
  switch (arrivalTiming) {
    case "early_arrival":
    case "on_time_arrival":
    case "late_arrival":
      return { label: "Stock in hand", received: true }
    case "no_arrival":
    default:
      return { label: "Awaiting stock", received: false }
  }
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