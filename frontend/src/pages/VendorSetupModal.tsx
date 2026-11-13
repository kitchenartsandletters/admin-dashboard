// VendorSetupModal.tsx
// The welcome page's "Vendors needing setup" card opens this.
// Contract: supply-chain-service docs/VENDOR_MANAGEMENT.md §4.3 (#120).
//
// Each row is a Shopify vendor whose active titles nothing can order: no
// supplier claims it, or the supplier that does has no active account. Staff
// clear a row one of three ways:
//
//   Attach to an existing supplier  { party_id, reason? }
//   Set up as a supplier            { create: { name, roles?, account_number?, ... }, reason? }
//                                   (revives an account-less record that already
//                                   claims the vendor instead of duplicating it)
//   Ignore                          { reason }   (required)
//
// PREVIEW IS MANDATORY. Attach and set-up show what would happen first: the
// destination, every title that would move and from where, codes taken off
// other records, and anything that would stop it. Confirm sends the identical
// body the preview was computed for. Editing any field after a preview throws
// the preview away, so a Confirm can never apply something nobody looked at.
// Resolve is one database transaction on the server: all of it or none.
//
// The default action comes from the request's suggestion: a supplier WITH an
// account → attach to it ("did you mean"); an account-less record → set up,
// named after that record (it gets revived); no suggestion → set up, named
// after the vendor.
//
// Blockers in a preview carry an `error` code and details but no message, so
// the wording below is ours. Refusals from resolve DO carry a message and it is
// shown as sent. Malformed-request 422s (FastAPI arrays) mean a dashboard bug,
// and say so.

import { useEffect, useMemo, useState } from 'react'
import ModalShell from '../components/ModalShell'
import {
  ScApiError,
  fetchSuppliers,
  previewVendorSetup,
  resolveVendorSetup,
  ignoreVendorSetup,
  type VendorSetupBody,
  type VendorSetupBlocker,
  type VendorSetupItem,
  type VendorSetupList,
  type VendorSetupPlan,
  type VendorSetupRole,
} from '../api/supplyChainApi'
import type { SupplierParty } from '../supply-chain/suppliers/supplierTypes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLES: { value: VendorSetupRole; label: string }[] = [
  { value: 'publisher',   label: 'Publisher' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'small_press', label: 'Small press' },
  { value: 'direct',      label: 'Direct' },
  { value: 'restaurant',  label: 'Restaurant' },
  { value: 'author',      label: 'Author' },
  { value: 'other',       label: 'Other' },
]

/** Loose search key, like the backend's normalize_vendor: case, apostrophes, & and punctuation ignored. */
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2019\u2018`\u02bc']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** "2026-11-12" → "Nov 12, 2026", without the UTC-midnight shift new Date() would add. */
function fmtDay(day: string | null): string {
  if (!day) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!m) return day
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}`
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

interface Party { id: string; name: string }

/** One cached supplier list per page load; the picker filters it locally. */
let suppliersPromise: Promise<SupplierParty[]> | null = null
function loadSuppliers(): Promise<SupplierParty[]> {
  if (!suppliersPromise) {
    suppliersPromise = fetchSuppliers({ activeOnly: true }).catch(e => { suppliersPromise = null; throw e })
  }
  return suppliersPromise
}

/** Our wording for a preview blocker (they carry a code and details, no message). */
function blockerText(b: VendorSetupBlocker): string {
  const name = typeof b.party_name === 'string' ? b.party_name : null
  switch (b.error) {
    case 'request_not_open':
      return 'This request has already been resolved or ignored, probably by someone else just now.'
    case 'party_has_no_active_account':
      return `${name ? `“${name}”` : 'That supplier'} has no active account, so its titles still couldn’t be ordered. ` +
             'Set it up as a supplier instead (that reuses the existing record), or add an account to it first.'
    case 'claimed_elsewhere': {
      const parties = Array.isArray(b.parties) ? (b.parties as Party[]).map(p => `“${p.name ?? (p as any).party_name}”`) : []
      return `Another supplier with an active account already claims this vendor${parties.length ? `: ${parties.join(', ')}` : ''}.`
    }
    case 'name_exists':
      return `A supplier named ${name ? `“${name}”` : 'that'} already exists and has an account. Attach to it instead.`
    case 'name_required':
      return 'A name is required to set up a supplier.'
    case 'reason_required':
      return 'A reason is required.'
    default:
      return `Can’t do this: ${b.error}.`
  }
}

