import React from "react"
import { ReleaseReviewRow } from "../../types/preorderTypes"

interface ReleaseReviewTableProps {
  data: ReleaseReviewRow[]
}

const ReleaseReviewTable: React.FC<ReleaseReviewTableProps> = ({ data }) => {
  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs uppercase tracking-wider font-semibold">
          <tr>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-left">Product</th>
            <th className="hidden sm:table-cell px-4 py-3 border-b dark:border-gray-700 text-left">Week</th>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-right">Total</th>
            <th className="hidden md:table-cell px-4 py-3 border-b dark:border-gray-700 text-left">Status</th>
            <th className="px-3 sm:px-4 py-3 border-b dark:border-gray-700 text-right">Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {data.map((row) => (
            <tr key={row.product_id} className="even:bg-gray-50/50 dark:even:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <td className="px-3 sm:px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[120px] sm:max-w-none truncate">
                {row.title}
                <div className="sm:hidden text-[10px] text-gray-400">{row.target_report_week_start}</div>
              </td>
              <td className="hidden sm:table-cell px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                {row.target_report_week_start}
              </td>
              <td className="px-3 sm:px-4 py-3 text-right font-bold text-gray-900 dark:text-white font-mono">
                {row.reporting_quantity}
              </td>
              <td className="hidden md:table-cell px-4 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border-0 ${
                  row.already_reported ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                }`}>
                  {row.already_reported ? "Done" : "Pending"}
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