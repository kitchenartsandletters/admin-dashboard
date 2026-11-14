// BarcodeAudit.tsx
// Every active catalogue title's barcodes checked against Shopify's
// BarcodeType standards, for the EU product-identifier work.
// Contract: supply-chain-service docs/VENDOR_MANAGEMENT.md §4.6.
//
// GET /suppliers/barcode-audit?finding=&party_id=&limit=   (&format=csv to download)
// The summary and supplier counts always cover the whole catalogue; the
// filters narrow only the items.
//
// Lives on Catalog Gaps as the "Barcode audit" tab:
// /suppliers/catalog-gaps?tab=barcodes&party=<id>&finding=<finding>

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BARCODE_FINDINGS, FALLBACK_BARCODE_LABELS, downloadBarcodeAuditCsv, errorText, fetchBarcodeAudit,
  type BarcodeAudit as Audit,
} from '../../api/vendorManagementApi'
import { n, statusLabel } from './vendorUi'

const PAGE = 200
const SUPPLIERS_SHOWN = 25

export default function BarcodeAudit() {
  const [params, setParams] = useSearchParams()
  const finding = params.get('finding') ?? ''
  const partyId = params.get('party') ?? ''
  const [limit, setLimit] = useState(PAGE)

  const [audit, setAudit] = useState<Audit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [allSuppliers, setAllSuppliers] = useState(false)

  const setFilter = (k: 'finding' | 'party', v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v); else next.delete(k)
    setParams(next, { replace: true })
    setLimit(PAGE)
  }

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    fetchBarcodeAudit({ finding: finding || undefined, partyId: partyId || undefined, limit })
      .then(a => { if (live) setAudit(a) })
      .catch(e => { if (live) setError(errorText(e)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [finding, partyId, limit])

  const labels = useMemo(
    () => ({ ...FALLBACK_BARCODE_LABELS, ...(audit?.summary.labels ?? {}) }) as Record<string, string>,
    [audit],
  )
  const label = (f: string) => labels[f] ?? f.replace(/_/g, ' ')
  const partyName = audit?.suppliers.find(s => s.party_id === partyId)?.supplier ?? null

  const download = async () => {
    setDownloading(true)
    try {
      await downloadBarcodeAuditCsv({ finding: finding || undefined, partyId: partyId || undefined })
    } catch (e) {
      setError(errorText(e, 'Download failed'))
    } finally {
      setDownloading(false)
    }
  }

  const findings = audit
    ? [...BARCODE_FINDINGS, ...Object.keys(audit.summary.by_finding).filter(k => !(BARCODE_FINDINGS as string[]).includes(k))]
    : BARCODE_FINDINGS

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
          Each title’s barcodes, checked against the barcode types Shopify accepts. A title counts under its worst barcode.
          Suggested corrections are only suggestions: check them against the book.
        </p>
        <button type="button" onClick={download} disabled={downloading}
          className="shrink-0 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          {downloading ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>

      {error && (
        <div role="alert" className="px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">{error}</div>
      )}

      {/* Summary */}
      {audit && (
        <section>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{n(audit.summary.titles)} titles in the catalog</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {findings.map(f => {
              const v = audit.summary.by_finding[f] ?? 0
              const on = finding === f
              return (
                <button key={f} type="button" onClick={() => setFilter('finding', on ? '' : f)} aria-pressed={on}
                  className={`text-left px-3 py-2 rounded-md border transition-colors ${on
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                  <p className="text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{n(v)}</p>
                  <p className="text-[11px] leading-tight text-gray-600 dark:text-gray-300">{label(f)}</p>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Suppliers */}
      {audit && audit.suppliers.length > 0 && (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">By supplier, most work first</h3>
          <div className="overflow-x-auto border rounded-md dark:border-gray-800">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-left text-xs text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Supplier</th>
                  <th className="px-3 py-2 font-semibold text-right">Titles</th>
                  <th className="px-3 py-2 font-semibold text-right">Need work</th>
                  <th className="px-3 py-2 font-semibold">Worst findings</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-800">
                {(allSuppliers ? audit.suppliers : audit.suppliers.slice(0, SUPPLIERS_SHOWN)).map(s => {
                  const on = s.party_id === partyId
                  return (
                    <tr key={s.party_id} className={on ? 'bg-blue-50 dark:bg-blue-900/20' : ''}>
                      <td className="px-3 py-1.5">
                        <button type="button" onClick={() => setFilter('party', on ? '' : s.party_id)}
                          className="text-left text-blue-600 dark:text-blue-400 hover:underline">{s.supplier}</button>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{n(s.total)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{n(s.needs_work)}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300">
                        {BARCODE_FINDINGS.filter(f => f !== 'ok' && (s.by_finding[f] ?? 0) > 0).slice(0, 3)
                          .map(f => `${label(f)} ${n(s.by_finding[f])}`).join(' · ') || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {audit.suppliers.length > SUPPLIERS_SHOWN && (
              <button type="button" onClick={() => setAllSuppliers(v => !v)}
                className="w-full px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 border-t dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900">
                {allSuppliers ? 'Show fewer' : `Show all ${n(audit.suppliers.length)} suppliers`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Items */}
      <section>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Titles</h3>
          {finding && <FilterChip text={label(finding)} onClear={() => setFilter('finding', '')} />}
          {partyId && <FilterChip text={partyName ?? 'One supplier'} onClear={() => setFilter('party', '')} />}
          {partyId && (
            <Link to={`/suppliers?supplier=${encodeURIComponent(partyId)}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Supplier profile →</Link>
          )}
        </div>

        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {!loading && audit && audit.items.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No titles match.</p>}
        {!loading && audit && audit.items.length > 0 && (
          <>
            <ul className="divide-y dark:divide-gray-800 border rounded-md dark:border-gray-800">
              {audit.items.map(it => (
                <li key={it.inventory_item_id} className="px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{it.title ?? 'Untitled'}</p>
                    <Link to={`/suppliers/catalog-gaps?item=${encodeURIComponent(it.inventory_item_id)}`}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Look up →</Link>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {it.supplier ?? '—'}{it.account && ` · ${it.account}`}{it.vendor && ` · vendor ${it.vendor}`} · {statusLabel(it.shopify_status)}
                  </p>
                  <p className="text-xs mt-0.5">
                    <span className="px-1.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{it.finding_label || label(it.finding)}</span>
                  </p>
                  {it.barcodes.length > 0 && (
                    <ul className="mt-1 text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                      {it.barcodes.map((b, i) => (
                        <li key={`${b.value}-${i}`}>
                          <span className="font-mono">{b.value}</span>
                          {' '}· {b.type ? b.type : 'no type'}
                          {b.formats.length > 0 && ` · valid ${b.formats.join(' / ')}`}
                          {b.suggested_type && ` · declare as ${b.suggested_type}`}
                          {b.ambiguous_types && b.ambiguous_types.length > 0 && ` · valid as ${b.ambiguous_types.join(' or ')}`}
                          {b.repair && <> · suggested correction <span className="font-mono">{b.repair.value}</span> ({b.repair.how}{b.repair.suggested_type && `, ${b.repair.suggested_type}`})</>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span>Showing {n(audit.items.length)} of {n(audit.count)}</span>
              {audit.items.length < audit.count && (
                <button type="button" onClick={() => setLimit(l => l + PAGE)} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  Show {n(Math.min(PAGE, audit.count - audit.items.length))} more
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function FilterChip({ text, onClear }: { text: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-xs text-blue-800 dark:text-blue-200">
      {text}
      <button type="button" onClick={onClear} aria-label={`Clear ${text}`} className="leading-none hover:text-blue-600">×</button>
    </span>
  )
}
