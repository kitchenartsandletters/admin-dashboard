// LineEntryModal.tsx
// Quantity entry for one PO line, shared by the PO builder (draft lines held in
// the browser) and the PO detail sidebar (saved lines on submitted POs).
//
// Opens over whatever rendered it. Inside another ModalShell it nests a layer
// up automatically; from the sidebar, which is not a ModalShell, it takes the
// base modal layer, which already sits above the sidebar (lib/zIndex.ts).
//
// Quantity is a text field, not type=number: native spinners can't be styled
// or enlarged, and the − / + buttons replace them. Digits only. Focus selects
// the whole field so typing replaces rather than prepends (the "14" meant as
// "4" bug, supply-chain-service docs/PO_QUANTITY_ENTRY.md §4).
//
// Two callers, two shapes:
//   Builder  — synchronous. onSave updates local state and the builder closes
//              the modal itself. minimum/busy/error are left at their defaults,
//              so the builder behaves exactly as it did before this was shared.
//   Sidebar  — saves to the server. It passes `busy` while the PATCH is in
//              flight (which also blocks closing), `error` for a failure, and
//              `minimum` for the PO line floor. After a 409 it raises `minimum`
//              to the server's minimum_quantity_ordered, which is the only
//              number to clamp to (PO_LINE_AUDIT.md §2).
//
// `minimum` only constrains the field. It never moves the value the operator
// typed: a quantity below it stays visible with "Minimum is N" under it and
// Save disabled, so nobody saves a number they did not enter.

import React, { useRef, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import ModalShell from '../../components/ModalShell'

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
    {children}{required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
)

const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...props}
    rows={2}
    className={`w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 resize-none ${props.className ?? ''}`}
  />
)

export interface LineEntryModalProps {
  mode: 'add' | 'edit'
  title: string
  isbn: string
  initialQty?: number
  initialNotes?: string
  /** Header text. Defaults to "Add line" / "Edit line". */
  heading?: string
  /** Small line under the title and ISBN, e.g. how many are already received. */
  context?: ReactNode
  /** Lowest quantity accepted. Defaults to 1. */
  minimum?: number
  /** Why `minimum` is what it is. Shown under the field when minimum > 1. */
  minimumHint?: string
  /** Show the optional notes field. Defaults to true. */
  allowNotes?: boolean
  /** Offer an optional reason, passed to onSave. Defaults to false. */
  askReason?: boolean
  /** A save is in flight: buttons disabled, closing blocked. */
  busy?: boolean
  /** A save failed. Shown above the footer. */
  error?: string | null
  /** notes is '' when allowNotes is false; reason is '' when not asked or left blank. */
  onSave: (qty: number, notes: string, reason: string) => void | Promise<void>
  onClose: () => void
}

export default function LineEntryModal({
  mode,
  title,
  isbn,
  initialQty,
  initialNotes,
  heading,
  context,
  minimum = 1,
  minimumHint,
  allowNotes = true,
  askReason = false,
  busy = false,
  error = null,
  onSave,
  onClose,
}: LineEntryModalProps) {
  const [qtyText, setQtyText] = useState(initialQty != null ? String(initialQty) : '')
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [notesOpen, setNotesOpen] = useState(!!initialNotes)
  const [reason, setReason] = useState('')
  const [reasonOpen, setReasonOpen] = useState(false)
  const qtyRef = useRef<HTMLInputElement>(null)
  // When the field was last focused; see onMouseUp.
  const focusedAt = useRef(0)

  const min = Math.max(1, Math.floor(minimum))
  const qty = /^\d+$/.test(qtyText) ? parseInt(qtyText, 10) : NaN
  const whole = Number.isInteger(qty)
  const valid = whole && qty >= min

  // Select now and again next frame: some mobile browsers undo a selection
  // made inside the focus event. On desktop, the mouseup ending the click that
  // focused the field would collapse the selection to a caret, so that one
  // mouseup is cancelled (onMouseUp below).
  const selectAll = (el: HTMLInputElement) => {
    focusedAt.current = performance.now()
    el.select()
    requestAnimationFrame(() => el.select())
  }
  const bump = (d: number) => setQtyText(String(Math.max(min, (whole ? qty : 0) + d)))
  const save = () => {
    if (valid && !busy) void onSave(qty, allowNotes ? notes.trim() : '', askReason ? reason.trim() : '')
  }
  // − / + must not take focus from the field: the arrow keys keep working
  // after a click, and on a phone the keyboard stays up between taps.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  const stepBtn = `h-12 w-12 shrink-0 flex items-center justify-center rounded-md border
    border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200
    hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 disabled:opacity-30 transition`

  const saveLabel = busy ? 'Saving…' : mode === 'add' ? 'Add line' : 'Save'

  return (
    <ModalShell
      title={heading ?? (mode === 'add' ? 'Add line' : 'Edit line')}
      size="sm"
      onClose={onClose}
      dismissible={!busy}
      initialFocusRef={qtyRef}
      footer={({ requestClose }) => (
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={requestClose} disabled={busy}
            className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!valid || busy}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]">
            {saveLabel}
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
          <p className="text-xs text-gray-400 font-mono">{isbn}</p>
          {context != null && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{context}</p>
          )}
        </div>

        <div>
          <Label required>Quantity</Label>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Decrease quantity" onClick={() => bump(-1)}
              onMouseDown={keepFocus} disabled={busy || !whole || qty <= min} className={stepBtn}>
              <Minus className="w-5 h-5" />
            </button>
            <input
              ref={qtyRef}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint="done"
              aria-label="Quantity"
              placeholder="Qty"
              value={qtyText}
              disabled={busy}
              onChange={e => setQtyText(e.target.value.replace(/\D/g, '').slice(0, 5))}
              onFocus={e => selectAll(e.currentTarget)}
              onMouseUp={e => {
                if (performance.now() - focusedAt.current < 600) { e.preventDefault(); focusedAt.current = 0 }
              }}
              onBlur={() => { focusedAt.current = 0 }}
              onKeyDown={e => {
                if (e.key === 'Enter')     { e.preventDefault(); save() }
                if (e.key === 'ArrowUp')   { e.preventDefault(); bump(1) }
                if (e.key === 'ArrowDown') { e.preventDefault(); if (whole && qty > min) bump(-1) }
              }}
              className="h-12 flex-1 min-w-0 px-3 text-center text-2xl font-semibold tabular-nums border rounded-md
                         bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600
                         focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-base placeholder:font-normal placeholder:text-gray-300
                         disabled:opacity-60"
            />
            <button type="button" aria-label="Increase quantity" onClick={() => bump(1)}
              onMouseDown={keepFocus} disabled={busy} className={stepBtn}>
              <Plus className="w-5 h-5" />
            </button>
          </div>
          {qtyText !== '' && !valid && (
            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
              {whole && min > 1 ? `Minimum is ${min}.` : 'Enter a whole number, 1 or more.'}
            </p>
          )}
          {min > 1 && minimumHint && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{minimumHint}</p>
          )}
        </div>

        {allowNotes && (notesOpen ? (
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        ) : (
          <button type="button" onClick={() => setNotesOpen(true)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            + Add a note
          </button>
        ))}

        {askReason && (reasonOpen ? (
          <div>
            <Label>Reason</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} disabled={busy}
              placeholder="Optional — recorded in the line's change history" maxLength={2000} />
          </div>
        ) : (
          <button type="button" onClick={() => setReasonOpen(true)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            + Add a reason
          </button>
        ))}

        {error && (
          <div className="px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
