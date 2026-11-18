// GiveawayPanel.tsx
// Giveaway copies and the partner tracking file.
//
// The tracking file is why this screen exists. Orders already exist, the
// partner pulls the file, and the mistake worth preventing is a half-finished
// file reaching them — so the counts lead, and the download is gated on
// awaiting_shipment being zero.
//
// Giveaway copies are a separate pool the partner bought. They move inventory
// (same variant as retail) but never the sales allocation, which is why no copy
// on this panel mentions remaining allocation: those are two counters and
// conflating them is the risk. The allocation numbers live in the stats grid
// above, under their own labels.
//
// The file deliberately carries no winner name and no address. ship_state is
// region and that is the whole of it. Don't add columns here, and don't display
// names the dashboard does not have.
//
// ALL PANEL STATE IS KEYED ON SLUG BY THE PARENT (<GiveawayPanel key={slug} />),
// so switching campaigns discards it structurally rather than relying on a
// reset effect that the next person has to remember to extend.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import ConfirmModal from '../../components/ConfirmModal'
import {
  CampaignApiError,
  downloadGiveawayTrackingCsv,
  fetchGiveawayTracking,
  giveawayTrackingRefusal,
  submitGiveaway,
} from '../../api/campaignApi'
import type { GiveawayResult, GiveawayTracking } from '../../types/campaignTypes'

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—'

