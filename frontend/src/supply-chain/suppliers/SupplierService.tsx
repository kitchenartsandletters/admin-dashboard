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

  // Count helper functions for dynamic badges
    const filterCounts = useMemo(() => {
      const counts: Record<RoleFilter, number> = {
        all: allSuppliers.length,
        active: allSuppliers.filter(p => p.is_active).length,
        draft: allSuppliers.filter(p => !p.is_active).length,
        distributor: allSuppliers.filter(p => p.roles.includes('distributor')).length,
        wholesaler: allSuppliers.filter(p => p.roles.includes('wholesaler')).length,
        publisher: allSuppliers.filter(p => p.roles.includes('publisher')).length,
        small_press: allSuppliers.filter(p => p.roles.includes('small_press')).length,
        direct: allSuppliers.filter(p => p.roles.includes('direct')).length,
        author: allSuppliers.filter(p => p.roles.includes('author')).length,
        restaurant: allSuppliers.filter(p => p.roles.includes('restaurant')).length,
        other: allSuppliers.filter(p => p.roles.includes('other')).length, // <-- FIXES ts(2741)
      }
      return counts
    }, [allSuppliers])

  const handleSort = (key: keyof SupplierParty) => {
    setSortConfig(prev => ({ key, direction: nextSortDirection(prev, key) }))
  }

  const handleRowClick = (party: SupplierParty) => {
    if (selectedParty?.id === party.id) {
      setPartyStack([])
    } else {
      setPartyStack([party])
    }
  }

  const handleChildClick = useCallback((child: SupplierParty) => {
    setPartyStack(prev => [...prev, child])
  }, [])

  const handleBack = useCallback(() => {
    setPartyStack(prev => prev.slice(0, -1))
  }, [])

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

  const [parentDetail, setParentDetail] = useState<SupplierDetail | null>(null)

  useEffect(() => {
    if (!detail?.party.parent_id) { setParentDetail(null); return }
    fetchSupplierDetail(detail.party.parent_id)
      .then(setParentDetail)
      .catch(() => setParentDetail(null))
  }, [detail?.party.parent_id])

  return (
    <>
      <div className="p-4 sm:p-6 space-y-6 bg-white dark:bg-gray-950 min-h-screen">
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Publishers</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {loading ? 'Loading pipeline…' : `${filterCounts.all} total profiles`}
            </p>
          </div>
          <button
            onClick={() => { setPartyStack([]); setFormMode('create') }}
            className="w-full sm:w-auto px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold transition-colors shadow-sm text-center"
          >
            + New Profile
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 text-xs sm:text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        {/* Filters and Inputs Control Strip */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border dark:border-gray-800">
          <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs scrollbar-none touch-pan-x -mx-3 px-3 sm:mx-0 sm:px-0">
            <div className="inline-flex p-0.5 bg-gray-100 dark:bg-gray-800 rounded border dark:border-gray-700">
              {ROLE_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => handleSetRoleFilter(f.key)}
                  className={`px-3 py-1.5 rounded font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    roleFilter === f.key
                      ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <span>{f.label}</span>
                  <span className={`text-[10px] tabular-nums font-bold px-1 rounded-full ${
                    roleFilter === f.key 
                      ? 'bg-blue-50 text-blue-600 dark:bg-gray-600 dark:text-blue-300' 
                      : 'bg-gray-200 dark:bg-gray-900 text-gray-400 dark:text-gray-500'
                  }`}>
                    {filterCounts[f.key]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 sm:max-w-xs relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by name, role…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 border dark:border-gray-700 rounded-md text-xs sm:text-sm bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none placeholder-gray-400 dark:placeholder-gray-500 shadow-sm"
            />
          </div>
        </div>

        {!loading && (
          <p className="text-[11px] font-medium text-gray-400 dark:text-gray-600 uppercase tracking-wider">
            Showing {filtered.length} supplier{filtered.length !== 1 ? 's' : ''}
          </p>
        )}

        {loading ? <TableSkeleton /> : (
          <div className="w-full">
            
            {/* --- MOBILE VIEW: Card Stack Layout --- */}
            <div className="block sm:hidden space-y-2.5">
              {/* Discrete Mobile Sort Controller Toolbar */}
              <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium px-0.5 pb-1 overflow-x-auto scrollbar-none">
                <span className="shrink-0 uppercase tracking-wider text-[10px]">Sort:</span>
                <button 
                  type="button" 
                  onClick={() => handleSort('name')} 
                  className={`px-2 py-0.5 rounded border dark:border-gray-800 shrink-0 ${sortConfig?.key === 'name' ? 'bg-gray-100 dark:bg-gray-800 font-bold text-gray-900 dark:text-white' : ''}`}
                >
                  Name {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </button>
              </div>

              {filtered.map(supplier => {
                const isSelected = selectedParty?.id === supplier.id
                return (
                  <div
                    key={supplier.id}
                    onClick={() => handleRowClick(supplier)}
                    className={`p-3.5 rounded-xl border transition-all text-left flex items-center justify-between gap-4 cursor-pointer shadow-sm
                      ${isSelected
                        ? 'bg-blue-50/70 border-blue-300 dark:bg-blue-950/20 dark:border-blue-800/80 ring-1 ring-blue-300 dark:ring-blue-800'
                        : 'bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800/80 active:bg-gray-50 dark:active:bg-gray-800/40'
                      }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {supplier.name}
                        </h3>
                      </div>
                      {supplier.legal_name && supplier.legal_name !== supplier.name && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{supplier.legal_name}</p>
                      )}
                      
                      {/* Active / Role Tags */}
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${supplier.is_active ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {supplier.is_active ? 'Active' : 'Draft'}
                        </span>
                        {supplier.roles.map(role => (
                          <span key={role} className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200/60 dark:bg-gray-800 dark:text-gray-400 dark:border-transparent px-1.5 py-0.2 rounded font-medium">
                            {SUPPLIER_ROLE_LABELS[role]}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="shrink-0 text-gray-400 dark:text-gray-600 text-xs pl-2">
                      {isSelected ? '▾' : '▸'}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* --- DESKTOP VIEW: Native Grid Component --- */}
            <div className="hidden sm:block">
              <SupplierTable
                suppliers={filtered}
                sortConfig={sortConfig}
                onSort={handleSort}
                onRowClick={handleRowClick}
                selectedId={selectedParty?.id ?? null}
              />
            </div>

          </div>
        )}
      </div>

      {/* Slideout Panels & Modals */}
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