/** Suppliers a blocker or refusal says to attach to instead. */
function attachOffers(b: Record<string, unknown> | null | undefined): Party[] {
  if (!b) return []
  if (b.error === 'name_exists' && typeof b.party_id === 'string') {
    return [{ id: b.party_id, name: String(b.party_name ?? 'that supplier') }]
  }
  if (b.error === 'claimed_elsewhere' && Array.isArray(b.parties)) {
    return (b.parties as { party_id?: string; party_name?: string }[])
      .filter(p => typeof p.party_id === 'string')
      .map(p => ({ id: p.party_id as string, name: p.party_name ?? 'that supplier' }))
  }
  return []
}

interface Problem {
  text: string
  code?: string
  data?: Record<string, unknown> | null
}

function toProblem(e: unknown, fallback: string): Problem {
  if (e instanceof ScApiError) {
    if (Array.isArray(e.detail)) {
      // FastAPI request validation: the dashboard sent something malformed.
      return { text: `The dashboard sent a request the server couldn’t read. This is a dashboard bug, not something you did. (${e.text})` }
    }
    return { text: e.text, code: typeof e.data?.error === 'string' ? e.data.error : undefined, data: e.data }
  }
  return { text: e instanceof Error ? e.message : fallback }
}

// ---------------------------------------------------------------------------
// Supplier picker (attach)
// ---------------------------------------------------------------------------

