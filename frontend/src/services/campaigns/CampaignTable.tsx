import { useState } from "react";
import { CampaignResponseRow } from "../../types/campaign";

type SortKey = "created_at" | "recorded_at" | "email" | "response" | "order_name";
type SortDirection = "asc" | "desc";

export default function CampaignTable({ rows }: { rows: CampaignResponseRow[] }) {
  console.log("CampaignTable rows prop:", rows);
  const [sortKey, setSortKey] = useState<SortKey>("recorded_at");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = rows || [];

  const getResponseStyle = (resp: string | null) => {
    const base = "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter";
    if (resp === "keep_order") return `${base} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`;
    if (resp === "unsigned_copy") return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300`;
    if (resp === "cancel_order") return `${base} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300`;
    return `${base} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400`;
  };

  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider font-semibold">
          <tr>
            <th onClick={() => handleSort("email")} className="px-4 py-3 border-b dark:border-gray-700 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              Customer {sortKey === "email" && (sortDir === "asc" ? "↑" : "↓")}
            </th>
            <th onClick={() => handleSort("response")} className="px-4 py-3 border-b dark:border-gray-700 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              Response
            </th>
            <th onClick={() => handleSort("order_name")} className="hidden sm:table-cell px-4 py-3 border-b dark:border-gray-700 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              Order
            </th>
            <th onClick={() => handleSort("recorded_at")} className="hidden md:table-cell px-4 py-3 border-b dark:border-gray-700 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              Timestamp
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {sorted.map((row) => {
            console.log("ROW:", row);
            if (!row) return null;
            return (
            <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[140px] sm:max-w-xs truncate">
                {row.email}
              </td>
              <td className="px-4 py-3">
                <span className={getResponseStyle(row.response)}>
                  {row.response?.replace("_", " ") ?? "None"}
                </span>
              </td>
              <td className="hidden sm:table-cell px-4 py-3 font-mono text-xs">
                {row.order_name ? (
                  <a
                    href={`https://admin.shopify.com/store/castironbooks/orders/${row.order_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {row.order_name}
                  </a>
                ) : "—"}
              </td>
              <td className="hidden md:table-cell px-4 py-3 text-gray-500 text-xs">
                {String(row.recorded_at)}
              </td>
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
  );
}