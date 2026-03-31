// PreorderTable.tsx
import React from "react"
import { PreorderRow } from "../../types/preorderTypes"

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

function getConfidenceBadgeClass(confidence: string) {
  const base = "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border-0 ml-1.5"
  return confidence === "verified"
    ? `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`
    : `${base} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`
}

function formatClassificationLabel(status: string) {
  return status?.replace(/_preorder|_arrival/g, "").replace(/_/g, " ") ?? "—"
}

const PreorderTable: React.FC<PreorderTableProps> = ({ data, onRowClick, isHistorical = false }) => {
  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
          <tr>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-left">Title</th>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-left">Status</th>
            <th className="hidden sm:table-cell px-4 py-3 border-b dark:border-gray-700 text-left">Pub Date</th>
            <th className="hidden md:table-cell px-4 py-3 border-b dark:border-gray-700 text-right">
              {isHistorical ? "Total Presales" : "Live Presales"}
            </th>
            {!isHistorical && (
              <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-right">Action</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {data.map((row) => (
            <tr
              key={row.product_id}
              className={`even:bg-gray-50/50 dark:even:bg-gray-800/50 transition-colors ${
                isHistorical
                  ? "opacity-75"
                  : "hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              }`}
              onClick={isHistorical ? undefined : () => onRowClick(row)}
            >
              <td className="px-3 sm:px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[150px] sm:max-w-xs truncate">
                {row.title}
                <div className="text-[10px] font-mono text-gray-400 mt-0.5">{row.product_id}</div>
              </td>
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
              <td className="hidden sm:table-cell px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                {row.pub_date ?? "—"}
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
              {!isHistorical && (
                <td className="px-3 sm:px-4 py-3 text-right">
                  <button className="text-blue-600 dark:text-blue-400 font-medium text-xs sm:text-sm">
                    Details
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default PreorderTable