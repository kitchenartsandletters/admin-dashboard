// ProductLookup.tsx
// Catalog Gaps: one title, explained, with its vendor editable in Shopify.
// Contract: supply-chain-service docs/VENDOR_MANAGEMENT.md §4.1 (explain) and
// §4.5 (product vendor). Grew out of the "Register a product by ISBN" box.
//
//   Look up         GET /suppliers/explain?isbn=… (or ?inventory_item_id=…).
//                   Read-only.
//   Register        GET /suppliers/products/search-shopify?isbn=… — the old box's
//                   call, which registers the title when it can. Offered only
//                   when the title isn't catalogued.
//   Change vendor   PATCH /suppliers/products/{inventory_item_id}/vendor, always
//                   dry_run: true first to show the plan, then the same body with
//                   dry_run: false. That one WRITES TO SHOPIFY.
//
// ?item=<inventory_item_id> or ?isbn=<isbn> in the URL looks a title up on load
// (the barcode audit links here).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  changeProductVendor, errorCode, errorText, explainTitle, loadBarcodeLabels, FALLBACK_BARCODE_LABELS,
  type Barcode, type Explain, type VendorEditResult,
} from '../../api/vendorManagementApi'
import { fetchSuppliers, searchShopifyByISBN, ScApiError, type ShopifyLookupResult, type UnregisteredReason } from '../../api/supplyChainApi'
import { ChainPanels, ProblemList, count, fmtDate, fmtDateTime, statusLabel } from './vendorUi'

const UNREGISTERED_HEADINGS: Record<UnregisteredReason, string> = {
  no_vendor:         'Found in Shopify — no vendor set',
  no_supplier:       'Found in Shopify — no supplier for this vendor',
  no_active_account: 'Found in Shopify — supplier has no active account',
}

const subLabel = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500'
const input = 'px-3 py-2 border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none'

