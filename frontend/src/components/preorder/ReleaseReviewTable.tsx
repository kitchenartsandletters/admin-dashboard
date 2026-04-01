import React, { useState, useMemo } from "react"
import { ReleaseReviewRow, ReportablePreorderRow } from "../../types/preorderTypes"
import { generateReportPreview } from "../../../api/preorderApi"

interface ReleaseReviewTableProps {
  upcoming: ReleaseReviewRow[]
  reportable: ReportablePreorderRow[]
}

function resolveWeekBounds(anchor: Date): { start: Date; end: Date; label: string } {
  const dayOfWeek = anchor.getDay() // 0 = Sunday
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - dayOfWeek)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
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

const ReleaseReviewTable: React.FC<ReleaseReviewTableProps> = ({ upcoming, reportable }) => {
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date())
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const week = useMemo(() => resolveWeekBounds(weekAnchor), [weekAnchor])

  const reportableForWeek = useMemo(() =>
    reportable.filter(
      (r) => r.report_week_start === toISODate(week.start)
    ), [reportable, week])

  const toggleId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === reportableForWeek.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(reportableForWeek.map((r) => r.product_id)))
    }
  }

  const handleGeneratePreview = async () => {
    if (selectedIds.size === 0) return
    setGenerating(true)
    setError(null)
    try {
      const blob = await generateReportPreview(
        Array.from(selectedIds),
        toISODate(weekAnchor)
      )
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

  const weekIsInFuture = week.start > new Date()

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
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3 border-b dark:border-gray-700 text-left">Title</th>
                  <th className="px-4 py-3 border-b dark:border-gray-700 text-left">Pub Date</th>
                  <th className="px-4 py-3 border-b dark:border-gray-700 text-center">Days Out</th>
                  <th className="px-4 py-3 border-b dark:border-gray-700 text-right">Live Presales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {upcoming.map((row) => {
                  const days = daysUntil(row.pub_date)
                  return (
                    <tr key={row.product_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {row.title}
                        <div className="text-[10px] font-mono text-gray-400 mt-0.5">{row.isbn ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {row.pub_date ?? "—"}
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

          {/* Week selector */}
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => shiftWeek(-1)}
              className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              ←
            </button>
            <span className="font-mono text-gray-700 dark:text-gray-300 min-w-[180px] text-center">
              {week.label}
            </span>
            <button
              onClick={() => shiftWeek(1)}
              className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              →
            </button>
          </div>
        </div>

        {reportableForWeek.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic px-1">
            {weekIsInFuture
              ? "Titles for this week have not yet published. Check back after pub dates pass."
              : "No reportable titles for this reporting week."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3 border-b dark:border-gray-700 text-left w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === reportableForWeek.length && reportableForWeek.length > 0}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 border-b dark:border-gray-700 text-left">Title</th>
                    <th className="px-4 py-3 border-b dark:border-gray-700 text-left">ISBN</th>
                    <th className="px-4 py-3 border-b dark:border-gray-700 text-left">Pub Date</th>
                    <th className="px-4 py-3 border-b dark:border-gray-700 text-right">Total Presales</th>
                    <th className="px-4 py-3 border-b dark:border-gray-700 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {reportableForWeek.map((row) => (
                    <tr
                      key={row.product_id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                        row.already_reported ? "opacity-50" : ""
                      }`}
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
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {row.pub_date ?? "—"}
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

            {/* Report generation footer */}
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedIds.size > 0
                  ? `${selectedIds.size} title${selectedIds.size !== 1 ? "s" : ""} selected`
                  : "Select titles to include in the test report"}
              </p>
              <div className="flex items-center gap-3">
                {error && (
                  <span className="text-xs text-red-500 dark:text-red-400">{error}</span>
                )}
                <button
                  onClick={handleGeneratePreview}
                  disabled={selectedIds.size === 0 || generating}
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 rounded shadow transition-all active:scale-[0.98]"
                >
                  {generating ? "Generating…" : "Generate Test Report"}
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