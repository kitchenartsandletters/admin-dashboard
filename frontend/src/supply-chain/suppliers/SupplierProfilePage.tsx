// SupplierProfilePage.tsx
// One supplier's whole picture: GET /api/suppliers/{party_id}/profile
// (supply-chain-service docs/VENDOR_MANAGEMENT.md §4.2). Read-only, except the
// vendor-code editor (§4.4), which previews and applies code changes.
//
// Reached at /suppliers?supplier=<id> (SupplierService), from the list
// sidebar's "Full profile" button, and from links between profiles.
//
// Returns are not ordering: "Returns go to" is chain.returns_to, never the
// ordering parent. A supplier that takes no returns (Chesapeake & Hudson)
// lists nothing under "Returns come from".

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BARCODE_FINDINGS, FALLBACK_BARCODE_LABELS, errorText, fetchSupplierProfile, loadBarcodeLabels,
  type ProfileAccount, type SupplierProfile,
} from '../../api/vendorManagementApi'
import { roleLabel, ORDERING_METHOD_LABELS, type OrderingMethod } from './supplierTypes'
import VendorCodeEditor from './VendorCodeEditor'
import { ChainPanels, ProblemList, SectionTitle, count, fmtDate, fmtDateTime, n, statusLabel } from './vendorUi'

interface Props {
  partyId: string
  /** Bumped by the parent after an edit saves, to reload. */
  refreshKey?: number
  onBack: () => void
  onOpenSupplier: (partyId: string) => void
  onEdit?: () => void
  onNewPO?: () => void
}

const card = 'rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4'
const subLabel = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500'