function Stat({
  label, value, hint, warn,
}: { label: string; value: string | number; hint?: string; warn?: boolean }) {
  return (
    <div
      className={`px-4 py-3 border rounded-md ${
        warn
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
          : 'dark:border-gray-700 bg-white dark:bg-gray-900'
      }`}
    >
      <div
        className={`text-xs font-semibold uppercase tracking-wider ${
          warn ? 'text-amber-800 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums ${
          warn ? 'text-amber-900 dark:text-amber-200' : 'text-gray-900 dark:text-white'
        }`}
      >
        {value}
      </div>
      {hint && (
        <div
          className={`mt-0.5 text-xs ${
            warn ? 'text-amber-800 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {hint}
        </div>
      )}
    </div>
  )
}

/** A labelled block in the import diagnosis. Order matters — see the form below. */
function Note({
  tone, title, children,
}: {
  tone: 'error' | 'warn' | 'info' | 'ok'
  title: string
  children: React.ReactNode
}) {
  const styles = {
    error: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300',
    warn:  'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
    info:  'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
    ok:    'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',
  }[tone]
  return (
    <div className={`px-3 py-2 rounded border text-xs ${styles}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1 space-y-1">{children}</div>
    </div>
  )
}

export default function GiveawayPanel({ slug }: { slug: string }) {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [tracking, setTracking] = useState<GiveawayTracking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // Import form. Collapsed by default: no partner file is pending, and the
  // tracking file is what this screen is for.
  const [importOpen, setImportOpen] = useState(false)
  const [csv, setCsv] = useState('')
  const [dryRun, setDryRun] = useState<GiveawayResult | null>(null)
  /**
   * The exact CSV text the dry run ran against. Create is gated on this still
   * matching the textarea, so editing the box invalidates the check rather than
   * creating orders against a file nobody checked.
   */
  const [dryRunCsv, setDryRunCsv] = useState<string | null>(null)
  const [created, setCreated] = useState<GiveawayResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'check' | 'create' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setTracking(await fetchGiveawayTracking(slug))
    } catch (e) {
      setError(e instanceof CampaignApiError ? e.text : String(e))
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  const summary = tracking?.summary ?? null
  const awaiting = summary?.awaiting_shipment ?? 0
  const blocked = awaiting > 0

  const onDownload = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadGiveawayTrackingCsv(slug)
    } catch (e) {
      // The service refuses an incomplete file, so a stale summary here still
      // can't send one. Prefer its live count to ours.
      const refusal = giveawayTrackingRefusal(e)
      if (refusal) {
        setDownloadError(
          `${refusal.summary.awaiting_shipment} of ${refusal.summary.winners} winners still have no tracking number, ` +
          `so the file was not generated. ${refusal.hint ?? ''}`.trim()
        )
        setTracking(t => (t ? { ...t, summary: refusal.summary } : t))
      } else {
        setDownloadError(e instanceof CampaignApiError ? e.text : String(e))
      }
    } finally {
      setDownloading(false)
    }
  }

  const readFile = async (file: File | null | undefined) => {
    if (!file) return
    setCsv(await file.text())
  }

  const onCheck = async () => {
    setBusy('check')
    setImportError(null)
    setCreated(null)
    try {
      const result = await submitGiveaway(slug, csv, { dryRun: true })
      setDryRun(result)
      setDryRunCsv(csv)
    } catch (e) {
      setDryRun(null)
      setDryRunCsv(null)
      setImportError(e instanceof CampaignApiError ? e.text : String(e))
    } finally {
      setBusy(null)
    }
  }

  const onCreate = async () => {
    setConfirmOpen(false)
    setBusy('create')
    setImportError(null)
    try {
      const result = await submitGiveaway(slug, csv, { dryRun: false })
      setCreated(result)
      // Creation moved inventory and added orders, so the counts above are stale.
      await load()
      // Force a fresh check before any second create against the same text.
      setDryRun(null)
      setDryRunCsv(null)
    } catch (e) {
      setImportError(e instanceof CampaignApiError ? e.text : String(e))
    } finally {
      setBusy(null)
    }
  }

  // A dry run only authorises a create while it still describes what is in the
  // box, parsed cleanly, and found something to create.
  const dryRunFresh = dryRun !== null && dryRunCsv !== null && dryRunCsv === csv
  const dryRunUsable =
    dryRunFresh &&
    !dryRun.error &&
    dryRun.columns.missing_required.length === 0 &&
    dryRun.to_create > 0

  const createBlockedBecause = !isAdmin
    ? 'Creating orders is restricted to admins.'
    : !dryRunFresh && dryRun !== null
      ? 'The file changed since it was checked. Run Check file again.'
      : !dryRunUsable
        ? 'Check the file first. Create is enabled once a check passes against exactly this text.'
        : null

  return (
    <div className="border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <div className="px-4 py-3 border-b dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Giveaway copies
          </h3>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            A separate pool the partner bought. Tracking is what they receive.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownload}
            disabled={downloading || blocked || !tracking || tracking.rows.length === 0}
            title={blocked ? 'Some fulfillments have not synced back yet' : undefined}
            className="text-xs px-2.5 py-1 rounded border dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {downloading ? 'Preparing…' : 'Download tracking CSV'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded border border-red-300 bg-red-50 text-xs text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !tracking ? (
        <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
          Loading giveaway tracking…
        </div>
      ) : !summary ? null : (
        <>
          {/* Summary. One giveaway count, taken from tracking. */}
          <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat
              label="Winners"
              value={summary.winners}
              hint={
                summary.rows !== summary.winners
                  ? `${summary.rows} tracking lines — some shipments split`
                  : undefined
              }
            />
            <Stat label="With tracking" value={summary.with_tracking} />
            <Stat
              label="Awaiting shipment"
              value={summary.awaiting_shipment}
              warn={blocked}
              hint={blocked ? 'Not yet synced back from the shipping tool' : undefined}
            />
          </div>

          {blocked && (
            <div className="mx-4 mb-3 px-3 py-2 rounded border border-amber-300 bg-amber-50 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              {summary.awaiting_shipment} fulfillment
              {summary.awaiting_shipment === 1 ? ' has' : 's have'} not synced back from the
              shipping tool yet. Nothing is wrong — those rows are simply pending — but the
              download stays closed until they land, because a partial file is the one thing
              the partner should not receive.
            </div>
          )}

          {downloadError && (
            <div className="mx-4 mb-3 px-3 py-2 rounded border border-amber-300 bg-amber-50 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              {downloadError}
            </div>
          )}

          {/* Tracking rows. No name, no address — ship_state is the region. */}
          <div className="overflow-x-auto border-t dark:border-gray-700">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {['Winner', 'Order', 'Ships to', 'Fulfillment', 'Carrier', 'Tracking', 'Shipped'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 border-b dark:border-gray-700 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {tracking && tracking.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      No giveaway orders yet.
                    </td>
                  </tr>
                )}
                {tracking?.rows.map((row, i) => {
                  const pending = !row.tracking_number
                  return (
                    <tr
                      key={`${row.winner_reference}-${row.tracking_number ?? i}`}
                      className="even:bg-gray-50/50 dark:even:bg-gray-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                        {row.winner_reference}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.admin_url ? (
                          <a
                            href={row.admin_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {row.order_name ?? row.shopify_order_id}
                          </a>
                        ) : (
                          <span className="font-medium">{row.order_name ?? row.shopify_order_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                        {row.ship_state ?? '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.fulfillment_status ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.tracking_company ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {pending ? (
                          <span className="text-xs text-gray-500 dark:text-gray-400">pending</span>
                        ) : row.tracking_url ? (
                          <a
                            href={row.tracking_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {row.tracking_number}
                          </a>
                        ) : (
                          <span className="font-mono text-xs">{row.tracking_number}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.shipped_at ? (
                          fmtDate(row.shipped_at)
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Import a partner file. Collapsed: nothing is pending.              */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-t dark:border-gray-700">
        <button
          onClick={() => setImportOpen(o => !o)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <span>Import a winner list</span>
          <span>{importOpen ? '−' : '+'}</span>
        </button>

        {importOpen && (
          <div className="px-4 pb-4 space-y-3">
            <textarea
              value={csv}
              onChange={e => setCsv(e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder="Paste the partner's CSV, headers included."
              className="w-full px-3 py-2 border rounded font-mono text-xs dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/20 outline-none"
            />

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={e => readFile(e.target.files?.[0])}
                className="text-xs text-gray-600 dark:text-gray-400"
              />
              <div className="flex-1" />
              <button
                onClick={onCheck}
                disabled={!!busy || csv.trim() === ''}
                className="text-xs px-2.5 py-1 rounded border dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
              >
                {busy === 'check' ? 'Checking…' : 'Check file'}
              </button>
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={!!busy || !dryRunUsable || !isAdmin}
                title={createBlockedBecause ?? undefined}
                className="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy === 'create' ? 'Creating…' : 'Create orders'}
              </button>
            </div>

            {createBlockedBecause && (
              <div className="text-xs text-gray-500 dark:text-gray-400">{createBlockedBecause}</div>
            )}

            {importError && (
              <Note tone="error" title="The import was refused">
                <div>{importError}</div>
              </Note>
            )}

            {/* Diagnosis, in the order an operator needs it. */}
            {dryRun && (
              <div className="space-y-2">
                {!dryRunFresh && (
                  <Note tone="warn" title="This check is out of date">
                    <div>It describes earlier text. Run Check file again before creating.</div>
                  </Note>
                )}

                {dryRun.columns.missing_required.length > 0 && (
                  <Note tone="error" title="Required columns are missing">
                    <div className="font-mono">{dryRun.columns.missing_required.join(', ')}</div>
                    {dryRun.error && <div>{dryRun.error}</div>}
                    {dryRun.hint && <div>{dryRun.hint}</div>}
                  </Note>
                )}

                {dryRun.columns.unmapped.length > 0 && (
                  <Note tone="warn" title="Headers not understood, so ignored">
                    <div className="font-mono">{dryRun.columns.unmapped.join(', ')}</div>
                    <div>
                      These need adding to ALIASES in campaign-service
                      (<span className="font-mono">app/giveaway.py</span>) if they carry
                      anything we should keep.
                    </div>
                  </Note>
                )}

                {dryRun.columns.refused.length > 0 && (
                  <Note tone="info" title="Contact columns, dropped on import">
                    {/* Header names only. Printing the values would defeat refusing them. */}
                    <div className="font-mono">{dryRun.columns.refused.join(', ')}</div>
                    <div>
                      Never stored. The shipping address is stored on the Shopify order only.
                    </div>
                  </Note>
                )}

                {dryRun.normalised.length > 0 && (
                  <Note tone="info" title={`Values corrected (${dryRun.normalised.length})`}>
                    <ul className="space-y-0.5">
                      {dryRun.normalised.map((n, i) => (
                        <li key={i} className="font-mono">
                          row {n.row} · {n.field}: {n.from} → {n.to}
                        </li>
                      ))}
                    </ul>
                  </Note>
                )}

                {dryRun.rejected.length > 0 && (
                  <Note tone="error" title={`Rows rejected (${dryRun.rejected.length})`}>
                    <ul className="space-y-0.5">
                      {dryRun.rejected.map((r, i) => (
                        <li key={i}>
                          row {r.row}: {r.problems.join('; ')}
                        </li>
                      ))}
                    </ul>
                  </Note>
                )}

                {dryRun.already_shipped.length > 0 && (
                  <Note tone="info" title={`Already shipped (${dryRun.already_shipped.length})`}>
                    <ul className="space-y-0.5">
                      {dryRun.already_shipped.map((r, i) => (
                        <li key={i}>
                          <span className="font-mono">{r.winner_reference}</span>
                          {' — '}
                          {r.admin_url ? (
                            <a
                              href={r.admin_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {r.order_name ?? 'order'}
                            </a>
                          ) : (
                            r.order_name ?? 'order'
                          )}
                          {' · '}{r.reason}
                        </li>
                      ))}
                    </ul>
                    <div>These are skipped, not duplicated.</div>
                  </Note>
                )}

                {dryRun.preview && dryRun.preview.length > 0 && (
                  <Note
                    tone="ok"
                    title={`Ready to create: ${dryRun.to_create} order${dryRun.to_create === 1 ? '' : 's'}, ${dryRun.copies} cop${dryRun.copies === 1 ? 'y' : 'ies'}`}
                  >
                    <ul className="space-y-0.5">
                      {dryRun.preview.map((p, i) => (
                        <li key={i} className="font-mono">
                          {p.winner_reference} · {p.ship_to} · ×{p.quantity}
                        </li>
                      ))}
                    </ul>
                  </Note>
                )}
              </div>
            )}

            {/* Outcome. Shopify's errors are shown verbatim. */}
            {created && (
              <div className="space-y-2">
                {created.created && created.created.length > 0 && (
                  <Note tone="ok" title={`Created ${created.created.length}`}>
                    <ul className="space-y-0.5">
                      {created.created.map(c => (
                        <li key={c.winner_reference}>
                          <span className="font-mono">{c.winner_reference}</span>
                          {' — '}
                          {c.admin_url ? (
                            <a
                              href={c.admin_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {c.name}
                            </a>
                          ) : (
                            c.name
                          )}
                        </li>
                      ))}
                    </ul>
                  </Note>
                )}

                {created.failed && created.failed.length > 0 && (
                  <Note tone="error" title={`Failed (${created.failed.length})`}>
                    <ul className="space-y-1">
                      {created.failed.map((f, i) => (
                        <li key={i}>
                          <span className="font-mono">{f.winner_reference}</span>
                          {/* Shopify's own GraphQL error. Not summarised: it is the
                              only account of why this winner has no order. */}
                          <div className="mt-0.5 font-mono whitespace-pre-wrap break-words">
                            {f.error}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Note>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Create giveaway orders?"
        variant="danger"
        confirmLabel={`Create ${dryRun?.to_create ?? 0} order${dryRun?.to_create === 1 ? '' : 's'}`}
        busy={busy === 'create'}
        onConfirm={onCreate}
        onCancel={() => setConfirmOpen(false)}
      >
        {/* The campaign is named here on purpose: it is the last chance to notice
            that the selected campaign is not the one the file belongs to. */}
        <p>
          This creates {dryRun?.to_create ?? 0} real Shopify order
          {dryRun?.to_create === 1 ? '' : 's'} on{' '}
          <span className="font-mono font-semibold">{slug}</span> and decrements{' '}
          {dryRun?.copies ?? 0} cop{dryRun?.copies === 1 ? 'y' : 'ies'} of inventory.
        </p>
        <p className="mt-2">
          Winners already in the ledger are skipped, so a repeat run cannot duplicate
          them. There is no undo for the orders this does create.
        </p>
      </ConfirmModal>
    </div>
  )
}
