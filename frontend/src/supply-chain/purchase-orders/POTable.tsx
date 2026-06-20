// POTable.tsx
import React, { useState } from 'react'
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
}: {
  label: string
  sortKey: keyof PurchaseOrder
  sortConfig: SortConfig<PurchaseOrder> | null
  onSort: (key: keyof PurchaseOrder) => void
}) {
  const active = sortConfig?.key === sortKey
  return (
    <th
      className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap text-left"
      onClick={() => onSort(sortKey)}
    >
      {label}
      <SortIcon active={active} direction={sortConfig?.direction ?? 'asc'} />
    </th>
  )
}

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
    <div className="w-full">
      {/* --- MOBILE VIEW: Card List --- */}
      <div className="block md:hidden space-y-3">
        {/* Simple Mobile Sort Controls */}
        <div className="flex items-center gap-2 px-1 text-xs text-gray-500 dark:text-gray-400 overflow-x-auto pb-2 scrollbar-none">
          <span className="font-medium shrink-0">Sort:</span>
          <button 
            onClick={() => onSort("po_number")}
            className={`px-2.5 py-1 rounded-full border dark:border-gray-700 shrink-0 ${sortConfig?.key === "po_number" ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold" : ""}`}
          >
            PO # <SortIcon active={sortConfig?.key === "po_number"} direction={sortConfig?.direction ?? "asc"} />
          </button>
          <button 
            onClick={() => onSort("status")}
            className={`px-2.5 py-1 rounded-full border dark:border-gray-700 shrink-0 ${sortConfig?.key === "status" ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold" : ""}`}
          >
            Status <SortIcon active={sortConfig?.key === "status"} direction={sortConfig?.direction ?? "asc"} />
          </button>
          <button 
            onClick={() => onSort("expected_at")}
            className={`px-2.5 py-1 rounded-full border dark:border-gray-700 shrink-0 ${sortConfig?.key === "expected_at" ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold" : ""}`}
          >
            Expected <SortIcon active={sortConfig?.key === "expected_at"} direction={sortConfig?.direction ?? "asc"} />
          </button>
          <button 
            onClick={() => onSort("created_at")}
            className={`px-2.5 py-1 rounded-full border dark:border-gray-700 shrink-0 ${sortConfig?.key === "created_at" ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold" : ""}`}
          >
            Created <SortIcon active={sortConfig?.key === "created_at"} direction={sortConfig?.direction ?? "asc"} />
          </button>
        </div>

        {/* Mobile Cards */}
        {orders.map((order) => {
          const isSelected = order.id === selectedId
          const supplierDisplay = order.supplier_name ?? order.account_label ?? order.supplier_account_id

          return (
            <div
              key={order.id}
              onClick={() => onRowClick(order)}
              className={`p-4 rounded-xl border bg-white dark:bg-gray-900 shadow-sm transition-colors flex flex-col gap-3 active:bg-gray-50 dark:active:bg-gray-800/50 ${
                isSelected ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-gray-200 dark:border-gray-800'
              }`}
            >
              {/* Top Row: PO number + indicators & Delete/Details Action */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className="font-mono font-bold text-gray-900 dark:text-white text-sm">
                      {order.po_number}
                    </span>
                    {order.is_ad_hoc && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200/40 uppercase tracking-wide">
                        Ad hoc
                      </span>
                    )}
                    {order.is_test && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 uppercase tracking-wide">
                        Test
                      </span>
                    )}
                  </div>
                  {order.informal_ref && (
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                      ref: {order.informal_ref}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 self-start" onClick={(e) => e.stopPropagation()}>
                  {order.status === 'draft' && onDeleteDraft && (
                    <button
                      onClick={() => onDeleteDraft(order)}
                      disabled={deletingId === order.id}
                      className="px-2 py-1 rounded text-[10px] font-medium text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 transition-colors disabled:opacity-40"
                    >
                      {deletingId === order.id ? '…' : 'Delete'}
                    </button>
                  )}
                  <span className="text-blue-600 dark:text-blue-400 text-xs font-medium pt-0.5">
                    Details &rarr;
                  </span>
                </div>
              </div>

              {/* Middle Row: Supplier & Status */}
              <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800/60">
                <div className="min-w-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400 block text-[10px] uppercase tracking-wider font-medium">Supplier</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate block max-w-[180px]">
                    {supplierDisplay}
                  </span>
                </div>
                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold ${PO_STATUS_COLORS[order.status]}`}>
                    {PO_STATUS_LABELS[order.status]}
                  </span>
                </div>
              </div>

              {/* Bottom Row: Dates */}
              <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider font-medium">Created</span>
                  <span className="text-gray-600 dark:text-gray-300 font-mono text-[11px]">{formatDate(order.created_at)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider font-medium">Ordered</span>
                  <span className="text-gray-600 dark:text-gray-300 font-mono text-[11px]">{order.ordered_at ? formatDate(order.ordered_at) : '—'}</span>
                </div>
                <div className="text-right">
                  <span className="text-gray-400 block text-[9px] uppercase tracking-wider font-medium">Expected</span>
                  <span className="text-gray-600 dark:text-gray-300 font-mono text-[11px]">{order.expected_at ? formatDate(order.expected_at) : '—'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* --- DESKTOP VIEW: Legacy Table --- */}
      <div className="hidden md:block overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
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
              const supplierDisplay = order.supplier_name ?? order.account_label ?? order.supplier_account_id

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
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 uppercase tracking-wide">
                        Test
                      </span>
                    )}
                    {order.informal_ref && (
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                        ref: {order.informal_ref}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[160px] block">
                      {supplierDisplay}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${PO_STATUS_COLORS[order.status]}`}>
                      {PO_STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                    {order.ordered_at ? formatDate(order.ordered_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                    {order.expected_at ? formatDate(order.expected_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                    {formatDate(order.created_at)}
                  </td>
                  <td className="px-2 py-3 text-right" onClick={e => e.stopPropagation()}>
                    {order.status === 'draft' && (
                      <button
                        onClick={() => onDeleteDraft?.(order)}
                        disabled={deletingId === order.id}
                        className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-40"
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
    </div>
  )
}

export default POTable