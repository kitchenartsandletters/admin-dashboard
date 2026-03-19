import { useState } from "react";
import { CampaignResponseRow } from "../../types/campaign";

type SortKey =
  | "created_at"
  | "recorded_at"
  | "email"
  | "response"
  | "order_id"
  | "order_name"
  | "product_title";

type SortDirection = "asc" | "desc";

export default function CampaignTable({
  rows,
}: {
  rows: CampaignResponseRow[];
}) {
  const [sortKey, setSortKey] =
    useState<SortKey>("created_at");
  const [sortDir, setSortDir] =
    useState<SortDirection>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const aVal = (a as any)[sortKey] ?? "";
    const bVal = (b as any)[sortKey] ?? "";

    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function SortHeader({
    label,
    field,
  }: {
    label: string;
    field: SortKey;
  }) {
    const active = sortKey === field;

    return (
      <th
        onClick={() => handleSort(field)}
        className="cursor-pointer px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"
      >
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </th>
    );
  }

  function responseColor(r: string | null) {
    if (r === "keep_order") return "bg-green-100 text-green-800";
    if (r === "unsigned_copy")
      return "bg-yellow-100 text-yellow-800";
    if (r === "cancel_order") return "bg-red-100 text-red-800";
    return "bg-gray-100 text-gray-600";
  }

  if (rows.length === 0) {
    return (
      <div className="p-6 text-sm text-gray-500">
        No responses found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <SortHeader label="Email" field="email" />
            <SortHeader label="Response" field="response" />
            <SortHeader label="Order" field="order_name" />
            <SortHeader label="Timestamp" field="created_at" />
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="px-3 py-2">{row.email}</td>

              <td className="px-3 py-2">
                <span
                  className={`px-2 py-1 rounded text-xs ${responseColor(
                    row.response
                  )}`}
                >
                  {row.response ?? "—"}
                </span>
              </td>

              <td className="px-3 py-2">
                {row.order_id ? (
                  <a
                    href={`https://admin.shopify.com/store/castironbooks/orders/${row.order_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {row.order_name}
                  </a>
                ) : (
                  "—"
                )}
              </td>

              <td className="px-3 py-2 text-gray-500">
                {new Date(row.recorded_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}