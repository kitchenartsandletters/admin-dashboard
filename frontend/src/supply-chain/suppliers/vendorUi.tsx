// vendorUi.tsx
// Display pieces shared by the supplier profile, the vendor-code editor and the
// Catalog Gaps product lookup (supply-chain-service docs/VENDOR_MANAGEMENT.md).
//
// Rules these enforce:
//   - Problems / warnings / blockers: show `message` as written, colour by
//     severity, keep the backend's order. `code` is never display text.
//   - "Orders through" is chain.ordering; "Returns go to" is chain.returns_to.
//     Returns are never inferred from the ordering parent.

import type { ReactNode } from 'react'
import type { Chain, Notice, Problem, Severity } from '../../api/vendorManagementApi'

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

const SEVERITY_STYLE: Record<Severity, { box: string; dot: string; label: string }> = {
  blocker: {
    box: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200',
    dot: 'bg-red-500',
    label: 'Blocker',
  },
  warning: {
    box: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200',
    dot: 'bg-amber-500',
    label: 'Warning',
  },
  info: {
    box: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200',
    dot: 'bg-blue-400',
    label: 'Note',
  },
}

function styleFor(s: string) {
  return SEVERITY_STYLE[(s as Severity)] ?? SEVERITY_STYLE.info
}

/** Problems in the order the backend sent them, each coloured by severity. */
export function ProblemList({ problems, empty }: { problems: Problem[]; empty?: ReactNode }) {
  if (problems.length === 0) {
    return empty ? <p className="text-sm text-gray-500 dark:text-gray-400">{empty}</p> : null
  }
  return (
    <ul className="space-y-1.5">
      {problems.map((p, i) => {
        const st = styleFor(p.severity)
        return (
          <li key={`${p.code}-${i}`} className={`flex items-start gap-2 px-3 py-2 rounded-md border text-sm ${st.box}`}>
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${st.dot}`} aria-hidden="true" />
            <span className="sr-only">{st.label}: </span>
            <span className="min-w-0">{p.message}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Conflicts, warnings or blockers from a code-change preview, in one colour. */
export function NoticeList({ notices, severity }: { notices: Notice[]; severity: Severity }) {
  return <ProblemList problems={notices.map(n => ({ ...n, severity }))} />
}

// ---------------------------------------------------------------------------
// Chains
// ---------------------------------------------------------------------------

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{children}</h2>
      {right}
    </div>
  )
}

/**
 * "Orders through" and "Returns go to", side by side.
 * `noReturnsMessage` is the no_return_destination problem's message when
 * returns_to is null, so the wording stays the backend's.
 */
export function ChainPanels({
  chain, noReturnsMessage, onOpenSupplier,
}: {
  chain: Chain
  noReturnsMessage?: string | null
  onOpenSupplier?: (partyId: string) => void
}) {
  const r = chain.returns_to
  const name = (id: string, label: string) => onOpenSupplier
    ? <button type="button" onClick={() => onOpenSupplier(id)} className="text-blue-600 dark:text-blue-400 hover:underline">{label}</button>
    : <span>{label}</span>

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="px-3 py-3 rounded-md border border-gray-200 dark:border-gray-800">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Orders through</p>
        {chain.ordering.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">—</p>
        ) : (
          <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
            {chain.ordering.map((n, i) => (
              <span key={n.party_id}>
                {i > 0 && <span className="text-gray-400 mx-1" aria-hidden="true">→</span>}
                {name(n.party_id, n.party_name)}
              </span>
            ))}
          </p>
        )}
        {chain.ordering.length > 1 && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            POs go to {chain.ordering[chain.ordering.length - 1].party_name}.
          </p>
        )}
      </div>

      <div className="px-3 py-3 rounded-md border border-gray-200 dark:border-gray-800">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Returns go to</p>
        {r ? (
          <>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{name(r.party_id, r.party_name)}</p>
            {r.path.length > 1 && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{r.path.join(' → ')}</p>
            )}
            {r.address ? (
              <div className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 whitespace-pre-line">
                {r.address.label && <p className="font-medium">{r.address.label}</p>}
                {r.address.recipient_name && <p>{r.address.recipient_name}</p>}
                {r.address.address && <p>{r.address.address}</p>}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">No return address on file.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {noReturnsMessage ?? 'Nothing up the returns chain takes returns.'}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function n(v: number): string {
  return v.toLocaleString()
}

/** "1 title" / "3 titles". */
export function count(v: number, one: string, many = `${one}s`): string {
  return `${v.toLocaleString()} ${v === 1 ? one : many}`
}

/** Shopify product status as staff see it in Shopify. */
export function statusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  const k = s.toLowerCase()
  if (k === 'active') return 'Active'
  if (k === 'draft') return 'Draft'
  if (k === 'archived') return 'Archived'
  if (k === 'unseen') return 'Not yet seen by a sync'
  return s
}
