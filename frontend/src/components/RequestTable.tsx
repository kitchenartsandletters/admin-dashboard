import React from 'react';
import { InterestEntry, StatusPhase, STATUS_ORDER } from '../types'; // Adjust the import path as necessary

interface RequestTableProps {
  filteredData: InterestEntry[];
  handleSort: (key: keyof InterestEntry) => void;
  renderSortIcon: (key: keyof InterestEntry) => string;
  sortConfig: { key: keyof InterestEntry; direction: 'asc' | 'desc' } | null;
  decodeHTMLEntities: (str: string) => string;
  onStatusChange: (id: string, newStatus: StatusPhase) => void;
}

const statuses = STATUS_ORDER;

const RequestTable: React.FC<RequestTableProps> = ({
  filteredData,
  handleSort,
  renderSortIcon,
  sortConfig,
  decodeHTMLEntities,
  onStatusChange
}) => {
  const statuses = [
    "New",
    "In Progress",
    "Request Filed",
    "Complete"
  ];

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700 text-sm">
        <thead className="bg-gray-100 dark:bg-gray-800">
          <tr>
            <th
              onClick={() => handleSort('cr_id')}
              className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                sortConfig?.key === 'cr_id' ? 'text-green-600 dark:text-green-400' : ''
              }`}
            >
              ID {renderSortIcon('cr_id')}
            </th>
            <th
              onClick={() => handleSort('product_title')}
              className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                sortConfig?.key === 'product_title' ? 'text-green-600 dark:text-green-400' : ''
              }`}
            >
              Product Title {renderSortIcon('product_title')}
            </th>
            <th className="border px-4 py-2 dark:border-gray-700 text-left">ISBN</th>
            <th
              onClick={() => handleSort('email')}
              className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                sortConfig?.key === 'email' ? 'text-green-600 dark:text-green-400' : ''
              }`}
            >
              Email {renderSortIcon('email')}
            </th>
            <th
              onClick={() => handleSort('customer_name')}
              className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                sortConfig?.key === 'customer_name' ? 'text-green-600 dark:text-green-400' : ''
              }`}
            >
                Name {renderSortIcon('customer_name')}
              </th>
            <th
              onClick={() => handleSort('created_at')}
              className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                sortConfig?.key === 'created_at' ? 'text-green-600 dark:text-green-400' : ''
              }`}
            >
              Submitted {renderSortIcon('created_at')}
            </th>
            {/* Status column */}
            <th
              onClick={() => handleSort('status')}
              className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                sortConfig?.key === 'status' ? 'text-green-600 dark:text-green-400' : ''
              }`}
            >
              Status {renderSortIcon('status')}
            </th>

            <th className="border px-4 py-2 dark:border-gray-700 text-left print-hidden">Link</th>
          </tr>
        </thead>
        <tbody>
          {filteredData.map((entry, index) => (
            <tr key={index} className="even:bg-gray-50 dark:even:bg-gray-700">
              <td className="border px-4 py-2 dark:border-gray-700">{entry.cr_id || 'CRN/A'}</td>
              <td className="border px-4 py-2 dark:border-gray-700">{decodeHTMLEntities(entry.product_title)}</td>
              <td className="border px-4 py-2 dark:border-gray-700">{entry.isbn}</td>
              <td className="border px-4 py-2 dark:border-gray-700">{entry.email}</td>
              <td className="border px-4 py-2 dark:border-gray-700">{entry.customer_name?.trim() || '—'}</td>
              <td className="border px-4 py-2 dark:border-gray-700">{new Date(entry.created_at).toLocaleString()}</td>
                            {/* New Status dropdown */}
              <td className="border px-4 py-2 dark:border-gray-700">
                <select
                  value={entry.status || "New"}
                  onChange={(e) => onStatusChange(entry.id || "", e.target.value as StatusPhase)}
                  className="
                    border border-gray-300 rounded px-2 py-1
                    bg-white text-gray-900
                    dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                  "
                >
                  {statuses.map(status => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </td>
              <td className="border px-4 py-2 dark:border-gray-700 print-hidden">
                <a
                  href={`https://admin.shopify.com/store/castironbooks/products/${entry.product_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RequestTable;