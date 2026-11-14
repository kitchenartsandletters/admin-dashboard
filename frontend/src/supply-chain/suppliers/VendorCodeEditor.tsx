// VendorCodeEditor.tsx
// Add or remove a supplier's Shopify vendor codes: preview, then apply.
// Contract: supply-chain-service docs/VENDOR_MANAGEMENT.md §4.4.
//
// A vendor code decides which supplier (and so which account) owns every title
// with that vendor, so codes are never written directly. The preview shows the
// whole effect; apply does exactly that or nothing.
//
//   edit     pick codes to add / remove
//   preview  POST …/codes/preview — changes nothing. With blockers preview_id is
//            null and there is no Apply.
//   apply    POST …/codes/apply {preview_id, reason} + actor headers. The
//            backend accepts no reason; Gil wants one on every code change, so
//            it is required here.
//   409      catalogue_changed / preview_expired / preview_not_found /
//            preview_has_blockers → "Preview again" with the same add/remove.
//            preview_already_applied → refresh the profile.
//
// Opened from the supplier profile and from the supplier map.

import { useEffect, useMemo, useRef, useState } from 'react'
import ModalShell from '../../components/ModalShell'
import {
  applyCodeChange, errorCode, errorText, fetchSupplierProfile, previewCodeChange,
  type CodeApplyResult, type CodePreview, type ProfileVendorCode,
} from '../../api/vendorManagementApi'
import { NoticeList, count, fmtDateTime, n } from './vendorUi'

const PREVIEW_AGAIN = new Set(['catalogue_changed', 'preview_expired', 'preview_not_found', 'preview_has_blockers'])

interface Props {
  partyId: string
  partyName: string
  /** The profile's vendor_codes; fetched when not given (e.g. from the supplier map). */
  codes?: ProfileVendorCode[]
  onClose: () => void
  /** After a successful apply, or when the preview turns out to be applied already. */
  onApplied: (result: CodeApplyResult | null) => void
}

type Stage = 'edit' | 'preview' | 'done'

