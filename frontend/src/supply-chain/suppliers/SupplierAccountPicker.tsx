// SupplierAccountPicker.tsx
// Shared supplier search + account resolution component.
//
// Used in:
//   - POBuilder (Step 1 — header form)
//   - ReceivingEntryFlow (Step 2 — ad hoc supplier identification)
//
// Behaviour:
//   1. Debounced search over active supplier parties
//   2. On select: fetch full SupplierDetail → filter active accounts
//   3. If the party has no active accounts, walk up to the parent party
//      (e.g. Ten Speed Press → Penguin Random House)
//   4. Show the resolved effective account label, account number, and
//      ordering method so staff can confirm before proceeding
//   5. onChange fires with { party, accounts } — the effective account is
//      derived externally by resolveAccountForLocation so callers can
//      recompute it when the destination location changes
//
// resolveAccountForLocation is exported separately so POBuilder and
// ReceivingEntryFlow can both derive the effective account consistently.

import { useEffect, useRef, useState } from 'react'
import { fetchSuppliers, fetchSupplierDetail } from '../../api/supplyChainApi'
import { SupplierAccount, SupplierParty } from './supplierTypes'

// ---------------------------------------------------------------------------
// Account resolution
//
// Given the active accounts for a party and the chosen destination location,
// return the best account:
//   0. If the PO is B2B: the party's B2B account, regardless of destination.
//      (Falls through to normal resolution when the party has no B2B account —
//      the caller prompts to create one on the fly.)
//   1. One whose location_id matches the destination, else
//   2. The primary account, else
//   3. The first active account.
//
// isB2b overrides location because a B2B order always uses the single B2B
// account. It's orthogonal to drop-ship: a B2B order ships drop-ship-style to
// the third-party business, but a drop-ship isn't necessarily B2B.
// ---------------------------------------------------------------------------

export function resolveAccountForLocation(
  accounts: SupplierAccount[],
  locationId: string | null,
  isB2b: boolean = false,
): SupplierAccount | null {
  if (!accounts || accounts.length === 0) return null
  if (isB2b) {
    const b2b = accounts.find(a => a.is_b2b)
    if (b2b) return b2b
    // No B2B account for this party — fall through so the caller can detect the
    // gap (effective account resolves normally) and prompt to add one.
  }
  if (locationId) {
    const match = accounts.find(a => a.location_id === locationId)
    if (match) return match
  }
  return accounts.find(a => a.is_primary) ?? accounts[0]
}

// ---------------------------------------------------------------------------
// Field primitives (local — caller's codebase may have its own)
// ---------------------------------------------------------------------------

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
    {children}{required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
)

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 ${props.className ?? ''}`}
  />
)

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SupplierAccountPickerProps {
  /** Current selection. null means nothing chosen yet. */
  value: { party: SupplierParty; accounts: SupplierAccount[] } | null
  /** The effective account derived from value.accounts + destination location.
   *  Passed in so the picker can display it without owning location state. */
  effectiveAccount: SupplierAccount | null
  onChange: (val: { party: SupplierParty; accounts: SupplierAccount[] } | null) => void
  /** Label shown above the input. Defaults to "Supplier". */
  label?: string
  /** Placeholder for the search input. */
  placeholder?: string
  /** Whether to show the "required" asterisk. Defaults to true. */
  required?: boolean
  /** Auto-focus the search input on mount. Defaults to false. */
  autoFocus?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SupplierAccountPicker({
  value,
  effectiveAccount,
  onChange,
  label = 'Supplier',
  placeholder = 'Search active suppliers…',
  required = true,
  autoFocus = false,
}: SupplierAccountPickerProps) {
  const [search, setSearch]               = useState('')
  const [results, setResults]             = useState<SupplierParty[]>([])
  const [open, setOpen]                   = useState(false)
  const [loadingAccounts, setLoading]     = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced search
  useEffect(() => {
    if (search.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      fetchSuppliers({ search, activeOnly: true })
        .then(r => setResults(r.slice(0, 8)))
        .catch(() => {})
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  const selectParty = async (party: SupplierParty) => {
    setLoading(true)
    setOpen(false)
    try {
      const detail = await fetchSupplierDetail(party.id)
      let accounts = detail.accounts.filter(a => a.is_active)
      let orderingParty = party

      // Walk up to parent if this party has no active accounts
      // (e.g. Ten Speed Press → Penguin Random House)
      if (accounts.length === 0 && detail.party.parent_id) {
        const parentDetail = await fetchSupplierDetail(detail.party.parent_id)
        accounts = parentDetail.accounts.filter(a => a.is_active)
        orderingParty = parentDetail.party
      }

      if (accounts.length > 0) {
        onChange({ party: orderingParty, accounts })
        setSearch(orderingParty.name)
      }
    } catch {
      // ignore — leave selection as-is
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    onChange(null)
    setSearch('')
    setResults([])
  }

  return (
    <div ref={ref} className="relative">
      <Label required={required}>{label}</Label>
      <Input
        value={value ? value.party.name : search}
        onChange={e => {
          setSearch(e.target.value)
          onChange(null)
          setOpen(true)
        }}
        onFocus={() => { if (!value) setOpen(true) }}
        placeholder={placeholder}
        disabled={loadingAccounts}
        autoFocus={autoFocus}
      />

      {loadingAccounts && (
        <p className="text-xs text-gray-400 mt-1 animate-pulse">Loading accounts…</p>
      )}

      {/* Effective account confirmation card */}
      {value && effectiveAccount && (
        <div className="mt-1.5 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-semibold text-blue-800 dark:text-blue-200">
                {effectiveAccount.label}
              </span>
              {effectiveAccount.account_number && (
                <span className="text-blue-600 dark:text-blue-300 ml-2">
                  #{effectiveAccount.account_number}
                </span>
              )}
              {effectiveAccount.ordering_method && (
                <span className="text-blue-500 dark:text-blue-400 ml-2 capitalize">
                  via {effectiveAccount.ordering_method.replace('_', ' ')}
                </span>
              )}
              {value.accounts.length > 1 && (
                <span className="block mt-1 text-blue-500 dark:text-blue-400">
                  Account auto-selected for the chosen receiving location.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="text-blue-400 hover:text-red-500 shrink-0"
              aria-label="Clear supplier"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Dropdown results */}
      {open && results.length > 0 && !value && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow-xl overflow-hidden">
          {results.map(party => (
            <button
              key={party.id}
              type="button"
              onMouseDown={() => selectParty(party)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 last:border-0"
            >
              <span className="font-medium text-gray-900 dark:text-gray-100">{party.name}</span>
              {party.roles?.length > 0 && (
                <span className="text-xs text-gray-400 ml-2">{party.roles[0]}</span>
              )}
              {!party.is_active && (
                <span className="text-xs text-amber-500 ml-2">inactive</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
