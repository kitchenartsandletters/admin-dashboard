import React, { useState, useMemo } from "react"
import { PreorderRow } from "../../types/preorderTypes"
import {
  sortTitle, formatDate, SortConfig, SortIcon,
  nextSortDirection
} from "../../utils/tableUtils"

interface PreorderTableProps {
  data: PreorderRow[]
  onRowClick: (row: PreorderRow) => void
  isHistorical?: boolean
}

function getClassificationBadgeClass(status: string) {
  const base = "inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium border-0"
  switch (status) {
    case "active_preorder":
      return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200`
    case "early_stock_arrival":
      return `${base} bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200`
    case "historical_preorder":
      return `${base} bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400`
    default:
      if (status?.startsWith("anomaly")) {
        return `${base} bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200`
      }
      return `${base} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
  }
}

function formatClassificationLabel(status: string) {
  if (status === "early_stock_arrival") return "stock in hand"
  return status?.replace(/_preorder|_arrival/g, "").replace(/_/g, " ") ?? "—"
}

function getConfidenceBadgeClass(confidence: string) {
  const base = "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border-0 ml-1.5"
  return confidence === "verified"
    ? `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`
    : `${base} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`
}

type SortKey = "title" | "classification" | "pub_date"

const PreorderTable: React.FC<PreorderTableProps> = ({
  data,
  onRowClick,
  isHistorical = false,
}) => {
  const [sortConfig, setSortConfig] = useState<SortConfig<{ title: string; classification: string; pub_date: string }> | null>({
    key: "pub_date",
    direction: "asc",
  })

  const handleSort = (key: SortKey) => {
    setSortConfig({
      key,
      direction: nextSortDirection(sortConfig as any, key),
    })
  }

  const sorted = useMemo(() => {
    if (!sortConfig) return data
    return [...data].sort((a, b) => {
      const dir = sortConfig.direction === "asc" ? 1 : -1
      switch (sortConfig.key) {
        case "title":
          return sortTitle(a.title).localeCompare(sortTitle(b.title)) * dir
        case "classification":
          return (a.classification ?? "").localeCompare(b.classification ?? "") * dir
        case "pub_date":
          return ((a.pub_date ?? "9999") > (b.pub_date ?? "9999") ? 1 : -1) * dir
        default:
          return 0
      }
    })
  }, [data, sortConfig])

  const thClass = (key: SortKey) =>
    `px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-left cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors`

  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
          <tr>
            <th className={thClass("title")} onClick={() => handleSort("title")}>
              Title
              <SortIcon active={sortConfig?.key === "title"} direction={sortConfig?.direction ?? "asc"} />
            </th>
            {!isHistorical && (
              <th className={thClass("classification")} onClick={() => handleSort("classification")}>
                Status
                <SortIcon active={sortConfig?.key === "classification"} direction={sortConfig?.direction ?? "asc"} />
              </th>
            )}
            <th className={thClass("pub_date")} onClick={() => handleSort("pub_date")}>
              Pub Date
              <SortIcon active={sortConfig?.key === "pub_date"} direction={sortConfig?.direction ?? "asc"} />
            </th>
            <th className="hidden md:table-cell px-4 py-3 border-b dark:border-gray-700 text-right">
              {isHistorical ? "Total Presales" : "Live Presales"}
            </th>
              <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-right">
                Action
              </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {sorted.map((row) => (
            <tr
              key={row.product_id}
              className="even:bg-gray-50/50 dark:even:bg-gray-800/50 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              onClick={() => onRowClick(row)}
            >
              <td className="px-3 sm:px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[150px] sm:max-w-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{row.title}</span>
                  {isHistorical && row.already_reported && (
                    <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-medium">
                      Reported
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-gray-400 mt-0.5">{row.product_id}</div>
              </td>
              {!isHistorical && (
                <td className="px-3 sm:px-4 py-3">
                  <span className={getClassificationBadgeClass(row.classification)}>
                    {formatClassificationLabel(row.classification)}
                  </span>
                  {row.anomaly_type && (
                    <div className="text-[9px] text-red-500 dark:text-red-400 mt-0.5 font-mono">
                      {row.anomaly_type}
                    </div>
                  )}
                </td>
              )}
              <td className="px-3 sm:px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                {formatDate(row.pub_date)}
              </td>
              <td className="hidden md:table-cell px-4 py-3 text-right">
                <span className="font-mono font-bold text-gray-900 dark:text-white text-xs">
                  {isHistorical
                    ? row.total_presale_qty.toLocaleString()
                    : row.live_presale_qty.toLocaleString()}
                </span>
                <span className={getConfidenceBadgeClass(row.data_confidence)}>
                  {row.data_confidence}
                </span>
              </td>
                <td className="px-3 sm:px-4 py-3 text-right">
                  <button className="text-blue-600 dark:text-blue-400 font-medium text-xs sm:text-sm">
                    Details
                  </button>
                </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500 italic"
              >
                No titles found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default PreorderTable