export default function VendorCodeEditor({ partyId, partyName, codes: givenCodes, onClose, onApplied }: Props) {
  const [codes, setCodes] = useState<ProfileVendorCode[] | null>(givenCodes ?? null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [remove, setRemove] = useState<string[]>([])
  const [add, setAdd] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('edit')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<CodePreview | null>(null)
  const [error, setError] = useState<{ text: string; code: string | null } | null>(null)
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<CodeApplyResult | null>(null)

  useEffect(() => {
    if (givenCodes) return
    fetchSupplierProfile(partyId)
      .then(p => setCodes(p.vendor_codes))
      .catch(e => setLoadError(errorText(e)))
  }, [partyId, givenCodes])

  const nameRow = codes?.find(c => c.is_name) ?? null
  const codeRows = useMemo(() => (codes ?? []).filter(c => !c.is_name), [codes])
  const changed = add.length > 0 || remove.length > 0

  const addDraft = () => {
    const c = draft.trim()
    setDraft('')
    inputRef.current?.focus()
    if (!c) return
    const lower = c.toLowerCase()
    // Re-adding a code marked for removal just un-marks it.
    const existing = codeRows.find(r => r.code.toLowerCase() === lower)
    if (existing) { setRemove(prev => prev.filter(x => x !== existing.code)); return }
    if (add.some(a => a.toLowerCase() === lower)) return
    setAdd(prev => [...prev, c])
  }

  const toggleRemove = (code: string) =>
    setRemove(prev => prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code])

  const runPreview = async () => {
    setBusy(true)
    setError(null)
    try {
      const p = await previewCodeChange(partyId, add, remove)
      setPreview(p)
      setStage('preview')
    } catch (e) {
      setError({ text: errorText(e), code: errorCode(e) })
    } finally {
      setBusy(false)
    }
  }

  const runApply = async () => {
    if (!preview?.preview_id || !reason.trim()) return
    setBusy(true)
    setError(null)
    try {
      const r = await applyCodeChange(partyId, preview.preview_id, reason.trim())
      setResult(r)
      setStage('done')
      onApplied(r)
    } catch (e) {
      setError({ text: errorText(e), code: errorCode(e) })
    } finally {
      setBusy(false)
    }
  }

  const footer = ({ requestClose }: { requestClose: () => void }) => {
    if (stage === 'done') {
      return (
        <div className="flex justify-end">
          <button type="button" onClick={requestClose} className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
            Done
          </button>
        </div>
      )
    }
    if (stage === 'edit') {
      return (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={requestClose} className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button type="button" onClick={runPreview} disabled={!changed || busy || !codes}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold">
            {busy ? 'Previewing…' : 'Preview'}
          </button>
        </div>
      )
    }
    // preview
    const canApply = !!preview?.preview_id
    const againNeeded = error?.code != null && PREVIEW_AGAIN.has(error.code)
    return (
      <div className="space-y-2">
        {canApply && !againNeeded && (
          <div>
            <label htmlFor="code-change-reason" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea id="code-change-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Why this code change? Kept with every title it moves."
              className="w-full px-2.5 py-1.5 border rounded-md text-sm bg-white dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none resize-none" />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!canApply && (
            <p className="mr-auto text-xs text-red-600 dark:text-red-400">Nothing can be applied until the blockers are fixed.</p>
          )}
          <button type="button" onClick={() => { setStage('edit'); setError(null) }} disabled={busy}
            className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40">
            Back
          </button>
          {againNeeded ? (
            <button type="button" onClick={runPreview} disabled={busy}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold">
              {busy ? 'Previewing…' : 'Preview again'}
            </button>
          ) : error?.code === 'preview_already_applied' ? (
            <button type="button" onClick={() => { onApplied(null); requestClose() }}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
              Refresh
            </button>
          ) : canApply && (
            <button type="button" onClick={runApply} disabled={busy || !reason.trim()}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold">
              {busy ? 'Applying…' : preview && preview.move_count > 0 ? `Apply and move ${count(preview.move_count, 'title')}` : 'Apply'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <ModalShell
      title="Vendor codes"
      subtitle={partyName}
      size="lg"
      onClose={onClose}
      dismissible={!busy}
      footer={footer}
    >
      {error && (
        <div role="alert" className="mb-4 px-3 py-2 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-800 dark:text-red-200">
          {error.text}
          {error.code && PREVIEW_AGAIN.has(error.code) && (
            <span className="block mt-1 text-xs">Nothing was changed. Preview again to see the plan as it stands now.</span>
          )}
        </div>
      )}

      {stage === 'edit' && (
        <EditStage
          loadError={loadError}
          loading={!codes && !loadError}
          nameRow={nameRow}
          codeRows={codeRows}
          remove={remove}
          add={add}
          draft={draft}
          inputRef={inputRef}
          onDraft={setDraft}
          onAddDraft={addDraft}
          onToggleRemove={toggleRemove}
          onUnadd={c => setAdd(prev => prev.filter(x => x !== c))}
        />
      )}

      {stage === 'preview' && preview && <PreviewStage preview={preview} />}

      {stage === 'done' && result && (
        <div className="space-y-3 text-sm" role="status">
          <div className="px-3 py-3 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200">
            <p className="font-semibold">Applied.</p>
            <p className="mt-1">
              {result.moved === 0 ? 'No titles moved.' : `${count(result.moved, 'title')} moved.`}
              {result.setup_requests_resolved > 0 && ` ${count(result.setup_requests_resolved, 'vendor-setup request')} resolved.`}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Codes now</p>
            <CodeChips codes={result.codes_after} added={result.added} />
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Edit stage
// ---------------------------------------------------------------------------

function EditStage({
  loadError, loading, nameRow, codeRows, remove, add, draft, inputRef,
  onDraft, onAddDraft, onToggleRemove, onUnadd,
}: {
  loadError: string | null
  loading: boolean
  nameRow: ProfileVendorCode | null
  codeRows: ProfileVendorCode[]
  remove: string[]
  add: string[]
  draft: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onDraft: (v: string) => void
  onAddDraft: () => void
  onToggleRemove: (code: string) => void
  onUnadd: (code: string) => void
}) {
  if (loadError) return <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
  if (loading) return <p className="text-sm text-gray-500">Loading codes…</p>

  return (
    <div className="space-y-4 text-sm">
      <p className="text-gray-600 dark:text-gray-300">
        A vendor code decides which supplier every title with that Shopify vendor belongs to.
        Nothing changes until you preview and apply.
      </p>

      <ul className="divide-y dark:divide-gray-800 border rounded-md dark:border-gray-800">
        {nameRow && (
          <li className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{nameRow.code}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">The supplier’s name; always matches. Not removable.</p>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{count(nameRow.titles, 'title')}</span>
          </li>
        )}
        {codeRows.map(c => {
          const removing = remove.includes(c.code)
          return (
            <li key={c.code} className={`flex items-center justify-between gap-3 px-3 py-2 ${removing ? 'bg-red-50/60 dark:bg-red-900/10' : ''}`}>
              <div className="min-w-0">
                <p className={`font-mono font-semibold truncate ${removing ? 'line-through text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{c.code}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  {count(c.titles, 'title')}{c.titles_here !== c.titles && ` · ${n(c.titles_here)} here`}
                </p>
              </div>
              <button type="button" onClick={() => onToggleRemove(c.code)}
                className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold border ${removing
                  ? 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                  : 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'}`}>
                {removing ? 'Keep' : 'Remove'}
              </button>
            </li>
          )
        })}
        {add.map(c => (
          <li key={`add-${c}`} className="flex items-center justify-between gap-3 px-3 py-2 bg-green-50/60 dark:bg-green-900/10">
            <div className="min-w-0">
              <p className="font-mono font-semibold text-green-700 dark:text-green-300 truncate">+ {c}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">To add</p>
            </div>
            <button type="button" onClick={() => onUnadd(c)}
              className="shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">
              Don’t add
            </button>
          </li>
        ))}
        {codeRows.length === 0 && add.length === 0 && (
          <li className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">No codes besides the name.</li>
        )}
      </ul>

      <div>
        <label htmlFor="vendor-code-add" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Add a code</label>
        <div className="flex gap-2">
          <input id="vendor-code-add" ref={inputRef} value={draft} onChange={e => onDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddDraft() } }}
            placeholder="Shopify vendor, e.g. IPG"
            className="flex-1 min-w-0 px-2.5 py-1.5 border rounded-md text-sm bg-white dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none" />
          <button type="button" onClick={onAddDraft} disabled={!draft.trim()}
            className="px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 shrink-0">
            Add
          </button>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          Matching ignores case, apostrophes, punctuation and spacing, and reads “&” as “and”.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preview stage
// ---------------------------------------------------------------------------

function CodeChips({ codes, added = [], removed = [] }: { codes: string[]; added?: string[]; removed?: string[] }) {
  if (codes.length === 0 && removed.length === 0) return <span className="text-xs text-gray-400">None</span>
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map(c => (
        <span key={c} className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold ${added.includes(c)
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>{c}</span>
      ))}
      {removed.map(c => (
        <span key={`rm-${c}`} className="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold line-through bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">{c}</span>
      ))}
    </div>
  )
}

function PreviewStage({ preview: p }: { preview: CodePreview }) {
  const removedShown = p.removed.filter(r => !p.codes_after.includes(r))
  return (
    <div className="space-y-5 text-sm">
      {p.blockers.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-red-700 dark:text-red-300 mb-1.5">Can’t be applied</h3>
          <NoticeList notices={p.blockers} severity="blocker" />
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Codes before</p>
          <CodeChips codes={p.codes_before} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Codes after</p>
          <CodeChips codes={p.codes_after} added={p.added} removed={removedShown} />
        </div>
      </section>

      {p.effects.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Where each code resolves</p>
          <ul className="divide-y dark:divide-gray-800 border rounded-md dark:border-gray-800">
            {p.effects.map(e => (
              <li key={`${e.change}-${e.code}`} className="px-3 py-2">
                <p>
                  <span className="font-mono font-semibold">{e.code}</span>
                  <span className={`ml-2 text-[10px] font-bold uppercase ${e.change === 'add' ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>
                    {e.change === 'add' ? 'Add' : 'Remove'}
                  </span>
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                  {e.resolves_before?.party_name ?? 'Nobody'}
                  <span className="text-gray-400 mx-1" aria-hidden="true">→</span>
                  {e.resolves_after?.party_name ?? 'Nobody'}
                  <span className="text-gray-400"> · {count(e.titles, 'title')}, {n(e.titles_moving)} moving</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.conflicts.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Conflicts</p>
          <NoticeList notices={p.conflicts} severity="warning" />
        </section>
      )}
      {p.warnings.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Warnings</p>
          <NoticeList notices={p.warnings} severity="warning" />
        </section>
      )}

      <section>
        <p className="font-semibold text-gray-900 dark:text-gray-100">
          {p.move_count === 0 ? 'No titles move.' : `${count(p.move_count, 'title')} move.`}
        </p>
        {p.move_count > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {count(p.titles_with_isbn, 'title')} with an ISBN
            {p.items_without_isbn > 0 && `, ${count(p.items_without_isbn, 'other item')} without one (damaged-copy variants, other SKUs, blank barcodes)`}.
          </p>
        )}
        {p.stranded_count > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            {count(p.stranded_count, 'title')} can’t be placed: the supplier they resolve to has no active account. They stay where they are.
          </p>
        )}

        {p.moves.length > 0 && (
          <div className="mt-2 overflow-x-auto border rounded-md dark:border-gray-800">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900 text-left text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-2.5 py-1.5 font-semibold">Title</th>
                  <th className="px-2.5 py-1.5 font-semibold">ISBN</th>
                  <th className="px-2.5 py-1.5 font-semibold">From</th>
                  <th className="px-2.5 py-1.5 font-semibold">To</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-800">
                {p.moves.map(m => (
                  <tr key={m.row_id} className="align-top">
                    <td className="px-2.5 py-1.5 text-gray-900 dark:text-gray-100">
                      {m.title ?? '—'}
                      {m.already_misplaced && (
                        <span className="ml-1.5 inline-block px-1.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          Already misplaced
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap">{m.isbn ?? '—'}</td>
                    <td className="px-2.5 py-1.5 text-gray-600 dark:text-gray-300">
                      {m.from_party ?? '—'}
                      {m.from_account && <span className="block text-[10px] text-gray-400">{m.from_account}{m.from_account_active === false && ' (inactive)'}</span>}
                    </td>
                    <td className="px-2.5 py-1.5 text-gray-600 dark:text-gray-300">
                      {m.to_party ?? '—'}
                      {m.to_account && <span className="block text-[10px] text-gray-400">{m.to_account}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.moves_truncated && (
              <p className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-t dark:border-gray-800">
                and {n(p.move_count - p.moves.length)} more
              </p>
            )}
          </div>
        )}
      </section>

      {p.setup_requests_resolved.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Vendor-setup requests this settles</p>
          <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
            {p.setup_requests_resolved.map(r => (
              <li key={r.request_id}>{r.vendor} ({count(r.active_titles, 'active title')}) → {r.party_name}</li>
            ))}
          </ul>
        </section>
      )}

      {p.preview_id && p.expires_at && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">This preview holds until {fmtDateTime(p.expires_at)}.</p>
      )}
    </div>
  )
}
