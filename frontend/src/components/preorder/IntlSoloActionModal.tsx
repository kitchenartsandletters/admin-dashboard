import { useEffect, useRef, useState } from 'react'
import ModalShell from '../ModalShell'
import { useAuth } from '../../auth/AuthProvider'
import { useStaff } from '../../auth/StaffProvider'
import {
  ACTION_HELP,
  ACTION_LABEL,
  IntlSoloError,
  runIntlSoloAction,
  type IntlSoloAction,
  type IntlSoloState,
} from './intlSolo'

interface IntlSoloActionModalProps {
  target: IntlSoloState
  /** Display title, from the products list when the intl row has none. */
  title: string
  onClose: () => void
  /** Called once after a successful action; the modal then closes itself. */
  onDone: (message: string) => void
}

// Clear or restore a title's international restriction. The actions offered
// are exactly the backend's allowed_actions for the title's current state.
// A reason is required for every action and is stored with the decision.
export default function IntlSoloActionModal({ target, title, onClose, onDone }: IntlSoloActionModalProps) {
  const { user } = useAuth()
  const { activeStaff } = useStaff()
  const changedBy = activeStaff?.name ?? user?.email ?? null

  const actions = target.allowed_actions
  const [action, setAction] = useState<IntlSoloAction | null>(actions.length === 1 ? actions[0] : null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  // ModalShell hands requestClose to its render props; keep the latest here.
  const requestCloseRef = useRef<() => void>(() => {})

  const canSubmit = !!action && reason.trim().length > 0 && !busy && !done

  // Close after a success. This has to wait for the render where busy is
  // false: ModalShell ignores requestClose while dismissible is false, and
  // dismissible only flips on the next render. Calling requestClose straight
  // after setBusy(false) was a no-op, which left the modal open.
  useEffect(() => {
    if (done && !busy) requestCloseRef.current()
  }, [done, busy])

  const submit = async () => {
    if (!action || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await runIntlSoloAction(target.product_id, action, reason.trim(), changedBy)
      onDone(`${ACTION_LABEL[action]}: ${title}`)
      setDone(true)
      setBusy(false)
    } catch (e) {
      // 409: state changed since this page loaded. 502: Shopify refused the
      // tag write; the message says which side, if any, was recorded.
      setError(e instanceof IntlSoloError ? e.message : 'Something went wrong. Nothing may have changed; refresh and check.')
      setBusy(false)
    }
  }

  const arrival = target.arrival_date_et
  return (
    <ModalShell
      title="International restriction"
      subtitle={title}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      initialFocusRef={actions.length === 1 ? reasonRef : undefined}
      footer={({ requestClose }) => {
        requestCloseRef.current = requestClose
        return (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            className="px-3.5 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="px-3.5 py-2 rounded-lg text-white text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? 'Working…' : done ? 'Done' : action ? ACTION_LABEL[action] : 'Choose an action'}
          </button>
        </div>
        )
      }}
    >
      {() => (
        <div className="space-y-4 text-sm">
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
            <div>Pub date: {target.pub_date ?? '—'}</div>
            <div>Stock received: {arrival ?? 'not yet'}</div>
            {target.reason && <div>Last decision: {target.reason}{target.changed_by ? ` (${target.changed_by})` : ''}</div>}
          </div>

          {actions.length > 1 ? (
            <fieldset className="space-y-2">
              <legend className="font-medium mb-1">Action</legend>
              {actions.map((a) => (
                <label key={a} className="flex items-start gap-2 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <input
                    type="radio"
                    name="intl-solo-action"
                    className="mt-0.5"
                    checked={action === a}
                    onChange={() => setAction(a)}
                    disabled={busy}
                  />
                  <span>
                    <span className="font-medium block">{ACTION_LABEL[a]}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{ACTION_HELP[a]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : action ? (
            <p className="text-gray-600 dark:text-gray-300">{ACTION_HELP[action]}</p>
          ) : null}

          <div>
            <label htmlFor="intl-solo-reason" className="font-medium block mb-1">
              Reason <span className="text-red-600">*</span>
            </label>
            <textarea
              id="intl-solo-reason"
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
              }}
              rows={3}
              disabled={busy}
              placeholder={action === 'clear_guaranteed' ? 'e.g. Distributor confirmed delivery on Nov 20' : 'Why?'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Saved with the decision{changedBy ? ` as ${changedBy}` : ''}. Takes effect at checkout immediately.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5">
              {error}
            </p>
          )}
        </div>
      )}
    </ModalShell>
  )
}
