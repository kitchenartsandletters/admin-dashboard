// src/supply-chain/receiving/POSearchModal.tsx
// Search results for the receiving screen, shown in a modal.
//
// Why a modal rather than filtering the table
// -------------------------------------------
// Search used to re-fetch receipt history with a `search` param and replace the
// main table's contents. Two problems with that:
//
//   1. It could only ever find POs that had already been received, because
//      receipt history is keyed on receipts. A PO you were looking for *because*
//      it hadn't arrived yet was invisible — the one case where you most want
//      to search.
//   2. Clearing the box refetched everything, so the table flickered between
//      two datasets and the status-filter tabs silently re-counted underneath.
//
// This searches purchase orders instead, so every PO is findable, and it leaves
// the table alone. Matches TransfersSearch: type, wait, look at results, click
// one to open it.
//
// Empty is not the same as broken
// -------------------------------
// A failed request must never render as "No results found" — "nothing matched"
// and "the search didn't run" are different answers and only one of them means
// stop looking. `searched` only becomes true on a successful response.

import { useEffect, useRef, useState } from 'react'
import { fetchPurchaseOrders } from '../../api/supplyChainApi'
import type { PurchaseOrder } from '../purchase-orders/purchaseOrderTypes'

const MIN_CHARS = 2
const DEBOUNCE_MS = 300
const RESULT_LIMIT = 50

interface Props {
  query: string
  onClose: () => void
  /** Open this PO's detail. The modal closes first. */
  onSelect: (poId: string) => void
}

const STATUS_PILL: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  confirmed: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  partial:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  received:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

const shortDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function POSearchModal({ query, onClose, onSelect }: Props) {
  const [hits, setHits] = useState<PurchaseOrder[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // fetchPurchaseOrders does not accept an AbortSignal, so in-flight requests
  // cannot be cancelled the way TransfersSearch cancels its own. A sequence
  // number gives the same guarantee where it matters: a slow early response
  // can never overwrite a faster later one.
  const seqRef = useRef(0)

  useEffect(() => {
    const needle = query.trim()
    if (needle.length < MIN_CHARS) {
      setHits([]); setSearched(false); setError(null); setSearching(false)
      return
    }

    const timer = setTimeout(() => {
      const seq = ++seqRef.current
      setSearching(true); setError(null)

      fetchPurchaseOrders({ search: needle, limit: RESULT_LIMIT })
        .then(rows => {
          if (seq !== seqRef.current) return
          setHits(rows); setSearched(true)
        })
        .catch(e => {
          if (seq !== seqRef.current) return
          setError(e instanceof Error ? e.message : 'Search failed')
          setHits([]); setSearched(false)
        })
        .finally(() => { if (seq === seqRef.current) setSearching(false) })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tooShort = query.trim().length < MIN_CHARS

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-3xl w-full max-h-[70vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b dark:border-gray-700 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              Purchase orders matching &ldquo;{query.trim()}&rdquo;
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {searching
                ? 'Searching…'
                : searched
                  ? `${hits.length} result${hits.length === 1 ? '' : 's'}${hits.length >= RESULT_LIMIT ? ' (first 50)' : ''}`
                  : 'All purchase orders, received or not'}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {searching && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            <button
              onClick={onClose}
              className="text-sm px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto">
          {error && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">Search failed</p>
              <p className="text-xs text-gray-400 mt-1">{error}</p>
              <p className="text-xs text-gray-400 mt-2">
                This is not the same as no results — nothing was searched.
              </p>
            </div>
          )}

          {!error && tooShort && (
            <div className="px-4 py-8 text-center text-xs text-gray-400">
              Keep typing — at least {MIN_CHARS} characters.
            </div>
          )}

          {/* Only after a response that actually came back. */}
          {!error && !tooShort && searched && hits.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">No results found</p>
              <p className="text-xs text-gray-400 mt-1">
                Nothing matches &ldquo;{query.trim()}&rdquo; in PO number, supplier or reference.
              </p>
            </div>
          )}

          {!error && hits.length > 0 && (
            <div className="divide-y dark:divide-gray-800">
              {hits.map(po => (
                <button
                  key={po.id}
                  onClick={() => { onClose(); onSelect(po.id) }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-gray-700 dark:text-gray-300 shrink-0">
                        {po.po_number}
                      </span>
                      {po.is_test && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 uppercase shrink-0">
                          Test
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-900 dark:text-gray-100 truncate">
                      {po.supplier_name ?? po.account_label}
                    </div>
                    {po.informal_ref && (
                      <div className="text-[11px] font-mono text-gray-400 truncate">
                        ref: {po.informal_ref}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <span className="text-[11px] text-gray-400 whitespace-nowrap hidden sm:inline">
                      sent {shortDate(po.ordered_at ?? po.created_at)}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${STATUS_PILL[String(po.status)] ?? STATUS_PILL.draft}`}>
                      {po.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
