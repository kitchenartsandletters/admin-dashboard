// SupplierService.tsx
// Supplier index page. Follows the PreorderService shell pattern:
// filter bar → table → right-side detail sidebar + form modal.
import { useEffect, useState, useMemo, useCallback } from 'react'
import SupplierTable from './SupplierTable'
import SupplierDetailSidebar from './SupplierDetailSidebar'
import SupplierForm from './SupplierForm'
import { SupplierParty, SupplierDetail, SupplierRole, SUPPLIER_ROLE_LABELS } from './supplierTypes'
import { fetchSuppliers, fetchSupplierDetail } from '../../api/supplyChainApi'
import { SortConfig, sortTitle, nextSortDirection } from '../../utils/tableUtils'

type RoleFilter = SupplierRole | 'all' | 'draft'

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'draft',       label: 'Drafts' },
  { key: 'distributor', label: 'Distributors' },
  { key: 'wholesaler',  label: 'Wholesalers' },
  { key: 'publisher',   label: 'Publishers' },
  { key: 'small_press', label: 'Small Press' },
  { key: 'direct',      label: 'Direct' },
  { key: 'author',      label: 'Authors' },
  { key: 'restaurant',  label: 'Restaurants' },
]

function TableSkeleton() {
  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {['w-48', 'w-32', 'w-24', 'w-16', 'w-16'].map((w, i) => (
              <th key={i} className="px-4 py-3 border-b dark:border-gray-700">
                <div className={`h-3 ${w} bg-gray-200 dark:bg-gray-700 rounded animate-pulse`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({ length: 10 }).map((_, i) => (
            <tr key={i}>
              <td className="px-4 py-3">
                <div className="h-3 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1.5" />
                <div className="h-2 w-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              </td>
              <td className="px-4 py-3"><div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" /></td>
              <td className="px-4 py-3"><div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
              <td className="px-4 py-3"><div className="h-3 w-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
              <td className="px-4 py-3"><div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SupplierService() {
  const [allSuppliers, setAllSuppliers] = useState<SupplierParty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [sortConfig, setSortConfig] = useState<SortConfig<SupplierParty> | null>({
    key: 'name', direction: 'asc',
  })

  const [selectedParty, setSelectedParty] = useState<SupplierParty | null>(null)
  const [detail, setDetail] = useState<SupplierDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSuppliers({ activeOnly: false })
      setAllSuppliers(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selectedParty) { setDetail(null); return }
    setDetailLoading(true)
    fetchSupplierDetail(selectedParty.id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))
  }, [selectedParty])

  const filtered = useMemo(() => {
    let list = allSuppliers
    if (roleFilter === 'draft') {
      list = list.filter(p => !p.is_active)
    } else if (roleFilter !== 'all') {
      list = list.filter(p => p.roles.includes(roleFilter as SupplierRole))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.legal_name ?? '').toLowerCase().includes(q) ||
        p.roles.some(r => SUPPLIER_ROLE_LABELS[r].toLowerCase().includes(q))
      )
    }
    if (sortConfig) {
      list = [...list].sort((a, b) => {
        const ak = sortConfig.key
        let av = a[ak] as unknown
        let bv = b[ak] as unknown
        if (ak === 'name') { av = sortTitle(a.name); bv = sortTitle(b.name) }
        if (av == null) return 1
        if (bv == null) return -1
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortConfig.direction === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [allSuppliers, roleFilter, search, sortConfig])

  const handleSort = (key: keyof SupplierParty) => {
    setSortConfig(prev => ({ key, direction: nextSortDirection(prev, key) }))
  }

  const handleFormSaved = async (partyId: string) => {
    await load()
    try {
      const refreshed = await fetchSupplierDetail(partyId)
      setDetail(refreshed)
      setSelectedParty(refreshed.party)
    } catch {
      // detail refresh is best-effort
    }
    setFormMode(null)
  }

  const activeCount = allSuppliers.filter(p => p.is_active).length
  const draftCount  = allSuppliers.filter(p => !p.is_active).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Suppliers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {loading ? 'Loading…' : `${activeCount} active · ${draftCount} drafts`}
          </p>
        </div>
        <button
          onClick={() => { setSelectedParty(null); setFormMode('create') }}
          className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors active:scale-[0.98]"
        >
          + New supplier
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <input
          type="text"
          placeholder="Search by name, role…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none flex-1"
        />
        <div className="flex gap-1 flex-wrap">
          {ROLE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setRoleFilter(f.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors whitespace-nowrap
                ${roleFilter === f.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-600">
          {filtered.length} supplier{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {loading ? <TableSkeleton /> : (
        <SupplierTable
          suppliers={filtered}
          sortConfig={sortConfig}
          onSort={handleSort}
          onRowClick={party => setSelectedParty(prev => prev?.id === party.id ? null : party)}
          selectedId={selectedParty?.id ?? null}
        />
      )}

      <SupplierDetailSidebar
        detail={detailLoading ? null : detail}
        onClose={() => setSelectedParty(null)}
        onEdit={() => setFormMode('edit')}
      />

      {formMode === 'create' && (
        <SupplierForm
          mode="create"
          onClose={() => setFormMode(null)}
          onSaved={handleFormSaved}
        />
      )}

      {formMode === 'edit' && detail && (
        <SupplierForm
          mode="edit"
          party={detail.party}
          primaryAccount={detail.accounts.find(a => a.is_primary) ?? detail.accounts[0]}
          primaryContact={detail.contacts.find(c => c.is_primary) ?? detail.contacts[0]}
          onClose={() => setFormMode(null)}
          onSaved={handleFormSaved}
        />
      )}
    </div>
  )
}
