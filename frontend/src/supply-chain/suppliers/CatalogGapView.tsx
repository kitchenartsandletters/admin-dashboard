// CatalogGapView.tsx
// Route: /suppliers/catalog-gaps
//
// Catalog coverage tool (#36).
//
// Answers the question: "Why can't I find this product in the PO builder?"
// and gives non-technical staff the tools to fix it without developer access.
//
// Two tabs (?tab=barcodes selects the second):
//   Catalog        1. Sync status — last run, stats, 'Run sync now' button
//                  2. Product lookup (ProductLookup.tsx) — explain one title,
//                     register it, change its vendor in Shopify. Grew out of
//                     the "Register by ISBN" box; registering keeps the
//                     backend's reason / message wording (§4.0).
//   Barcode audit  BarcodeAudit.tsx (§4.6)
//
// Contract: supply-chain-service docs/VENDOR_MANAGEMENT.md.

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import RightSidebar from '../../components/RightSidebar'
import ProductLookup from './ProductLookup'
import BarcodeAudit from './BarcodeAudit'
import {
  fetchSupplierSyncLog,
  triggerSupplierSync,
  type SupplierSyncResult,
} from '../../api/supplyChainApi'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Sync status panel
// ---------------------------------------------------------------------------

function SyncPanel() {
  const [log, setLog]         = useState<SupplierSyncResult[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<SupplierSyncResult | null>(null)
  const [runError, setRunError]   = useState<string | null>(null)

  useEffect(() => {
    fetchSupplierSyncLog(5)
      .then(setLog)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleRunSync = async () => {
    setRunning(true)
    setRunResult(null)
    setRunError(null)
    try {
      const result = await triggerSupplierSync()
      setRunResult(result)
      setLog(prev => [result, ...prev.slice(0, 4)])
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setRunning(false)
    }
  }

  const latest = runResult ?? log[0]

  return (
    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Catalog sync</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            The nightly sync keeps the supply chain catalog in step with Shopify.
            Run it manually to pick up products added since last night.
          </p>
        </div>
        <button
          onClick={handleRunSync}
          disabled={running}
          className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold
                     disabled:opacity-50 transition-colors shrink-0 ml-4"
        >
          {running ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Running…
            </span>
          ) : 'Run sync now'}
        </button>
      </div>

      {runError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b dark:border-gray-700 text-xs text-red-700 dark:text-red-300">
          {runError}
        </div>
      )}

      {runResult && (
        <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border-b dark:border-gray-700">
          <p className="text-xs font-semibold text-green-800 dark:text-green-200 mb-1">Sync complete</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-gray-500 dark:text-gray-400">New products registered</p>
              <p className="font-semibold text-gray-900 dark:text-white tabular-nums">{runResult.new_products_created}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Stale records deactivated</p>
              <p className="font-semibold text-gray-900 dark:text-white tabular-nums">{runResult.stale_products_deactivated}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Duration</p>
              <p className="font-semibold text-gray-900 dark:text-white tabular-nums">{runResult.duration_seconds}s</p>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-3">
        {loading ? (
          <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        ) : latest ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Last run</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(latest.run_at)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total products in Shopify</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">{latest.shopify_product_count.toLocaleString()}</p>
              </div>
            </div>
            {latest.unrecognized_count > 0 && (
              <div className="px-3 py-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  {latest.unrecognized_count} vendor code{latest.unrecognized_count !== 1 ? 's' : ''} in Shopify not mapped to any supplier
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {latest.unrecognized_vendors.map(v => (
                    <span key={v} className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 rounded text-[10px] font-mono text-amber-800 dark:text-amber-300">{v}</span>
                  ))}
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  Products with these vendor codes can't be added to POs until they're mapped.
                  Go to Supplier Settings to add the vendor code to the correct supplier.
                </p>
              </div>
            )}
            {latest.error_message && (
              <div className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                Last run error: {latest.error_message}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">No sync runs recorded yet.</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

type Tab = 'catalog' | 'barcodes'

export default function CatalogGapView() {
  const [docsFilePath, setDocsFilePath] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'barcodes' ? 'barcodes' : 'catalog'
  const setTab = (t: Tab) => {
    // Filters belong to the tab they were set on.
    setParams(t === 'barcodes' ? { tab: 'barcodes' } : {}, { replace: true })
  }
  return (
    <div className={`space-y-6 ${tab === 'barcodes' ? 'max-w-5xl' : 'max-w-2xl'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Catalog coverage</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            The supply chain catalog is a local mirror of Shopify products. If a product
            isn't appearing in the PO builder or receive flow, it's not in the catalog yet.
            Use these tools to fix gaps without waiting for the nightly sync.
          </p>
        </div>
        <button onClick={() => setDocsFilePath('/docs/supply-chain-catalog-gaps.md')}
          className="shrink-0 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
          View Help Guide
        </button>
      </div>

      <div role="tablist" className="flex gap-1 border-b dark:border-gray-800">
        {([['catalog', 'Catalog'], ['barcodes', 'Barcode audit']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm font-semibold border-b-2 -mb-px ${tab === t
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'catalog' ? (
        <>
          <SyncPanel />
          <ProductLookup />
        </>
      ) : (
        <BarcodeAudit />
      )}

      {docsFilePath && (
        <RightSidebar
          title="Catalog Gaps Guide"
          docsFilePath={docsFilePath}
          onClose={() => setDocsFilePath(null)}
        />
      )}
    </div>
  )
}