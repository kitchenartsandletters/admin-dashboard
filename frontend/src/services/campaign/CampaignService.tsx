// CampaignService.tsx
// Partner campaign allocation: where the count stands, whether the Shopify
// gate agrees with it, and the two repairs.
//
// The health strip is the point of this screen. A campaign can look perfectly
// healthy on its numbers while the metafield that actually gates the landing
// page says something else, and that disagreement is invisible in Shopify.
import { useCallback, useEffect, useState } from 'react'
import {
  fetchCampaignMetrics,
  fetchCampaignOrders,
  fetchCampaigns,
  reconcileCampaign,
  resyncMetafield,
} from '../../api/campaignApi'
import type {
  CampaignMetrics,
  CampaignOrderRow,
  CampaignRow,
  ReconcileReport,
} from '../../types/campaignTypes'
import CampaignOrdersTable from './CampaignOrdersTable'

const STATE_STYLES: Record<string, string> = {
  open:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  closed: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : '—'

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="px-4 py-3 border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</div>}
    </div>
  )
}

export default function CampaignService() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [slug, setSlug] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null)
  const [orders, setOrders] = useState<CampaignOrderRow[]>([])
  const [report, setReport] = useState<ReconcileReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const campaign = campaigns.find(c => c.slug === slug) ?? null

  const loadCampaigns = useCallback(async () => {
    const rows = await fetchCampaigns()
    setCampaigns(rows)
    setSlug(prev => prev ?? rows[0]?.slug ?? null)
  }, [])

  useEffect(() => {
    loadCampaigns()
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [loadCampaigns])

  useEffect(() => {
    if (!slug) return
    setError(null)
    Promise.all([fetchCampaignMetrics(slug), fetchCampaignOrders(slug)])
      .then(([m, o]) => {
        setMetrics(m)
        setOrders(o)
      })
      .catch(e => setError(String(e)))
  }, [slug])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  const onResync = () =>
    run('resync', async () => {
      await resyncMetafield(slug!)
      await loadCampaigns()
    })

  const onReconcile = (dryRun: boolean) =>
    run(dryRun ? 'check' : 'repair', async () => {
      const result = await reconcileCampaign(slug!, { dryRun })
      setReport(result)
      if (!dryRun) await loadCampaigns()
    })

  if (loading) {
    return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading campaigns…</div>
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500 dark:text-gray-400">No campaigns configured.</div>
        {error && <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div>}
      </div>
    )
  }

  const gateDisagrees = campaign.metafield_in_sync === false

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{campaign.name}</h1>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {campaign.partner}
            {campaign.isbn && <> · ISBN {campaign.isbn}</>}
            {campaign.page_handle && <> · /pages/{campaign.page_handle}</>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaigns.length > 1 && (
            <select
              value={slug ?? ''}
              onChange={e => {
                setSlug(e.target.value)
                setReport(null)
              }}
              className="text-sm border rounded px-2 py-1 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            >
              {campaigns.map(c => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              STATE_STYLES[campaign.state] ?? STATE_STYLES.closed
            }`}
          >
            {campaign.state}
          </span>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-md border border-red-300 bg-red-50 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat
          label="Remaining"
          value={campaign.remaining}
          hint={`of ${campaign.allocation} allocated`}
        />
        <Stat
          label="Sellable"
          value={campaign.sellable}
          hint={`${campaign.buffer} held back as buffer`}
        />
        <Stat label="Units sold" value={metrics?.units ?? '—'} hint={`${metrics?.orders ?? 0} orders`} />
        <Stat label="Last 7 days" value={metrics?.units_7d ?? '—'} hint={`${metrics?.units_24h ?? 0} in 24h`} />
        <Stat
          label="Returned"
          value={metrics?.refund_count ?? '—'}
          hint="refunds and cancellations"
        />
      </div>

      {/* Health */}
      <div className="border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
        <div className="px-4 py-3 border-b dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Gate health</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onReconcile(true)}
              disabled={!!busy}
              className="text-xs px-2.5 py-1 rounded border dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              {busy === 'check' ? 'Checking…' : 'Check against Shopify'}
            </button>
            <button
              onClick={onResync}
              disabled={!!busy}
              className="text-xs px-2.5 py-1 rounded border dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              {busy === 'resync' ? 'Pushing…' : 'Resync metafield'}
            </button>
          </div>
        </div>

        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Gate value</div>
            <div className="tabular-nums font-semibold text-gray-900 dark:text-white">
              {campaign.metafield_value}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              0 whenever the campaign is not open
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Last pushed</div>
            <div className="tabular-nums font-semibold text-gray-900 dark:text-white">
              {campaign.last_synced_value ?? '—'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              what we last attempted, not what Shopify holds
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Last order</div>
            <div className="font-semibold text-gray-900 dark:text-white">
              {fmtDateTime(campaign.last_order_at)}
            </div>
          </div>
        </div>

        {gateDisagrees && (
          <div className="mx-4 mb-3 px-3 py-2 rounded border border-amber-300 bg-amber-50 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            The last pushed value does not match the gate value. Resync pushes it;
            check against Shopify first if you want to know why it drifted.
          </div>
        )}

        {metrics && metrics.inferred_count > 0 && (
          <div className="mx-4 mb-3 px-3 py-2 rounded border border-red-300 bg-red-50 text-xs text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {metrics.inferred_count} order{metrics.inferred_count === 1 ? '' : 's'} attributed
            by landing site alone. The line item property is missing, which means the
            Liquid template stopped stamping it — check the page before the next sale.
          </div>
        )}
      </div>

      {/* Reconciliation report */}
      {report && (
        <div className="border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
          <div className="px-4 py-3 border-b dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Reconciliation
              <span className="ml-2 font-normal text-xs text-gray-500 dark:text-gray-400">
                {report.dry_run ? 'dry run' : 'applied'} · scanned {report.scanned.orders} orders
                {report.scanned.since && <> since {report.scanned.since.slice(0, 10)}</>}
              </span>
            </h3>
            {report.dry_run && report.fixes.length > 0 && report.needs_attention.length === 0 && (
              <button
                onClick={() => onReconcile(false)}
                disabled={!!busy}
                className="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {busy === 'repair' ? 'Repairing…' : `Repair ${report.fixes.join(' and ')}`}
              </button>
            )}
          </div>

          <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Ledger</div>
              <div className="tabular-nums font-semibold">{report.ledger_qty}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Cached</div>
              <div className="tabular-nums font-semibold">{report.consumed}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Shopify</div>
              <div className="tabular-nums font-semibold">{report.shopify_qty}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Metafield</div>
              <div className="tabular-nums font-semibold">
                {report.metafield.live ?? '—'}
                <span className="font-normal text-gray-500 dark:text-gray-400">
                  {' '}/ {report.metafield.expected}
                </span>
              </div>
            </div>
          </div>

          {report.needs_attention.length > 0 ? (
            <div className="mx-4 mb-3 px-3 py-2 rounded border border-red-300 bg-red-50 text-xs text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              <div className="font-semibold">Not repaired automatically</div>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {report.needs_attention.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
              <div className="mt-1.5">
                Shopify disagreeing with the ledger means a delivery we never received.
                Writing ledger rows from a reconciliation would be attribution by
                inference, so this wants a decision, not a button.
              </div>
            </div>
          ) : (
            <div className="mx-4 mb-3 px-3 py-2 rounded border border-emerald-300 bg-emerald-50 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
              {report.action === 'in_sync'
                ? 'Ledger, cached counter and Shopify all agree.'
                : report.applied?.length
                  ? `Applied: ${report.applied.join('; ')}`
                  : `Correctable: ${report.fixes.join(' and ')}.`}
            </div>
          )}
        </div>
      )}

      <CampaignOrdersTable data={orders} remaining={campaign.remaining} />
    </div>
  )
}
