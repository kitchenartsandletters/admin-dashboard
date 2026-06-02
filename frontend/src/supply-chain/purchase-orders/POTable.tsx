// POTable.tsx
import React from 'react'
import { PurchaseOrder, PO_STATUS_LABELS, PO_STATUS_COLORS } from './purchaseOrderTypes'
import { formatDate, SortConfig, SortIcon, nextSortDirection } from '../../utils/tableUtils'

interface Props {
  orders: PurchaseOrder[]
  sortConfig: SortConfig<PurchaseOrder> | null
  onSort: (key: keyof PurchaseOrder) => void
  onRowClick: (order: PurchaseOrder) => void
  selectedId: string | null
  onDeleteDraft?: (order: PurchaseOrder) => void
  deletingId?: string | null
}

function Th({
  label,
  sortKey,
  sortConfig,
  onSort,
  align = 'left',
}: {
  label: string
  sortKey: keyof PurchaseOrder
  sortConfig: SortConfig<PurchaseOrder> | null
  onSort: (key: keyof PurchaseOrder) => void
  align?: 'left' | 'right'
}) {
  const active = sortConfig?.key === sortKey
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap text-${align}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <SortIcon active={active} direction={sortConfig?.direction ?? 'asc'} />
    </th>
  )
}

// Non-sortable header for joined/computed columns
function ThStatic({ label }: { label: string }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap text-left">
      {label}
    </th>
  )
}

const POTable: React.FC<Props> = ({
  orders,
  sortConfig,
  onSort,
  onRowClick,
  selectedId,
  onDeleteDraft,
  deletingId,
}) => {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-600">
        <p className="text-sm">No purchase orders found.</p>
      </div>
    )
  }

    return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <Th label="PO Number"  sortKey="po_number"    sortConfig={sortConfig} onSort={onSort} />
            <ThStatic label="Supplier" />
            <Th label="Status"     sortKey="status"       sortConfig={sortConfig} onSort={onSort} />
            <Th label="Ordered"    sortKey="ordered_at"   sortConfig={sortConfig} onSort={onSort} />
            <Th label="Expected"   sortKey="expected_at"  sortConfig={sortConfig} onSort={onSort} />
            <Th label="Created"    sortKey="created_at"   sortConfig={sortConfig} onSort={onSort} />
            <th className="px-4 py-3 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {orders.map(order => {
            const isSelected = order.id === selectedId
            const supplierDisplay = order.supplier_name
              ?? order.account_label
              ?? order.supplier_account_id

            return (
              <tr
                key={order.id}
                onClick={() => onRowClick(order)}
                className={`group cursor-pointer transition-colors
                  ${isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
              >
                {/* PO number + ad hoc context */}
                <td className="px-4 py-3">
                  <div className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                    {order.po_number}
                  </div>
                  {order.is_ad_hoc && (
                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                      Ad hoc
                    </span>
                  )}
                  {order.is_test && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded
                                      bg-yellow-100 text-yellow-700
                                      dark:bg-yellow-900/30 dark:text-yellow-300
                                      uppercase tracking-wide">
                      Test
                    </span>
                  )}
                  {order.informal_ref && (
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                      ref: {order.informal_ref}
                    </div>
                  )}
                </td>

                {/* Supplier */}
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[160px] block">
                    {supplierDisplay}
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${PO_STATUS_COLORS[order.status]}`}>
                    {PO_STATUS_LABELS[order.status]}
                  </span>
                </td>

                {/* Ordered at */}
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                  {order.ordered_at ? formatDate(order.ordered_at) : '—'}
                </td>

                {/* Expected at */}
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                  {order.expected_at ? formatDate(order.expected_at) : '—'}
                </td>

                {/* Created at */}
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                  {formatDate(order.created_at)}
                </td>

                {/* Actions — delete button for draft POs only, visible on row hover */}
                <td className="px-2 py-3 text-right" onClick={e => e.stopPropagation()}>
                  {order.status === 'draft' && (
                    <button
                      onClick={() => onDeleteDraft?.(order)}
                      disabled={deletingId === order.id}
                      className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[10px]
                                 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all
                                 disabled:opacity-40"
                      title="Delete draft PO"
                    >
                      {deletingId === order.id ? '…' : 'Delete'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default POTable