export default function ProductLookup() {
  const [params, setParams] = useSearchParams()
  const [isbn, setIsbn] = useState(params.get('isbn') ?? '')
  const [busy, setBusy] = useState(false)
  const [explain, setExplain] = useState<Explain | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [labels, setLabels] = useState<Record<string, string>>(FALLBACK_BARCODE_LABELS)

  useEffect(() => { loadBarcodeLabels().then(setLabels) }, [])

  const run = useCallback(async (q: { isbn?: string; inventoryItemId?: string }) => {
    setBusy(true)
    setError(null)
    setExplain(null)
    try {
      setExplain(await explainTitle(q))
    } catch (e) {
      setError(errorText(e, 'Lookup failed'))
    } finally {
      setBusy(false)
    }
  }, [])

  // Deep links from the barcode audit.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    const item = params.get('item')
    const i = params.get('isbn')
    if (item) { started.current = true; run({ inventoryItemId: item }) }
    else if (i) { started.current = true; run({ isbn: i.replace(/-/g, '').trim() }) }
  }, [params, run])

  const clean = isbn.replace(/-/g, '').trim()
  const lookUp = () => {
    if (clean.length < 9) return
    // Drop a deep-link param so the URL matches what is shown.
    if (params.has('item') || params.has('isbn')) {
      const next = new URLSearchParams(params); next.delete('item'); next.delete('isbn'); setParams(next, { replace: true })
    }
    run({ isbn: clean })
  }

  const refresh = () => {
    const id = explain?.query.inventory_item_id ?? explain?.shopify.inventory_item_id
    if (explain?.query.isbn) run({ isbn: explain.query.isbn })
    else if (id) run({ inventoryItemId: id })
  }

  return (
    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Look up a product</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Enter an ISBN to see what Shopify says about it, which supplier it belongs to and why,
          how to order it and where returns go. Register it if it isn’t in the catalog, or change its vendor.
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            aria-label="ISBN"
            value={isbn}
            onChange={e => setIsbn(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') lookUp() }}
            placeholder="9780525536673"
            className={`flex-1 min-w-0 font-mono ${input}`}
          />
          <button
            type="button"
            onClick={lookUp}
            disabled={busy || clean.length < 9}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Looking up…' : 'Look up'}
          </button>
        </div>

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {explain && <ExplainView e={explain} labels={labels} onRefresh={refresh} onReplace={setExplain} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Explain
// ---------------------------------------------------------------------------

function ExplainView({ e, labels, onRefresh, onReplace }: {
  e: Explain
  labels: Record<string, string>
  onRefresh: () => void
  onReplace: (e: Explain) => void
}) {
  const s = e.shopify
  const cat = e.catalogue
  const res = e.resolution
  const itemId = e.query.inventory_item_id ?? s.inventory_item_id ?? null
  const isbn = s.isbn ?? e.query.isbn
  const noReturns = e.problems.find(p => p.code === 'no_return_destination')?.message ?? null
  const navigate = useNavigate()
  const openSupplier = (id: string) => navigate(`/suppliers?supplier=${encodeURIComponent(id)}`)

  return (
    <div className="space-y-4 text-sm">
      {/* Title */}
      <div>
        <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{s.title ?? 'Untitled'}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300 mt-0.5">
          {isbn && <span className="font-mono">{isbn}</span>}
          {s.found && <span>Shopify status: {statusLabel(s.status)}</span>}
          {s.found && <span>Vendor: <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">{s.vendor || '—'}</span></span>}
          <span className={e.orderable ? 'text-green-700 dark:text-green-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
            {e.orderable ? 'Can be ordered' : 'Can’t be ordered'}
          </span>
          {s.product_admin_url && (
            <a href={s.product_admin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
              Open in Shopify admin ↗
            </a>
          )}
        </div>
      </div>

      <ProblemList problems={e.problems} empty="No problems found." />

      {/* Barcodes */}
      {s.found && (
        <div>
          <p className={`${subLabel} mb-1`}>Barcodes in Shopify</p>
          {(s.barcodes ?? []).length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">None.</p>
          ) : (
            <ul className="space-y-1">
              {(s.barcodes ?? []).map((b, i) => <BarcodeRow key={`${b.value}-${i}`} b={b} labels={labels} />)}
            </ul>
          )}
        </div>
      )}

      {/* Which supplier, and why */}
      {res && (
        <div>
          <p className={`${subLabel} mb-1`}>Which supplier the vendor points to</p>
          <p className="text-gray-900 dark:text-gray-100">
            {res.chosen_party_name
              ? <>Vendor <span className="font-mono">{res.vendor}</span> belongs to <PartyLink id={res.chosen_party_id} name={res.chosen_party_name} />.</>
              : <>No supplier claims vendor <span className="font-mono">{res.vendor || '—'}</span>.</>}
          </p>
          {res.rule && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{res.rule}</p>}
          {res.candidates.length > 0 && (
            <ul className="mt-1.5 text-xs space-y-0.5">
              {res.candidates.map(c => (
                <li key={c.party_id} className={c.chosen ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}>
                  {c.chosen ? '✓ ' : '· '}
                  <PartyLink id={c.party_id} name={c.party_name} />
                  {' '}— {c.matched_by === 'name' ? 'matches its name' : `has code ${c.code ?? ''}`}
                  {c.has_active_account ? `, account ${c.account_label ?? ''}` : ', no active account'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Catalogue */}
      <div>
        <p className={`${subLabel} mb-1`}>In the catalog</p>
        {cat.catalogued ? (
          <>
            <p className="text-gray-900 dark:text-gray-100">
              On {cat.account ? <><PartyLink id={cat.account.party_id} name={cat.account.party_name} />, account {cat.account.label}{cat.account.account_number && ` #${cat.account.account_number}`}</> : 'an unknown account'}
              {cat.account && !cat.account.is_active && <span className="text-red-600 dark:text-red-400"> (inactive)</span>}.
            </p>
            {res?.matches_catalogue === true && <p className="text-xs text-green-700 dark:text-green-400">That’s where the vendor says it belongs.</p>}
            {res?.matches_catalogue === false && res.expected_account && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                The vendor says it belongs on {res.expected_account.party_name}, account {res.expected_account.label}.
              </p>
            )}
            {(cat.other_rows ?? []).length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Also recorded on {count(cat.other_rows!.length, 'other account')}.</p>
            )}
          </>
        ) : (
          <p className="text-gray-900 dark:text-gray-100">Not in the catalog.</p>
        )}
        {e.shared_account_number && e.shared_account_number.also_used_by.length > 0 && (
          <p className="mt-1 text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1">
            Account #{e.shared_account_number.account_number} is also used by:{' '}
            {e.shared_account_number.also_used_by.map(u => u.party_name).join(', ')}
          </p>
        )}
        {e.setup_request && e.setup_request.status === 'open' && (
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            A vendor-setup request is open for “{e.setup_request.vendor}”.{' '}
            <Link to="/welcome?open=vendor-setup" className="text-blue-600 dark:text-blue-400 hover:underline">Open in Needs attention →</Link>
          </p>
        )}
      </div>

      {s.found && !cat.catalogued && isbn && <RegisterAction isbn={isbn} onRegistered={onRefresh} />}

      {e.chain && <ChainPanels chain={e.chain} noReturnsMessage={noReturns} onOpenSupplier={openSupplier} />}

      {e.open_po_lines.length > 0 && (
        <div>
          <p className={`${subLabel} mb-1`}>Open PO lines</p>
          <ul className="text-xs space-y-0.5 text-gray-700 dark:text-gray-300">
            {e.open_po_lines.map((l, i) => (
              <li key={`${l.po_number}-${i}`}>
                <span className="font-mono">{l.po_number}</span> · {l.po_status} · {l.quantity_received}/{l.quantity_ordered} received
                {l.account && ` · ${l.account}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.recent_moves.length > 0 && (
        <div>
          <p className={`${subLabel} mb-1`}>Recent moves</p>
          <ul className="text-xs space-y-0.5 text-gray-700 dark:text-gray-300">
            {e.recent_moves.map((m, i) => (
              <li key={`${m.moved_at}-${i}`}>
                {fmtDate(m.moved_at)} · {m.from_account ?? '—'} → {m.to_account ?? '—'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.found && itemId && (
        <ChangeVendor key={itemId} itemId={itemId} currentVendor={s.vendor ?? ''} onChanged={onReplace} onStale={onRefresh} />
      )}
    </div>
  )
}

function PartyLink({ id, name }: { id: string | null; name: string }) {
  if (!id) return <span>{name}</span>
  return <Link to={`/suppliers?supplier=${encodeURIComponent(id)}`} className="text-blue-600 dark:text-blue-400 hover:underline">{name}</Link>
}

function BarcodeRow({ b, labels }: { b: Barcode; labels: Record<string, string> }) {
  return (
    <li className="text-xs">
      <span className="font-mono text-gray-900 dark:text-gray-100">{b.value}</span>
      <span className="text-gray-500 dark:text-gray-400">
        {' '}· {b.declared_type ? `declared ${b.declared_type}` : 'no type declared'}
        {b.formats.length > 0 && ` · valid ${b.formats.join(' / ')}`}
      </span>
      {b.finding && (
        <span className="ml-1.5 px-1.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          {labels[b.finding] ?? b.finding.replace(/_/g, ' ')}
        </span>
      )}
      {b.suggested_type && <span className="block text-gray-500 dark:text-gray-400">Declare it as {b.suggested_type}.</span>}
      {b.ambiguous_types && b.ambiguous_types.length > 0 && (
        <span className="block text-gray-500 dark:text-gray-400">Valid as {b.ambiguous_types.join(' or ')}: declare the one the supplier assigned.</span>
      )}
      {b.repair && (
        <span className="block text-gray-500 dark:text-gray-400">
          Suggested correction: <span className="font-mono">{b.repair.value}</span> ({b.repair.how}). Check it against the book before using it.
        </span>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Register (the old box's call)
// ---------------------------------------------------------------------------

function RegisterAction({ isbn, onRegistered }: { isbn: string; onRegistered: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ShopifyLookupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const register = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await searchShopifyByISBN(isbn)
      setResult(r)
      if (r.registered) onRegistered()
    } catch (e) {
      setError(e instanceof ScApiError ? e.text : e instanceof Error ? e.message : 'Register failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-3 py-3 rounded border border-gray-200 dark:border-gray-700 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-600 dark:text-gray-300">This title is in Shopify but not in the catalog, so the PO builder and receiving can’t find it.</p>
        <button type="button" onClick={register} disabled={busy}
          className="shrink-0 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50">
          {busy ? 'Registering…' : 'Register'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {result && !result.registered && (result.message || result.unrecognized_vendor) && (
        <div className="px-3 py-2 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            {(result.reason && UNREGISTERED_HEADINGS[result.reason]) ?? 'Found in Shopify — can’t be registered yet'}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            {result.message ?? `Vendor ${result.vendor ?? ''} isn’t linked to any supplier in this system.`}
          </p>
        </div>
      )}
      {result?.registered && (
        <p className="text-xs text-green-700 dark:text-green-300">✓ Registered. It will now appear in PO builder and receiving searches.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Change vendor (writes to Shopify)
// ---------------------------------------------------------------------------

let suggestionCache: Promise<string[] | null> | null = null

/**
 * Active suppliers' full names: what the dashboard writes to Shopify (Gil,
 * 2026-11-12 and 11-14). Codes are not offered. null when the list can't load.
 */
function loadVendorSuggestions(): Promise<string[] | null> {
  if (!suggestionCache) {
    suggestionCache = fetchSuppliers({ activeOnly: true })
      .then(list => [...new Set(list.map(p => p.name))].sort((a, b) => a.localeCompare(b)))
      .catch(() => { suggestionCache = null; return null })
  }
  return suggestionCache
}

/** Matching that ignores case, apostrophes, punctuation and spacing, "&" = "and". */
function matchKey(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '')
}

const MAX_SUGGESTIONS = 8

/**
 * Free-text field with our own suggestion list. Not a <datalist>: browsers
 * show those inconsistently (some phones never), so staff saw nothing.
 */
function VendorNameInput({ id, value, onChange, names }: {
  id: string
  value: string
  onChange: (v: string) => void
  names: string[] | null | undefined
}) {
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const q = matchKey(value)
  const matches = !names || !q ? [] : (() => {
    const starts: string[] = []
    const contains: string[] = []
    for (const nm of names) {
      const k = matchKey(nm)
      if (k === q) continue
      if (k.startsWith(q)) starts.push(nm)
      else if (k.includes(q)) contains.push(nm)
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS)
  })()
  const show = focused && matches.length > 0
  const pick = (nm: string) => { onChange(nm); setActive(-1); setFocused(false) }

  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        onChange={ev => { onChange(ev.target.value); setActive(-1); setFocused(true) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={ev => {
          if (!show) return
          if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)) }
          else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
          else if (ev.key === 'Enter' && active >= 0) { ev.preventDefault(); pick(matches[active]) }
          else if (ev.key === 'Escape') { ev.preventDefault(); setFocused(false) }
        }}
        placeholder="Supplier’s full name"
        className={`w-full ${input}`}
      />
      {show && (
        <ul id={`${id}-list`} role="listbox"
          className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg text-sm">
          {matches.map((nm, i) => (
            <li key={nm} role="option" aria-selected={i === active}
              // mousedown, not click: fires before the input's blur closes the list
              onMouseDown={ev => { ev.preventDefault(); pick(nm) }}
              className={`px-3 py-2 cursor-pointer ${i === active ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'} text-gray-900 dark:text-gray-100`}>
              {nm}
            </li>
          ))}
        </ul>
      )}
      {names === null && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Supplier names couldn’t be loaded; type the full name.</p>
      )}
    </div>
  )
}

function ChangeVendor({ itemId, currentVendor, onChanged, onStale }: {
  itemId: string
  currentVendor: string
  onChanged: (e: Explain) => void
  onStale: () => void
}) {
  const [open, setOpen] = useState(false)
  const [vendor, setVendor] = useState('')
  const [reason, setReason] = useState('')
  const [suggestions, setSuggestions] = useState<string[] | null | undefined>(undefined)
  const [busy, setBusy] = useState<'plan' | 'write' | null>(null)
  const [plan, setPlan] = useState<VendorEditResult | null>(null)
  const [done, setDone] = useState<VendorEditResult | null>(null)
  const [error, setError] = useState<{ text: string; code: string | null; shopify?: string[] } | null>(null)

  useEffect(() => { if (open) loadVendorSuggestions().then(setSuggestions) }, [open])

  const listId = `vendor-suggestions-${itemId}`
  const ready = vendor.trim() !== '' && reason.trim() !== ''

  // Any edit after a dry run invalidates its plan.
  const edit = (f: () => void) => { f(); setPlan(null); setError(null) }

  const send = async (dryRun: boolean) => {
    setBusy(dryRun ? 'plan' : 'write')
    setError(null)
    try {
      const r = await changeProductVendor(itemId, vendor.trim(), reason.trim(), dryRun)
      if (dryRun) setPlan(r)
      else {
        setDone(r)
        setPlan(null)
        if (r.explain) onChanged(r.explain)
      }
    } catch (e) {
      const code = errorCode(e)
      const raw = e instanceof ScApiError ? e.data?.shopify_errors : undefined
      const shopify = Array.isArray(raw)
        ? raw.map(x => (x && typeof x === 'object' && 'message' in x ? String((x as { message: unknown }).message) : String(x)))
        : undefined
      setError({ text: errorText(e), code, shopify })
    } finally {
      setBusy(null)
    }
  }

  if (!open) {
    return (
      <div className="pt-1">
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          Change vendor…
        </button>
        {done && <DoneNote r={done} />}
      </div>
    )
  }

  return (
    <div className="px-3 py-3 rounded-md border border-gray-200 dark:border-gray-700 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Change vendor</p>
        <button type="button" onClick={() => { setOpen(false); setPlan(null); setError(null) }} className="text-xs text-gray-500 hover:underline">
          Cancel
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Changes the product’s Vendor field in Shopify, for every variant, and moves the title to the supplier that vendor belongs to.
        Currently <span className="font-mono">{currentVendor || '—'}</span>.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`${listId}-in`} className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">New vendor</label>
          <VendorNameInput id={`${listId}-in`} value={vendor} names={suggestions}
            onChange={v => edit(() => setVendor(v))} />
        </div>
        <div>
          <label htmlFor={`${listId}-reason`} className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reason</label>
          <input id={`${listId}-reason`} value={reason} onChange={ev => edit(() => setReason(ev.target.value))}
            placeholder="Why the vendor is changing" className={`w-full ${input}`} />
        </div>
      </div>

      {error && (
        <div role="alert" className="px-3 py-2 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-xs text-red-800 dark:text-red-200 space-y-1">
          <p>{error.text}</p>
          {error.shopify && error.shopify.length > 0 && (
            <ul className="list-disc pl-4">{error.shopify.map((m, i) => <li key={i}>Shopify: {m}</li>)}</ul>
          )}
          {error.code === 'shopify_unavailable' && <p>Nothing was changed in Shopify or the catalog.</p>}
          {error.code === 'shopify_rejected' && <p>Shopify refused the change, so nothing was changed.</p>}
          {error.code === 'not_in_shopify' && (
            <button type="button" onClick={onStale} className="underline">Look the title up again</button>
          )}
        </div>
      )}

      {plan && <PlanView r={plan} />}

      <div className="flex flex-wrap justify-end gap-2">
        {!plan ? (
          <button type="button" onClick={() => send(true)} disabled={!ready || busy !== null}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
            {busy === 'plan' ? 'Checking…' : 'Check the change'}
          </button>
        ) : (
          <button type="button" onClick={() => send(false)} disabled={!ready || busy !== null}
            className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-50">
            {busy === 'write' ? 'Changing in Shopify…' : 'Change in Shopify'}
          </button>
        )}
      </div>

      {done && <DoneNote r={done} />}
    </div>
  )
}

function PlanView({ r }: { r: VendorEditResult }) {
  const p = r.plan
  return (
    <div className="px-3 py-2.5 rounded bg-gray-50 dark:bg-gray-800/60 text-sm space-y-1.5">
      <p className="text-gray-900 dark:text-gray-100">
        Shopify’s vendor becomes <span className="font-mono font-semibold">{r.vendor_after}</span>
        {r.vendor_before != null && <> (now <span className="font-mono">{r.vendor_before || '—'}</span>)</>}.
      </p>
      {p.outcome === 'unclaimed' && (
        <p className="text-amber-800 dark:text-amber-200">No supplier claims this vendor: the title stays where it is and a vendor-setup request will be opened.</p>
      )}
      {p.outcome === 'no_active_account' && (
        <p className="text-amber-800 dark:text-amber-200">
          {p.resolves_to?.party_name ?? 'The supplier'} claims this vendor but has no active account: the title stays where it is and a vendor-setup request will be opened.
        </p>
      )}
      {p.outcome === 'resolved' && p.rows.map(row => (
        <p key={row.row_id} className="text-gray-700 dark:text-gray-300">
          {p.rows.length > 1 && <span className="font-medium">{row.title ?? row.isbn ?? 'Item'}: </span>}
          {row.moves
            ? <>The title moves from {row.from ? `${row.from.party_name} (${row.from.label})` : 'nowhere'} to {row.to ? `${row.to.party_name} (${row.to.label})` : '—'}.</>
            : <>The title stays with {(row.to ?? row.from)?.party_name ?? '—'}.</>}
        </p>
      ))}
      {p.outcome === 'resolved' && p.rows.length === 0 && (
        <p className="text-gray-700 dark:text-gray-300">It isn’t in the catalog, so nothing moves. It will be filed with {p.resolves_to?.party_name ?? 'that supplier'} when it’s registered.</p>
      )}
      {p.ambiguous_with.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">Also claimed by {p.ambiguous_with.map(a => a.party_name).join(', ')}.</p>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">Nothing has changed yet. “Change in Shopify” makes the change.</p>
    </div>
  )
}

function DoneNote({ r }: { r: VendorEditResult }) {
  const c = r.catalogue
  if (c?.reconciled_by_next_sync || c?.error) {
    return (
      <p role="status" className="mt-2 px-3 py-2 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-200">
        Shopify changed: the vendor is now <span className="font-mono">{r.vendor_after}</span>. The catalog didn’t update yet; it catches up at the next sync.
      </p>
    )
  }
  return (
    <p role="status" className="mt-2 px-3 py-2 rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-xs text-green-800 dark:text-green-200">
      Changed in Shopify: the vendor is now <span className="font-mono">{r.vendor_after}</span>.
      {c?.moved ? ` ${count(c.moved, 'title')} moved.` : ' Nothing moved.'}
      {c?.setup_request && (c.setup_request.created ? ' A vendor-setup request was opened.' : ' A vendor-setup request already exists for this vendor.')}
      {' '}Shown above as it is now ({fmtDateTime(new Date().toISOString())}).
    </p>
  )
}