function SupplierPicker({ value, onChange }: { value: Party | null; onChange: (p: Party | null) => void }) {
  const [all, setAll] = useState<SupplierParty[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let live = true
    loadSuppliers()
      .then(list => { if (live) setAll(list) })
      .catch(e => { if (live) setLoadError(e instanceof Error ? e.message : 'Could not load suppliers') })
    return () => { live = false }
  }, [])

  const matches = useMemo(() => {
    const k = norm(q)
    if (!all || !k) return []
    return all
      .filter(p => norm(p.name).includes(k) || (p.shopify_vendor_codes ?? []).some(c => norm(c) === k))
      .slice(0, 30)
  }, [all, q])

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
        <span className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">{value.name}</span>
        <button type="button" onClick={() => { onChange(null); setQ('') }}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0">Change</button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search suppliers by name or vendor code…"
        aria-label="Search suppliers"
        className="w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
      {loadError && <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>}
      {!all && !loadError && <p className="text-xs text-gray-400">Loading suppliers…</p>}
      {matches.length > 0 && (
        <div role="listbox" className="max-h-48 overflow-y-auto border dark:border-gray-700 rounded-md divide-y dark:divide-gray-800">
          {matches.map(p => (
            <button key={p.id} type="button" role="option" aria-selected={false}
              onClick={() => onChange({ id: p.id, name: p.name })}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
              <span className="block text-gray-900 dark:text-gray-100 truncate">{p.name}</span>
              {(p.shopify_vendor_codes?.length ?? 0) > 0 && (
                <span className="block text-[11px] font-mono text-gray-400 truncate">{p.shopify_vendor_codes!.join(' · ')}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {all && norm(q) && matches.length === 0 && (
        <p className="text-xs text-gray-400">No supplier matches “{q}”.</p>
      )}
      <p className="text-[11px] text-gray-400 dark:text-gray-500">
        The supplier needs an active account; the preview will say if it hasn’t one.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preview panel
// ---------------------------------------------------------------------------

function PreviewPanel({ plan, onAttachTo, onRefresh }: {
  plan: VendorSetupPlan
  onAttachTo: (p: Party) => void
  onRefresh: () => void
}) {
  const d = plan.destination ?? {}
  const moves = plan.moves ?? []
  const total = plan.titles_to_move ?? moves.length
  const removed = plan.codes_removed_from ?? []

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden" data-testid="vs-preview">
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-700 space-y-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Preview · nothing has changed yet</p>
        {plan.action === 'attach' ? (
          <p className="text-sm text-gray-900 dark:text-gray-100">
            Attach <strong>{plan.vendor}</strong> to <strong>{d.party_name ?? '—'}</strong>
            {d.account_label ? <span className="text-gray-500 dark:text-gray-400"> · account “{d.account_label}”</span> : null}
          </p>
        ) : (
          <p className="text-sm text-gray-900 dark:text-gray-100">
            Set up <strong>{d.party_name ?? '—'}</strong> as a supplier for <strong>{plan.vendor}</strong>
            {d.revives_party_name
              ? <span className="block text-xs text-gray-500 dark:text-gray-400">Revives the existing record “{d.revives_party_name}” (renamed, made active, given an account), so no duplicate is created.</span>
              : <span className="block text-xs text-gray-500 dark:text-gray-400">A new supplier, with a new active account.</span>}
          </p>
        )}
      </div>

      <div className="px-3 py-2 space-y-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {total > 0 ? `${plural(total, 'title')} will move` : 'No catalogued titles move now'}
        </p>
        {total === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">The next catalog sync registers this vendor’s titles under the new supplier.</p>
        )}
        {moves.length > 0 && (
          <div className="max-h-56 overflow-y-auto border dark:border-gray-700 rounded">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 sticky top-0">
                <tr>
                  <th className="text-left font-semibold px-2 py-1">Title</th>
                  <th className="text-left font-semibold px-2 py-1">ISBN</th>
                  <th className="text-left font-semibold px-2 py-1">From</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-800">
                {moves.map((m, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 text-gray-800 dark:text-gray-200">{m.title ?? '—'}</td>
                    <td className="px-2 py-1 font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{m.isbn ?? '—'}</td>
                    <td className="px-2 py-1 text-gray-500 dark:text-gray-400">
                      {m.from_account ?? '—'}
                      {m.from_account_active === false && <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">(inactive)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > moves.length && (
          <p className="text-[11px] text-gray-400">…and {plural(total - moves.length, 'more title')}.</p>
        )}

        {removed.length > 0 && (
          <div className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
            <p className="font-semibold">Vendor code taken off:</p>
            {removed.map((r, i) => (
              <p key={i}>· <span className="font-mono">{r.code}</span> from “{r.party_name}”</p>
            ))}
          </div>
        )}

        {plan.blockers.length > 0 && (
          <div className="px-3 py-2 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 space-y-2" data-testid="vs-blockers">
            <p className="text-xs font-semibold text-red-800 dark:text-red-200">This can’t be done as it stands:</p>
            {plan.blockers.map((b, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs text-red-700 dark:text-red-300">{blockerText(b)}</p>
                <div className="flex flex-wrap gap-2">
                  {attachOffers(b).map(p => (
                    <button key={p.id} type="button" onClick={() => onAttachTo(p)}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      Attach to {p.name} instead
                    </button>
                  ))}
                  {b.error === 'request_not_open' && (
                    <button type="button" onClick={onRefresh}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      Refresh the list
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// One request's actions
// ---------------------------------------------------------------------------

type Action = 'attach' | 'create' | 'ignore'

function RequestPanel({ item, onDone, onRefresh }: {
  item: VendorSetupItem
  onDone: (summary: string) => void
  onRefresh: () => void
}) {
  const s = item.suggestion
  const [action, setAction] = useState<Action>(s?.has_active_account ? 'attach' : 'create')
  const [party, setParty] = useState<Party | null>(s?.has_active_account ? { id: s.party_id, name: s.party_name } : null)
  const [name, setName] = useState(s && !s.has_active_account ? s.party_name : item.vendor)
  const [roles, setRoles] = useState<VendorSetupRole[]>([])
  const [accountNumber, setAccountNumber] = useState('')
  const [accountLabel, setAccountLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')

  const [preview, setPreview] = useState<{ key: string; plan: VendorSetupPlan } | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)

  // The exact body a preview / resolve sends. Empty optional fields are left out.
  const body: VendorSetupBody | null = useMemo(() => {
    const r = reason.trim() ? { reason: reason.trim() } : {}
    if (action === 'attach') return party ? { party_id: party.id, ...r } : null
    if (action === 'create') {
      const n = name.trim()
      if (!n) return null
      const create: Record<string, unknown> = { name: n }
      if (roles.length) create.roles = roles
      if (accountNumber.trim()) create.account_number = accountNumber.trim()
      if (accountLabel.trim()) create.account_label = accountLabel.trim()
      if (notes.trim()) create.notes = notes.trim()
      return { create: create as { name: string }, ...r }
    }
    return null
  }, [action, party, name, roles, accountNumber, accountLabel, notes, reason])
  const bodyKey = body ? JSON.stringify(body) : ''

  // Any change to what would be sent discards the preview: Confirm must only
  // ever apply what was previewed.
  useEffect(() => { setPreview(null); setProblem(null) }, [bodyKey, action])

  const fresh = preview && preview.key === bodyKey ? preview.plan : null
  const canConfirm = !!fresh && fresh.blockers.length === 0 && busy === null

  const switchToAttach = (p: Party) => { setAction('attach'); setParty(p) }

  const runPreview = async () => {
    if (!body) return
    setBusy('preview'); setProblem(null)
    try {
      const plan = await previewVendorSetup(item.id, body)
      setPreview({ key: bodyKey, plan })
    } catch (e) {
      setProblem(toProblem(e, 'Preview failed'))
    } finally { setBusy(null) }
  }

  const runResolve = async () => {
    if (!fresh || !body) return
    setBusy('apply'); setProblem(null)
    try {
      const out = await resolveVendorSetup(item.id, body)
      const moved = out.titles_to_move ?? 0
      const dest = out.destination?.party_name ?? (action === 'attach' ? party?.name : name.trim())
      onDone(action === 'attach'
        ? `${item.vendor} attached to ${dest}. ${plural(moved, 'title')} moved.`
        : `${item.vendor} set up as ${dest}. ${plural(moved, 'title')} moved.`)
    } catch (e) {
      setProblem(toProblem(e, 'Could not apply'))
      setPreview(null)
    } finally { setBusy(null) }
  }

  const runIgnore = async () => {
    const r = reason.trim()
    if (!r) return
    setBusy('apply'); setProblem(null)
    try {
      await ignoreVendorSetup(item.id, r)
      onDone(`${item.vendor} ignored.`)
    } catch (e) {
      setProblem(toProblem(e, 'Could not ignore'))
    } finally { setBusy(null) }
  }

  const tab = (a: Action, label: string) => (
    <button type="button" role="tab" aria-selected={action === a} onClick={() => setAction(a)}
      className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
        action === a
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}>
      {label}
    </button>
  )
  const label = 'block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1'
  const input = 'w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none'

  return (
    <div className="px-4 pb-4 pt-1 space-y-3">
      {item.sample_titles.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold">Titles include: </span>
          {item.sample_titles.map(t => t.title ?? t.isbn ?? '—').join(' · ')}
        </div>
      )}
      {s && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {s.has_active_account
            ? <>Did you mean <strong className="text-gray-700 dark:text-gray-200">{s.party_name}</strong>? ({s.reason})</>
            : <>Existing record <strong className="text-gray-700 dark:text-gray-200">{s.party_name}</strong> already claims it but has no account ({s.reason}). Setting up reuses it.</>}
        </p>
      )}

      <div role="tablist" className="flex flex-wrap gap-2">
        {tab('attach', 'Attach to existing supplier')}
        {tab('create', 'Set up as a supplier')}
        {tab('ignore', 'Ignore')}
      </div>

      {action === 'attach' && (
        <div>
          <span className={label}>Supplier</span>
          <SupplierPicker value={party} onChange={setParty} />
        </div>
      )}

      {action === 'create' && (
        <div className="space-y-3">
          <div>
            <label className={label} htmlFor={`vs-name-${item.id}`}>Supplier name <span className="text-red-500">*</span></label>
            <input id={`vs-name-${item.id}`} value={name} onChange={e => setName(e.target.value)} className={input} />
          </div>
          <div>
            <span className={label}>Roles</span>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map(r => {
                const on = roles.includes(r.value)
                return (
                  <button key={r.value} type="button" aria-pressed={on}
                    onClick={() => setRoles(prev => on ? prev.filter(x => x !== r.value) : [...prev, r.value])}
                    className={`px-2 py-1 rounded border text-xs transition-colors ${on
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}>
                    {r.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">None picked: the server keeps the existing record’s roles, or uses Publisher.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor={`vs-acct-${item.id}`}>Account number</label>
              <input id={`vs-acct-${item.id}`} value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                placeholder="Optional — can be added later" className={input} />
            </div>
            <div>
              <label className={label} htmlFor={`vs-label-${item.id}`}>Account label</label>
              <input id={`vs-label-${item.id}`} value={accountLabel} onChange={e => setAccountLabel(e.target.value)}
                placeholder={`${name.trim() || 'Name'} Main Account`} className={input} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor={`vs-notes-${item.id}`}>Notes</label>
            <input id={`vs-notes-${item.id}`} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className={input} />
          </div>
        </div>
      )}

      <div>
        <label className={label} htmlFor={`vs-reason-${item.id}`}>
          Reason{action === 'ignore' ? <span className="text-red-500"> *</span> : ' (optional)'}
        </label>
        <input id={`vs-reason-${item.id}`} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}
          placeholder={action === 'ignore' ? 'Why this vendor needs no supplier' : 'Recorded with the change'} className={input} />
      </div>

      {fresh && <PreviewPanel plan={fresh} onAttachTo={switchToAttach} onRefresh={onRefresh} />}

      {problem && (
        <div className="px-3 py-2 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 space-y-1" role="alert">
          <p className="text-xs text-red-700 dark:text-red-300">{problem.text}</p>
          <div className="flex flex-wrap gap-2">
            {attachOffers(problem.code ? { ...problem.data, error: problem.code } : null).map(p => (
              <button key={p.id} type="button" onClick={() => switchToAttach(p)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                Attach to {p.name} instead
              </button>
            ))}
            {problem.code === 'request_not_open' && (
              <button type="button" onClick={onRefresh}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                Refresh the list
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {action === 'ignore' ? (
          <button type="button" onClick={runIgnore} disabled={!reason.trim() || busy !== null}
            className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            {busy === 'apply' ? 'Ignoring…' : 'Ignore this vendor'}
          </button>
        ) : (
          <>
            <button type="button" onClick={runPreview} disabled={!body || busy !== null}
              className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              {busy === 'preview' ? 'Previewing…' : fresh ? 'Preview again' : 'Preview'}
            </button>
            <button type="button" onClick={runResolve} disabled={!canConfirm}
              title={!fresh ? 'Preview first' : fresh.blockers.length ? 'Resolve the problems above first' : undefined}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
              {busy === 'apply' ? 'Applying…' : 'Confirm'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export default function VendorSetupModal({ open, data, onClose, onResolved, onRefresh }: {
  open: boolean
  data: VendorSetupList | null
  onClose: () => void
  /** A request was resolved or ignored: drop it from the list and the count. */
  onResolved: (id: string) => void
  /** Re-fetch the list (e.g. after someone else closed a request). */
  onRefresh: () => void
}) {
  const [filter, setFilter] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => { if (!open) { setOpenId(null); setNotice(null) } }, [open])

  const items = data?.items ?? []
  const shown = useMemo(() => {
    const k = norm(filter)
    if (!k) return items
    return items.filter(i => norm(i.vendor).includes(k) || i.sample_titles.some(t => norm(t.title).includes(k)))
  }, [items, filter])

  if (!open) return null

  const count = data?.count ?? 0
  const asOf = data?.as_of
    ? new Date(data.as_of).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <ModalShell
      title="Vendors needing setup"
      subtitle={`${count.toLocaleString()} open · biggest sellers first${asOf ? ` · as of ${asOf}` : ''}`}
      size="xl"
      onClose={onClose}
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          These Shopify vendors have active titles that can’t go on a purchase order: no supplier
          claims the vendor, or the one that does has no active account. Attach each to a supplier,
          set one up, or ignore it. Every change is previewed before anything moves.
        </p>

        {notice && (
          <div className="px-3 py-2 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-sm text-green-800 dark:text-green-200" role="status">
            ✓ {notice}
          </div>
        )}

        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by vendor or title…"
          aria-label="Filter vendors"
          className="w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />

        {count > items.length && (
          <p className="text-[11px] text-gray-400">Showing the top {items.length} of {count.toLocaleString()} by sales. The rest appear as these are cleared.</p>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">Nothing needs setting up.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">No vendor matches “{filter}”.</p>
        ) : (
          <div className="border dark:border-gray-700 rounded-lg divide-y dark:divide-gray-800">
            {shown.map(item => {
              const isOpen = openId === item.id
              return (
                <div key={item.id}>
                  <button type="button" aria-expanded={isOpen}
                    onClick={() => { setOpenId(isOpen ? null : item.id); setNotice(null) }}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 ${isOpen ? 'bg-gray-50 dark:bg-gray-800/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.vendor}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {plural(item.active_titles, 'active title')} · last sale {fmtDay(item.last_sale)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">{item.units_24m.toLocaleString()}</span>
                      <span className="block text-[10px] text-gray-400">sold, 24 mo</span>
                    </span>
                  </button>
                  {isOpen && (
                    <RequestPanel key={item.id} item={item} onRefresh={onRefresh}
                      onDone={summary => { setNotice(summary); setOpenId(null); onResolved(item.id) }} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
