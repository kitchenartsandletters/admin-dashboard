// SupplierTable.tsx
import React from 'react'
import { SupplierParty, SUPPLIER_ROLE_LABELS, SupplierRole } from './supplierTypes'
import { SortConfig, SortIcon, nextSortDirection } from '../../utils/tableUtils'

interface Props {
  suppliers: SupplierParty[]
  sortConfig: SortConfig<SupplierParty> | null
  onSort: (key: keyof SupplierParty) => void
  onRowClick: (party: SupplierParty) => void
  selectedId: string | null
}

const ROLE_COLORS: Record<SupplierRole, string> = {
  distributor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  wholesaler:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  publisher:   'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  small_press: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  direct:      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  author:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  restaurant:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  other:       'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

function RoleBadge({ role }: { role: SupplierRole }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${ROLE_COLORS[role]}`}>
      {SUPPLIER_ROLE_LABELS[role]}
    </span>
  )
}

function Th({
  label,
  sortKey,
  sortConfig,
  onSort,
}: {
  label: string
  sortKey: keyof SupplierParty
  sortConfig: SortConfig<SupplierParty> | null
  onSort: (key: keyof SupplierParty) => void
}) {
  const active = sortConfig?.key === sortKey
  return (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      {label}
      <SortIcon active={active} direction={sortConfig?.direction ?? 'asc'} />
    </th>
  )
}

const SupplierTable: React.FC<Props> = ({
  suppliers,
  sortConfig,
  onSort,
  onRowClick,
  selectedId,
}) => {
  if (suppliers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-600">
        <p className="text-sm">No publishers found.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <Th label="Name"         sortKey="name"          sortConfig={sortConfig} onSort={onSort} />
            <Th label="Roles"        sortKey="roles"         sortConfig={sortConfig} onSort={onSort} />
            <Th label="Payment"      sortKey="payment_terms" sortConfig={sortConfig} onSort={onSort} />
            <Th label="Country"      sortKey="country"       sortConfig={sortConfig} onSort={onSort} />
            <Th label="Status"       sortKey="is_active"     sortConfig={sortConfig} onSort={onSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {suppliers.map((party) => {
            const isSelected = party.id === selectedId
            return (
              <tr
                key={party.id}
                onClick={() => onRowClick(party)}
                className={`cursor-pointer transition-colors
                  ${isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
              >
                {/* Name */}
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {party.name}
                  </div>
                  {party.legal_name && party.legal_name !== party.name && (
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {party.legal_name}
                    </div>
                  )}
                  {party.parent_id && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 italic">
                      imprint
                    </div>
                  )}
                </td>

                {/* Roles */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {party.roles.length === 0
                      ? <span className="text-xs text-gray-400 dark:text-gray-600 italic">—</span>
                      : party.roles.map(r => <RoleBadge key={r} role={r} />)
                    }
                  </div>
                </td>

                {/* Payment terms */}
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {party.payment_terms ?? '—'}
                </td>

                {/* Country */}
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {party.country ?? '—'}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  {party.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      Draft
                    </span>
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

export default SupplierTable
