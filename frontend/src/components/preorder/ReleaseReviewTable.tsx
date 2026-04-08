import React, { useState, useMemo } from "react"
import { ReleaseReviewRow, ReportablePreorderRow } from "../../types/preorderTypes"
import { generateReportPreview, markReported } from "../../../api/preorderApi"
import {
  sortTitle, formatDate, stockReceivedLabel,
  SortConfig, SortIcon, nextSortDirection
} from "../../utils/tableUtils"

interface ReleaseReviewTableProps {
  upcoming: ReleaseReviewRow[]
  reportable: ReportablePreorderRow[]
  onReported?: () => void
}

function ConfidenceBadge({ confidence }: { confidence: "verified" | "estimated" }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ml-1.5 ${
      confidence === "verified"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
    }`}>
      {confidence === "verified" ? "✓" : "~"} {confidence}
    </span>
  )
}

function resolveWeekBounds(anchor: Date): { start: Date; end: Date; label: string } {
  const dayOfWeek = anchor.getDay()
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - dayOfWeek)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}` }
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0]
}

function daysUntil(pubDate: string | null): number | null {
  if (!pubDate) return null
  const diff = new Date(pubDate).getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

type UpcomingSortKey = "title" | "pub_date"
type ReportableSortKey = "title" | "pub_date"

const ReleaseReviewTable: React.FC<ReleaseReviewTableProps> = ({
  upcoming,
  reportable,
  onReported,
}) => {
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date())
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [marking, setMarking] = useState(false)
  const [markSuccess, setMarkSuccess] = useState(false)

  const [upcomingSort, setUpcomingSort] = useState<SortConfig<{ title: string; pub_date: string }> | null>(null)
  const [reportableSort, setReportableSort] = useState<SortConfig<{ title: string; pub_date: string }> | null>(null)

  const week = useMemo(() => resolveWeekBounds(weekAnchor), [weekAnchor])
  const isCurrentWeek = toISODate(week.start) === toISODate(resolveWeekBounds(new Date()).start)
  const weekIsClosed = toISODate(week.end) < toISODate(new Date())
  const weeksFromCurrent = Math.abs(
    Math.round(
      (week.start.getTime() - resolveWeekBounds(new Date()).start.getTime())
      / (7 * 24 * 60 * 60 * 1000)
    )
  )
  const showReturnButton = weeksFromCurrent > 2

  const reportableForWeek = useMemo(() =>
    reportable.filter((r) => r.report_week_start === toISODate(week.start)),
    [reportable, week])

  const sortedUpcoming = useMemo(() => {
    if (!upcomingSort) return upcoming
    return [...upcoming].sort((a, b) => {
      const dir = upcomingSort.direction === "asc" ? 1 : -1
      if (upcomingSort.key === "title")
        return sortTitle(a.title).localeCompare(sortTitle(b.title)) * dir
      return ((a.pub_date ?? "9999") > (b.pub_date ?? "9999") ? 1 : -1) * dir
    })
  }, [upcoming, upcomingSort])

  const sortedReportable = useMemo(() => {
    if (!reportableSort) return reportableForWeek
    return [...reportableForWeek].sort((a, b) => {
      const dir = reportableSort.direction === "asc" ? 1 : -1
      if (reportableSort.key === "title")
        return sortTitle(a.title).localeCompare(sortTitle(b.title)) * dir
      return ((a.pub_date ?? "9999") > (b.pub_date ?? "9999") ? 1 : -1) * dir
    })
  }, [reportableForWeek, reportableSort])

  const handleUpcomingSort = (key: UpcomingSortKey) => {
    setUpcomingSort({ key, direction: nextSortDirection(upcomingSort as any, key) })
  }

  const handleReportableSort = (key: ReportableSortKey) => {
    setReportableSort({ key, direction: nextSortDirection(reportableSort as any, key) })
  }

  const toggleId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === sortedReportable.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedReportable.map((r) => r.product_id)))
    }
  }

  const handleGeneratePreview = async () => {
    if (selectedIds.size === 0) return
    setGenerating(true)
    setError(null)
    try {
      const blob = await generateReportPreview(Array.from(selectedIds), toISODate(weekAnchor))
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `nyt_preview_${toISODate(week.end)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message || "Report generation failed")
    } finally {
      setGenerating(false)
    }
  }

  const shiftWeek = (direction: -1 | 1) => {
    const next = new Date(weekAnchor)
    next.setDate(weekAnchor.getDate() + direction * 7)
    setWeekAnchor(next)
    setSelectedIds(new Set())
  }

  const handleMarkReported = async () => {
    if (selectedIds.size === 0) return
    setMarking(true)
    setMarkSuccess(false)
    setError(null)
    try {
      await markReported(Array.from(selectedIds), toISODate(weekAnchor))
      setMarkSuccess(true)
      setSelectedIds(new Set())
      // Signal parent to reload data so badges update
      onReported?.()
    } catch (err: any) {
      setError(err.message || "Failed to mark as reported")
    } finally {
      setMarking(false)
    }
  }

  const thClass = "px-4 py-3 border-b dark:border-gray-700 text-left cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-[10px] sm:text-xs uppercase tracking-wider font-semibold"

  return (
    <div className="space-y-8">

      {/* ── Upcoming ── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3 border-l-2 border-amber-400 pl-2">
          Upcoming — Next 7 Days
        </h2>

        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic px-1">
            No titles publishing within 7 days.
          </p>
        ) : (
          <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className={thClass} onClick={() => handleUpcomingSort("title")}>
                    Title
                    <SortIcon active={upcomingSort?.key === "title"} direction={upcomingSort?.direction ?? "asc"} />
                  </th>
                  <th className={thClass} onClick={() => handleUpcomingSort("pub_date")}>
                    Pub Date
                    <SortIcon active={upcomingSort?.key === "pub_date"} direction={upcomingSort?.direction ?? "asc"} />
                  </th>
                  <th className="px-4 py-3 border-b dark:border-gray-700 text-center text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
                    Days Out
                  </th>
                  <th className="px-4 py-3 border-b dark:border-gray-700 text-left text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
                    Stock Status
                  </th>
                  <th className="px-4 py-3 border-b dark:border-gray-700 text-right text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
                    Live Presales
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedUpcoming.map((row) => {
                  const days = daysUntil(row.pub_date)
                  const stock = stockReceivedLabel(row.inventory ?? 0, row.arrival_timing)
                  return (
                    <tr key={row.product_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-xs truncate">
                        {row.title}
                        <div className="text-[10px] font-mono text-gray-400 mt-0.5">{row.isbn ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(row.pub_date)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold ${
                          days !== null && days <= 1
                            ? "text-red-600 dark:text-red-400"
                            : days !== null && days <= 3
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-gray-500 dark:text-gray-400"
                        }`}>
                          {days !== null ? (days === 0 ? "Today" : `${days}d`) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${
                          stock.received
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {stock.received ? "✓" : "○"} {stock.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-bold text-xs text-gray-900 dark:text-white">
                          {row.live_presale_qty.toLocaleString()}
                        </span>
                        <ConfidenceBadge confidence={row.data_confidence} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Reportable ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 border-l-2 border-blue-500 pl-2">
            Reportable — NYT Eligible
          </h2>
          <div className="flex items-center gap-2 text-xs">
            {showReturnButton && (
              <button
                onClick={() => {
                  setWeekAnchor(new Date())
                  setSelectedIds(new Set())
                }}
                className="px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 font-medium transition-colors"
              >
                ↩ Current week
              </button>
            )}
            <button
              onClick={() => shiftWeek(-1)}
              className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            >←</button>
            <span className="font-mono text-gray-700 dark:text-gray-300 min-w-[180px] text-center">
              {week.label}
            </span>
            <button
              onClick={() => shiftWeek(1)}
              disabled={isCurrentWeek}
              className={`px-2 py-1 rounded ${
                isCurrentWeek
                  ? "bg-gray-50 dark:bg-gray-900 text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >→</button>
          </div>
        </div>

        {sortedReportable.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic px-1">
            No reportable titles for this reporting week.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 border-b dark:border-gray-700 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === sortedReportable.length && sortedReportable.length > 0}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className={thClass} onClick={() => handleReportableSort("title")}>
                      Title
                      <SortIcon active={reportableSort?.key === "title"} direction={reportableSort?.direction ?? "asc"} />
                    </th>
                    <th className="px-4 py-3 border-b dark:border-gray-700 text-left text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
                      ISBN
                    </th>
                    <th className={thClass} onClick={() => handleReportableSort("pub_date")}>
                      Pub Date
                      <SortIcon active={reportableSort?.key === "pub_date"} direction={reportableSort?.direction ?? "asc"} />
                    </th>
                    <th className="px-4 py-3 border-b dark:border-gray-700 text-right text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
                      Total Presales
                    </th>
                    <th className="px-4 py-3 border-b dark:border-gray-700 text-center text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sortedReportable.map((row) => (
                    <tr
                      key={row.product_id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${row.already_reported ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.product_id)}
                          onChange={() => toggleId(row.product_id)}
                          disabled={row.already_reported}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-xs truncate">
                        {row.title}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {row.isbn ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(row.pub_date)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-bold text-xs text-gray-900 dark:text-white">
                          {row.total_presale_qty.toLocaleString()}
                        </span>
                        <ConfidenceBadge confidence={row.data_confidence} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.already_reported ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-medium">
                            Reported
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedIds.size > 0
                  ? `${selectedIds.size} title${selectedIds.size !== 1 ? "s" : ""} selected`
                  : weekIsClosed
                  ? "Select titles to include in report"
                  : `Reporting week closes ${formatDate(toISODate(week.end))}. Actions available from ${formatDate(toISODate(new Date(week.end.getTime() + 86400000)))}.`
                }
              </p>
              <div className="flex items-center gap-3">
                {error && (
                  <span className="text-xs text-red-500 dark:text-red-400">{error}</span>
                )}
                {markSuccess && (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    ✓ Marked as reported
                  </span>
                )}
                <button
                  onClick={handleGeneratePreview}
                  disabled={selectedIds.size === 0 || generating || !weekIsClosed}
                  className="px-4 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-all"
                >
                  {generating ? "Generating…" : "Generate Test Report"}
                </button>
                <button
                  onClick={handleMarkReported}
                  disabled={selectedIds.size === 0 || marking || !weekIsClosed}
                  className="px-4 py-2 text-xs font-bold bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded shadow transition-all active:scale-[0.98]"
                >
                  {marking ? "Saving…" : "Mark as Reported"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

export default ReleaseReviewTable