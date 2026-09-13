// src/supply-chain/receiving/ReceivingExceptions.tsx
// The "Needs attention" tab of the Awaiting receipt pane.
//
// Two kinds of row, and the difference matters:
//
//   damage_unresolved — damaged copies were recorded and nobody ever said what
//                       happened to them. Resolvable right here: credit, or
//                       replacement pending.
//   over_accounted    — more units are accounted against the line than were
//                       ordered. NOT resolvable here. A replacement copy and an
//                       over-shipment are identical in the data, so the only
//                       honest action is to go look at the PO.
//
// Offering a resolve button on an over-accounted line would invite someone to
// paper over a counting error with a credit, which is how the original problem
// compounded. Those rows send you to the PO screen instead.
//
// Note there is no /purchase-orders/:id route — PO detail opens in a sidebar
// owned by its screen, not a URL — so "Find in POs" lands on the list and the
// row shows the PO number to search for. Deep-linking a route that does not
// exist would silently hit the catch-all redirect.
//
// Presentational — the parent owns the fetch, so the pane can know whether it
// has anything to show before deciding whether to render at all.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { resolveDamage } from '../../api/supplyChainApi'
import type { ReceivingException } from '../../api/attentionApi'
import type { DamageResolution } from './receivingTypes'

interface Props {
  items: ReceivingException[]
  /** Called after a successful resolution so the parent can refetch. */
  onResolved: () => void
}

const BUCKET_PILL: Record<string, string> = {
  over_accounted: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  damage_unresolved: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
}

const BUCKET_LABEL: Record<string, string> = {
  over_accounted: 'Over-accounted',
  damage_unresolved: 'Damage unresolved',
}

export default function ReceivingExceptions({ items, onResolved }: Props) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function resolve(poLineId: string, resolution: DamageResolution) {
    setBusy(poLineId)
    setError(null)
    try {
      await resolveDamage(poLineId, resolution)
      onResolved()
    } catch (e) {
      // Surface the failure on the row rather than clearing it. A row that
      // quietly disappears on a failed write is the worst outcome here.
      setError(e instanceof Error ? e.message : 'Could not save that resolution')
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-gray-400">
        Nothing outstanding — every damaged line has been resolved.
      </div>
    )
  }

  return (
    <div className="divide-y dark:divide-gray-800">
      {error && (
        <div className="px-4 py-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20">
          {error}
        </div>
      )}

      {items.map(item => {
        const isOpen = expanded === item.po_line_id
        const isBusy = busy === item.po_line_id
        const canResolve = item.severity === 'decide'

        return (
          <div key={item.po_line_id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase shrink-0 ${BUCKET_PILL[item.bucket]}`}>
                    {BUCKET_LABEL[item.bucket] ?? item.bucket}
                  </span>
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {item.title ?? item.isbn ?? 'Unknown title'}
                  </span>
                </div>

                <div className="mt-1 text-[11px] text-gray-400 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-mono">{item.po_number ?? '—'}</span>
                  <span className="tabular-nums">
                    {item.quantity_received} received
                    {item.quantity_damaged > 0 && <> · {item.quantity_damaged} damaged</>}
                    {item.quantity_cancelled > 0 && <> · {item.quantity_cancelled} cancelled</>}
                    {' '}of {item.quantity_ordered} ordered
                  </span>
                  {item.over_by > 0 && (
                    <span className="text-rose-600 dark:text-rose-400 font-medium">
                      {item.over_by} over
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {canResolve ? (
                  <button
                    onClick={() => setExpanded(isOpen ? null : item.po_line_id)}
                    className="text-xs font-medium text-blue-500 whitespace-nowrap hover:underline"
                  >
                    {isOpen ? 'Cancel' : 'Resolve'}
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/purchase-orders')}
                    className="text-xs font-medium text-blue-500 whitespace-nowrap hover:underline"
                  >
                    Find in POs &rarr;
                  </button>
                )}
              </div>
            </div>

            <div className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              {item.message}
            </div>

            {isOpen && canResolve && (
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  disabled={isBusy}
                  onClick={() => resolve(item.po_line_id, 'credit')}
                  className="text-xs px-2.5 py-1.5 rounded border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  Credited
                </button>
                <button
                  disabled={isBusy}
                  onClick={() => resolve(item.po_line_id, 'replacement_pending')}
                  className="text-xs px-2.5 py-1.5 rounded border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  Replacement coming
                </button>
                {isBusy && <span className="text-[11px] text-gray-400">Saving…</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
