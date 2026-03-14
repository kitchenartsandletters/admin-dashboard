import React from "react"
import { PreorderRow } from "../../types/preorderTypes"

interface PreorderTableProps {
  data: PreorderRow[]
  onRowClick: (row: PreorderRow) => void
}

function getStatusBadgeClass(status: string) {
  const base = "inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium border-0"
  switch (status) {
    case "active_preorder":
      return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200`
    case "early_stock_arrival":
      return `${base} bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200`
    default:
      if (status.startsWith("anomaly")) {
        return `${base} bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200`
      }
      return `${base} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
  }
}

const PreorderTable: React.FC<PreorderTableProps> = ({ data, onRowClick }) => {
  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
          <tr>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-left">Title</th>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-left">Status</th>
            <th className="hidden sm:table-cell px-4 py-3 border-b dark:border-gray-700 text-left">Pub Date</th>
            <th className="hidden md:table-cell px-4 py-3 border-b dark:border-gray-700 text-left">Lifecycle</th>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {data.map((row) => (
            <tr
              key={row.product_id}
              className="even:bg-gray-50/50 dark:even:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              onClick={() => onRowClick(row)}
            >
              <td className="px-3 sm:px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[150px] sm:max-w-xs truncate">
                {row.title}
                <div className="text-[10px] font-mono text-gray-400 mt-0.5">{row.product_id}</div>
              </td>
              <td className="px-3 sm:px-4 py-3">
                <span className={getStatusBadgeClass(row.classification_status)}>
                  {row.classification_status.replace(/_preorder|_arrival/g, '')}
                </span>
              </td>
              <td className="hidden sm:table-cell px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                {row.effective_pub_date ?? "—"}
              </td>
              <td className="hidden md:table-cell px-4 py-3 text-gray-500 dark:text-gray-400 italic">
                {row.lifecycle_state}
              </td>
              <td className="px-3 sm:px-4 py-3 text-right">
                <button className="text-blue-600 dark:text-blue-400 font-medium text-xs sm:text-sm">
                  Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default PreorderTable