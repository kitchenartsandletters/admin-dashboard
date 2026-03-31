// ReleaseReviewTable.tsx
import React from "react"
import { ReleaseReviewRow } from "../../types/preorderTypes"

interface ReleaseReviewTableProps {
  data: ReleaseReviewRow[]
}

function getConfidenceBadgeClass(confidence: string) {
  const base = "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border-0"
  return confidence === "verified"
    ? `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`
    : `${base} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`
}

const ReleaseReviewTable: React.FC<ReleaseReviewTableProps> = ({ data }) => {
  const releaseReady = data.filter((r) => r.due_for_release_review)
  const rest = data.filter((r) => !r.due_for_release_review)
  const sorted = [...releaseReady, ...rest]

  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
          <tr>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-left">Product</th>
            <th className="hidden sm:table-cell px-4 py-3 border-b dark:border-gray-700 text-left">Pub Date</th>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-right">Live Presales</th>
            <th className="hidden md:table-cell px-4 py-3 border-b dark:border-gray-700 text-left">Status</th>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-right">Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {sorted.map((row) => (
            <tr
              key={row.product_id}
              className="even:bg-gray-50/50 dark:even:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <td className="px-3 sm:px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[120px] sm:max-w-none truncate">
                {row.title}
                <div className="sm:hidden text-[10px] font-mono text-gray-400 mt-0.5">
                  {row.pub_date ?? "—"}
                </div>
              </td>
              <td className="hidden sm:table-cell px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                {row.pub_date ?? "—"}
              </td>
              <td className="px-3 sm:px-4 py-3 text-right">
                <span className="font-mono font-bold text-gray-900 dark:text-white text-xs">
                  {row.live_presale_qty.toLocaleString()}
                </span>
                <span className={getConfidenceBadgeClass(row.data_confidence) + " ml-1.5"}>
                  {row.data_confidence}
                </span>
              </td>
              <td className="hidden md:table-cell px-4 py-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border-0 ${
                    row.due_for_release_review
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  }`}
                >
                  {row.due_for_release_review ? "Due for review" : "Pending"}
                </span>
              </td>
              <td className="px-3 sm:px-4 py-3 text-right">
                <button className="text-blue-600 dark:text-blue-400 font-medium text-xs sm:text-sm">
                  Review
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ReleaseReviewTable