export default function SupplierProfilePage({ partyId, refreshKey = 0, onBack, onOpenSupplier, onEdit, onNewPO }: Props) {
  const [profile, setProfile] = useState<SupplierProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [labels, setLabels] = useState<Record<string, string>>(FALLBACK_BARCODE_LABELS)
  const [editingCodes, setEditingCodes] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const reload = useCallback(() => setReloadTick(t => t + 1), [])

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    fetchSupplierProfile(partyId)
      .then(p => { if (live) setProfile(p) })
      .catch(e => { if (live) { setProfile(null); setError(errorText(e)) } })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [partyId, refreshKey, reloadTick])

  useEffect(() => {
    let live = true
    loadBarcodeLabels().then(l => { if (live) setLabels(l) })
    return () => { live = false }
  }, [])

  useEffect(() => { window.scrollTo({ top: 0 }) }, [partyId])

  const back = (
    <button type="button" onClick={onBack} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
      ← All suppliers
    </button>
  )

  if (loading && !profile) {
    return <div className="p-4 sm:p-6 space-y-4">{back}<p className="text-sm text-gray-500">Loading supplier…</p></div>
  }
  if (error || !profile) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        {back}
        <div role="alert" className="px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error ?? 'Supplier not found.'}
        </div>
      </div>
    )
  }

  const { party } = profile
  const noReturns = profile.problems.find(p => p.code === 'no_return_destination')?.message ?? null

  return (
    <div className="p-4 sm:p-6 space-y-5 bg-white dark:bg-gray-950 min-h-screen">
      {back}

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className={`text-xl sm:text-2xl font-bold tracking-tight ${party.is_deprecated ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {party.name}
          </h1>
          {party.legal_name && party.legal_name !== party.name && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{party.legal_name}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={party.is_deprecated ? 'red' : party.is_active ? 'green' : 'gray'}>
              {party.is_deprecated ? 'Deprecated' : party.is_active ? 'Active' : 'Draft'}
            </Chip>
            {party.roles.map(r => <Chip key={r}>{roleLabel(r)}</Chip>)}
            {party.roles.length === 0 && <span className="text-xs text-gray-400 italic">No roles</span>}
            <Chip tone={party.is_returnable ? 'blue' : 'gray'}>
              {party.is_returnable === true ? 'Takes returns' : party.is_returnable === false ? 'Takes no returns' : 'Returns policy unknown'}
            </Chip>
            {!profile.orderable && <Chip tone="amber">Can’t be ordered from</Chip>}
          </div>
          <dl className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5 pt-1">
            {party.parent && (
              <div><dt className="inline text-gray-400">Parent (ordering): </dt>
                <dd className="inline"><PartyLink id={party.parent.party_id} name={party.parent.party_name} onOpen={onOpenSupplier} /></dd></div>
            )}
            {party.returns_parent && (
              <div><dt className="inline text-gray-400">Returns parent: </dt>
                <dd className="inline"><PartyLink id={party.returns_parent.party_id} name={party.returns_parent.party_name} onOpen={onOpenSupplier} /></dd></div>
            )}
            {party.website && (
              <div><dt className="inline text-gray-400">Website: </dt>
                <dd className="inline"><a href={party.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all">{party.website}</a></dd></div>
            )}
          </dl>
          {party.notes && (
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line max-w-2xl pt-1">{party.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onNewPO && profile.orderable && party.is_active && (
            <button type="button" onClick={onNewPO} className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
              + New PO
            </button>
          )}
          {onEdit && (
            <button type="button" onClick={onEdit} className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              Edit
            </button>
          )}
        </div>
      </header>

      {/* Problems */}
      <section aria-label="Problems">
        <ProblemList problems={profile.problems} empty="No problems found." />
      </section>

      {/* Chains */}
      <section className={card}>
        <SectionTitle>Ordering and returns</SectionTitle>
        <ChainPanels chain={profile.chain} noReturnsMessage={noReturns} onOpenSupplier={onOpenSupplier} />
      </section>

      {/* Accounts */}
      <section className={card}>
        <SectionTitle>Accounts</SectionTitle>
        {profile.accounts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No accounts.</p>
        ) : (
          <div className="space-y-3">
            {profile.accounts.map(a => <AccountRow key={a.account_id} a={a} onOpen={onOpenSupplier} />)}
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          POs: {n(profile.purchase_orders.total)} total, {n(profile.purchase_orders.open)} open
          {profile.purchase_orders.last_ordered_at && `, last ordered ${fmtDate(profile.purchase_orders.last_ordered_at)}`}.
        </p>
      </section>

      {/* Vendor codes */}
      <section className={card}>
        <SectionTitle right={!party.is_deprecated && (
          <button type="button" onClick={() => setEditingCodes(true)}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Change codes…
          </button>
        )}>Vendor codes</SectionTitle>
        <VendorCodeTable profile={profile} onOpen={onOpenSupplier} />
      </section>

      {/* Children / returns from */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className={card}>
          <SectionTitle>Ordered through this supplier</SectionTitle>
          {profile.children.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">None.</p>
          ) : (
            <ul className="divide-y dark:divide-gray-800 text-sm">
              {profile.children.map(c => (
                <li key={c.party_id} className="py-1.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <PartyLink id={c.party_id} name={c.party_name} onOpen={onOpenSupplier} />
                    {(c.is_deprecated || !c.is_active) && (
                      <span className="ml-1.5 text-[10px] text-gray-400">{c.is_deprecated ? 'deprecated' : 'draft'}</span>
                    )}
                    {c.returns_parent && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Returns parent: {c.returns_parent.party_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {c.titles > 0 ? count(c.titles, 'title') : c.has_active_account ? 'has an account' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={card}>
          <SectionTitle>Returns come from</SectionTitle>
          {profile.returns_from.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {party.is_returnable ? 'No other supplier returns here.' : 'None. This supplier doesn’t take returns.'}
            </p>
          ) : (
            <ul className="divide-y dark:divide-gray-800 text-sm">
              {profile.returns_from.map(r => (
                <li key={r.party_id} className="py-1.5">
                  <PartyLink id={r.party_id} name={r.party_name} onOpen={onOpenSupplier} />
                  {r.via && r.via.length > 0 && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400"> via {r.via.join(' → ')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Titles */}
      <section className={card}>
        <SectionTitle right={
          <Link to={`/suppliers/catalog-gaps?tab=barcodes&party=${encodeURIComponent(party.id)}`}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Barcode audit for this supplier →
          </Link>
        }>Titles ({n(profile.titles.total)})</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className={`${subLabel} mb-1`}>By Shopify status</p>
            <CountList entries={Object.entries(profile.titles.by_status).map(([k, v]) => [statusLabel(k), v])} />
          </div>
          <div>
            <p className={`${subLabel} mb-1`}>By barcode finding</p>
            <CountList entries={findingEntries(profile.titles.by_barcode_finding, labels)} />
          </div>
        </div>
      </section>

      {/* Setup requests */}
      {profile.open_setup_requests.length > 0 && (
        <section className={card}>
          <SectionTitle right={
            <Link to="/welcome?open=vendor-setup" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              Open in Needs attention →
            </Link>
          }>Vendors needing setup that point here</SectionTitle>
          <ul className="divide-y dark:divide-gray-800 text-sm">
            {profile.open_setup_requests.map(r => (
              <li key={r.id} className="py-1.5 flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{r.vendor}</p>
                  {r.suggestion_reason && <p className="text-[11px] text-gray-500 dark:text-gray-400">{r.suggestion_reason}</p>}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{count(r.active_titles, 'active title')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className={card}>
          <SectionTitle>Recent changes</SectionTitle>
          {profile.recent_changes.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">None recorded.</p>
          ) : (
            <ul className="divide-y dark:divide-gray-800 text-sm">
              {profile.recent_changes.map((c, i) => (
                <li key={`${c.changed_at}-${i}`} className="py-1.5">
                  <p className="text-gray-900 dark:text-gray-100">
                    <span className="font-medium">{changeLabel(c.change_type)}</span>
                    {changeDetail(c.old_value, c.new_value)}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {fmtDateTime(c.changed_at)}{c.changed_by && ` · ${c.changed_by}`}{c.reason && ` · ${c.reason}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={card}>
          <SectionTitle>Recent title moves</SectionTitle>
          {profile.recent_moves.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">None.</p>
          ) : (
            <ul className="divide-y dark:divide-gray-800 text-sm">
              {profile.recent_moves.map((m, i) => (
                <li key={`${m.moved_at}-${m.inventory_item_id ?? i}`} className="py-1.5">
                  <p className="text-gray-900 dark:text-gray-100">
                    <DirectionTag d={m.direction} />
                    {m.title ?? m.isbn ?? 'Untitled item'}
                    {m.isbn && m.title && <span className="font-mono text-[11px] text-gray-400 ml-1.5">{m.isbn}</span>}
                    {!m.applied && <span className="ml-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">held, not applied</span>}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {m.from_party ?? m.from_account ?? '—'} → {m.to_party ?? m.to_account ?? '—'}
                    {m.old_vendor !== m.new_vendor && m.new_vendor && ` · vendor ${m.old_vendor ?? '—'} → ${m.new_vendor}`}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    {fmtDateTime(m.moved_at)}{sourceLabel(m.source) && ` · ${sourceLabel(m.source)}`}
                    {(m.asserted_staff_name ?? m.asserted_actor_email) && ` · ${m.asserted_staff_name ?? m.asserted_actor_email}`}
                    {m.reason && ` · ${m.reason}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {editingCodes && (
        <VendorCodeEditor
          partyId={party.id}
          partyName={party.name}
          codes={profile.vendor_codes}
          onClose={() => setEditingCodes(false)}
          onApplied={reload}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Chip({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'red' | 'blue' | 'amber' }) {
  const t = {
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  }[tone]
  return <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${t}`}>{children}</span>
}

function PartyLink({ id, name, onOpen }: { id: string; name: string; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(id)} className="text-blue-600 dark:text-blue-400 hover:underline text-left">
      {name}
    </button>
  )
}

/** Worst first (§4.6), then any finding this build doesn't know, by the audit's labels. */
function findingEntries(by: Record<string, number>, labels: Record<string, string>): [string, number][] {
  const known = BARCODE_FINDINGS as string[]
  const keys = [...known, ...Object.keys(by).filter(k => !known.includes(k))]
  return keys
    .filter(k => (by[k] ?? 0) > 0)
    .map(k => [labels[k] ?? k.replace(/_/g, ' '), by[k]] as [string, number])
}

function CountList({ entries }: { entries: [string, number][] }) {
  if (entries.length === 0) return <p className="text-sm text-gray-500 dark:text-gray-400">None.</p>
  return (
    <ul className="text-sm space-y-0.5">
      {entries.map(([label, v]) => (
        <li key={label} className="flex justify-between gap-3">
          <span className="text-gray-700 dark:text-gray-300">{label}</span>
          <span className="tabular-nums text-gray-900 dark:text-gray-100">{n(v)}</span>
        </li>
      ))}
    </ul>
  )
}

function AccountRow({ a, onOpen }: { a: ProfileAccount; onOpen: (id: string) => void }) {
  const method = a.ordering_method
    ? (ORDERING_METHOD_LABELS as Record<string, string>)[a.ordering_method as OrderingMethod] ?? a.ordering_method
    : null
  return (
    <div className={`rounded-md border px-3 py-2.5 ${a.is_active ? 'border-gray-200 dark:border-gray-800' : 'border-dashed border-gray-300 dark:border-gray-700 opacity-75'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{a.label}</p>
        {a.account_number && <span className="font-mono text-xs text-gray-500 dark:text-gray-400">#{a.account_number}</span>}
        {a.is_primary && <Chip tone="blue">Primary</Chip>}
        <Chip tone={a.is_active ? 'green' : 'gray'}>{a.is_active ? 'Active' : 'Inactive'}</Chip>
        {a.is_wholesaler && <Chip>Wholesaler</Chip>}
        {a.is_b2b && <Chip>B2B</Chip>}
      </div>
      <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 flex flex-wrap gap-x-4 gap-y-0.5">
        {method && <span>Order by {method.toLowerCase()}</span>}
        {a.ordering_email && <a href={`mailto:${a.ordering_email}`} className="text-blue-600 dark:text-blue-400 hover:underline break-all">{a.ordering_email}</a>}
        {a.ordering_url && <a href={a.ordering_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all">{a.ordering_url}</a>}
        <span>{count(a.titles, 'title')}</span>
        <span>
          POs {n(a.purchase_orders.total)} / {n(a.purchase_orders.open)} open
          {a.purchase_orders.last_ordered_at && ` / last ${fmtDate(a.purchase_orders.last_ordered_at)}`}
        </span>
      </div>
      {a.shared_with.length > 0 && (
        <p className="mt-1.5 text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1">
          Account #{a.account_number} is also used by:{' '}
          {a.shared_with.map((s, i) => (
            <span key={s.account_id}>
              {i > 0 && ', '}
              <button type="button" onClick={() => onOpen(s.party_id)} className="underline decoration-dotted hover:decoration-solid">{s.party_name}</button>
              {!s.is_active && ' (inactive)'}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

function VendorCodeTable({ profile, onOpen }: { profile: SupplierProfile; onOpen: (id: string) => void }) {
  if (profile.vendor_codes.length === 0) return <p className="text-sm text-gray-500 dark:text-gray-400">None.</p>
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="min-w-full text-sm">
        <thead className="text-left text-[11px] text-gray-500 dark:text-gray-400">
          <tr>
            <th className="px-1 py-1 font-semibold">Code</th>
            <th className="px-1 py-1 font-semibold text-right">Titles here</th>
            <th className="px-1 py-1 font-semibold">Titles elsewhere</th>
            <th className="px-1 py-1 font-semibold">Orders go to</th>
          </tr>
        </thead>
        <tbody className="divide-y dark:divide-gray-800">
          {profile.vendor_codes.map(c => (
            <tr key={c.vendor_key} className="align-top">
              <td className="px-1 py-1.5">
                <span className={c.is_name ? 'text-gray-900 dark:text-gray-100' : 'font-mono font-semibold text-gray-900 dark:text-gray-100'}>{c.code}</span>
                {c.is_name && <span className="block text-[10px] text-gray-400">supplier’s name</span>}
              </td>
              <td className="px-1 py-1.5 text-right tabular-nums">{n(c.titles_here)}</td>
              <td className="px-1 py-1.5 text-xs text-gray-600 dark:text-gray-300">
                {c.titles_elsewhere.length === 0 ? '—' : c.titles_elsewhere.map((e, i) => (
                  <span key={e.party_id}>
                    {i > 0 && ', '}
                    <button type="button" onClick={() => onOpen(e.party_id)} className="hover:underline">{e.party_name}</button> ({n(e.titles)})
                  </span>
                ))}
              </td>
              <td className="px-1 py-1.5 text-xs">
                {c.wins ? (
                  <span className="font-semibold text-green-700 dark:text-green-400">Wins</span>
                ) : c.resolves_to ? (
                  <span className="text-gray-700 dark:text-gray-300">
                    Goes to <button type="button" onClick={() => onOpen(c.resolves_to!.party_id)} className="text-blue-600 dark:text-blue-400 hover:underline">{c.resolves_to.party_name}</button>
                    {c.won_by_parent && <span className="text-gray-400"> (via parent)</span>}
                  </span>
                ) : (
                  <span className="text-gray-400">Nobody</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DirectionTag({ d }: { d: 'in' | 'out' | 'within' }) {
  const s = {
    in: { t: 'In', c: 'text-green-700 dark:text-green-400' },
    out: { t: 'Out', c: 'text-red-600 dark:text-red-400' },
    within: { t: 'Within', c: 'text-gray-500 dark:text-gray-400' },
  }[d] ?? { t: d, c: 'text-gray-500' }
  return <span className={`text-[10px] font-bold uppercase mr-1.5 ${s.c}`}>{s.t}</span>
}

const CHANGE_LABELS: Record<string, string> = {
  code_added: 'Code added',
  code_removed: 'Code removed',
  name_changed: 'Renamed',
  parent_changed: 'Parent changed',
  deprecated: 'Deprecated',
  relationship_changed: 'Relationship changed',
  notes_changed: 'Notes changed',
}

function changeLabel(t: string): string {
  if (CHANGE_LABELS[t]) return CHANGE_LABELS[t]
  const s = t.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function short(v: unknown): string | null {
  if (v == null || v === '') return null
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'none'
  if (typeof v === 'object') return null
  return String(v)
}

function changeDetail(oldV: unknown, newV: unknown): string {
  const o = short(oldV)
  const nv = short(newV)
  if (o == null && nv == null) return ''
  return `: ${o ?? '—'} → ${nv ?? '—'}`
}

const SOURCE_LABELS: Record<string, string> = {
  codes_apply: 'vendor-code change',
  product_vendor_edit: 'vendor edited in the dashboard',
  'sync:vendor_changed': 'vendor changed in Shopify',
}

function sourceLabel(s: string | null): string | null {
  if (!s) return null
  return SOURCE_LABELS[s] ?? s.replace(/[_:]/g, ' ')
}
