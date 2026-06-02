// SupplierService.tsx
import { useEffect, useState, useMemo, useCallback } from 'react'
import SupplierTable from './SupplierTable'
import SupplierDetailSidebar from './SupplierDetailSidebar'
import SupplierForm from './SupplierForm'
import POBuilder from '../purchase-orders/POBuilder'
import { SupplierParty, SupplierDetail, SupplierRole, SUPPLIER_ROLE_LABELS } from './supplierTypes'
import { fetchSuppliers, fetchSupplierDetail } from '../../api/supplyChainApi'
import { SortConfig, sortTitle, nextSortDirection } from '../../utils/tableUtils'

type RoleFilter = SupplierRole | 'all' | 'active' | 'draft'

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'active',      label: 'Active' },
  { key: 'draft',       label: 'Drafts' },
  { key: 'distributor', label: 'Distributors' },
  { key: 'wholesaler',  label: 'Wholesalers' },
  { key: 'publisher',   label: 'Publishers' },
  { key: 'small_press', label: 'Small Press' },
  { key: 'direct',      label: 'Direct' },
  { key: 'author',      label: 'Authors' },
  { key: 'restaurant',  label: 'Restaurants' },
]

const FILTER_STORAGE_KEY = 'sc_supplier_role_filter'

function getInitialFilter(): RoleFilter {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY)
    if (stored && ROLE_FILTERS.some(f => f.key === stored)) return stored as RoleFilter
  } catch {}
  return 'active'
}

function TableSkeleton() {
  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>{['w-48','w-32','w-24','w-16','w-16'].map((w,i) => (
            <th key={i} className="px-4 py-3 border-b dark:border-gray-700">
              <div className={`h-3 ${w} bg-gray-200 dark:bg-gray-700 rounded animate-pulse`} />
            </th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({length:10}).map((_,i) => (
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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(getInitialFilter)
  const [sortConfig, setSortConfig] = useState<SortConfig<SupplierParty> | null>({
    key: 'name', direction: 'asc',
  })

  // Navigation stack
  const [partyStack, setPartyStack] = useState<SupplierParty[]>([])
  const selectedParty = partyStack[partyStack.length - 1] ?? null

  const [detail, setDetail] = useState<SupplierDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)

  // showPOBuilder is explicitly set to false when sidebar closes
  // and is NEVER set by row clicks — only by the "+ New PO" button in the sidebar header
  const [showPOBuilder, setShowPOBuilder] = useState(false)

  const handleSetRoleFilter = (f: RoleFilter) => {
    setRoleFilter(f)
    try { localStorage.setItem(FILTER_STORAGE_KEY, f) } catch {}
  }

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
      .then(d => {
        setDetail(d)
        setPartyStack(prev => {
          const next = [...prev]
          next[next.length - 1] = d.party
          return next
        })
      })
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))
  }, [selectedParty?.id])

  const filtered = useMemo(() => {
    let list = allSuppliers
    if (roleFilter === 'active') {
      list = list.filter(p => p.is_active)
    } else if (roleFilter === 'draft') {
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

  // Row click — reset stack, never open POBuilder
  const handleRowClick = (party: SupplierParty) => {
    if (selectedParty?.id === party.id) {
      setPartyStack([])
    } else {
      setPartyStack([party])
      // showPOBuilder intentionally NOT set here
    }
  }

  const handleChildClick = useCallback((child: SupplierParty) => {
    setPartyStack(prev => [...prev, child])
  }, [])

  const handleBack = useCallback(() => {
    setPartyStack(prev => prev.slice(0, -1))
  }, [])

  // Close sidebar — clear stack and close PO builder if open
  const handleClose = useCallback(() => {
    setShowPOBuilder(false)
    setPartyStack([])
  }, [])

  const handleFormSaved = async (partyId: string) => {
    await load()
    try {
      const refreshed = await fetchSupplierDetail(partyId)
      setDetail(refreshed)
      setPartyStack(prev => {
        if (prev.length === 0) return [refreshed.party]
        const next = [...prev]
        next[next.length - 1] = refreshed.party
        return next
      })
    } catch {}
    setFormMode(null)
  }

  const handleImprintLinked = useCallback(async () => {
    if (!selectedParty) return
    setDetailLoading(true)
    try {
      const refreshed = await fetchSupplierDetail(selectedParty.id)
      setDetail(refreshed)
    } catch {}
    finally { setDetailLoading(false) }
  }, [selectedParty])

  const activeCount = allSuppliers.filter(p => p.is_active).length
  const draftCount  = allSuppliers.filter(p => !p.is_active).length

     // Fetch parent detail when selected party is a child (has parent_id)
   const [parentDetail, setParentDetail] = useState<SupplierDetail | null>(null)

   useEffect(() => {
     if (!detail?.party.parent_id) { setParentDetail(null); return }
     fetchSupplierDetail(detail.party.parent_id)
       .then(setParentDetail)
       .catch(() => setParentDetail(null))
   }, [detail?.party.parent_id])

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Publishers</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {loading ? 'Loading…' : `${activeCount} active · ${draftCount} drafts`}
            </p>
          </div>
          <button
            onClick={() => { setPartyStack([]); setFormMode('create') }}
            className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors active:scale-[0.98]"
          >
            + New Party
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

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
                onClick={() => handleSetRoleFilter(f.key)}
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
            onRowClick={handleRowClick}
            selectedId={selectedParty?.id ?? null}
          />
        )}
      </div>

      {/* Sidebar, form, and PO builder outside space-y-4 */}
      <SupplierDetailSidebar
        detail={detailLoading ? null : detail}
        canGoBack={partyStack.length > 1}
        onBack={handleBack}
        onClose={handleClose}
        onEdit={() => setFormMode('edit')}
        onNewPO={() => setShowPOBuilder(true)}
        onChildClick={handleChildClick}
        onImprintLinked={handleImprintLinked}
        parentDetail={parentDetail}
        onNewParentPO={() => {
          if (parentDetail) {
            // Switch selected party to parent, then open PO builder
            setPartyStack([parentDetail.party])
            setShowPOBuilder(true)
          }
        }}
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

      {/* POBuilder:
          - Only opens via "+ New PO" in sidebar, never from row clicks
          - initialSupplier pre-fills Step 1 supplier field but stays on Step 1
            so staff can still set order date, expected arrival, notes, drop-ship flag
          - ESC inside the modal closes the modal only (modal handles its own ESC)
          - After modal closes, sidebar remains open
      */}
      {showPOBuilder && detail && (
        <POBuilder
          initialSupplier={detail}
          onClose={() => setShowPOBuilder(false)}
          onCreated={async () => { setShowPOBuilder(false) }}
        />
      )}
    </>
  )
}
