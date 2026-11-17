// CampaignOrdersTable.tsx
// Every ledger row for a campaign, newest first. Sales are positive rows,
// refunds and cancellations negative ones.
//
// The columns are deliberately the weekly partner report: order reference,
// date, quantity, whether it came back, and where it shipped. Copy as CSV
// hands over exactly that, so the report is never retyped out of this table.
import { useState } from 'react'
import type { AttributionSignal, CampaignOrderRow } from '../../types/campaignTypes'

const SIGNAL_STYLES: Record<AttributionSignal, string> = {
  both:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  property: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  manual:   'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  inferred: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const SIGNAL_TITLES: Record<AttributionSignal, string> = {
  both:     'Line item property and landing site agreed',
  property: 'Line item property present. The normal case',
  manual:   'Operator correction, refund, or cancellation',
  inferred: 'Landing site only, property missing — the template is broken',
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—'

const fmtMoney = (cents: number | null) =>
  cents === null ? '—' : `$${(cents / 100).toFixed(2)}`

interface Props {
  data: CampaignOrderRow[]
  /** Shown in the copied CSV header so the report carries its own context. */
  remaining?: number
}

export default function CampaignOrdersTable({ data, remaining }: Props) {
  const [copied, setCopied] = useState(false)

  const copyCsv = async () => {
    const lines = [
      '# Order,Date,Quantity,Returned,Ships to',
      ...data.map(r =>
        [
          r.order_name ?? r.order_id,
          new Date(r.occurred_at).toISOString().slice(0, 10),
          r.quantity,
          r.is_refund || r.quantity < 0 ? 'yes' : 'no',
          r.ship_state ?? '',
        ].join(',')
      ),
    ]
    if (remaining !== undefined) lines.push(`# Remaining,,${remaining},,`)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Attributed orders
          <span className="ml-2 font-normal text-gray-500 dark:text-gray-400 tabular-nums">
            {data.length}
          </span>
        </h3>
        <button
          onClick={copyCsv}
          disabled={data.length === 0}
          className="text-xs px-2.5 py-1 rounded border dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? 'Copied' : 'Copy as CSV'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {['Order', 'Date', 'Qty', 'Subtotal', 'Ships to', 'Signal'].map(h => (
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
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No attributed orders yet.
                </td>
              </tr>
            )}
            {data.map(row => {
              const returned = row.is_refund || row.quantity < 0
              return (
                <tr
                  key={`${row.order_id}-${row.occurred_at}-${row.quantity}`}
                  className={`even:bg-gray-50/50 dark:even:bg-gray-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors ${
                    returned ? 'text-gray-500 dark:text-gray-400' : ''
                  }`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <a
                      href={row.admin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {row.order_name ?? row.order_id}
                    </a>
                    {returned && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        returned
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(row.occurred_at)}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold">{row.quantity}</td>
                  <td className="px-4 py-3 tabular-nums">{fmtMoney(row.subtotal_cents)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{row.ship_state ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      title={SIGNAL_TITLES[row.signal]}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${SIGNAL_STYLES[row.signal]}`}
                    >
                      {row.signal}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
