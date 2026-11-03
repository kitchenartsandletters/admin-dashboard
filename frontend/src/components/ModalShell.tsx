// ModalShell.tsx
// Shared modal frame: backdrop, header, scrolling body, pinned footer.
// Use this for every new modal, and migrate old ones onto it.
//
// Why it exists — the mobile bug. Modals were built as
//   fixed inset-0 with vertical padding  >  panel capped at 90 vh  >  footer
// `vh` resolves to the LARGE viewport (browser chrome hidden). With the address
// bar showing, a 90vh panel plus padding is taller than the visible area, the
// container clips it, and the footer — with the submit button — sits below the
// screen where it cannot be scrolled to. Receiving on a phone hit this daily.
//
// The fix is `svh`, the SMALL viewport (chrome showing), so the panel always
// fits. Not `dvh`: dvh tracks the chrome as it hides and shows, so the panel
// resizes mid-scroll and the modal jumps. svh is stable; at worst there is a
// little spare space below the panel when chrome is hidden.
//
// Safe-area insets are included so this stays correct if index.html ever adds
// viewport-fit=cover. Without it (today) env() resolves to 0 and costs nothing.
//
// Stacking. Each ModalShell reads its nesting level from context and takes the
// next layer in lib/zIndex.ts, so a modal opened from inside another modal's
// children lands above it without anyone choosing a number. Render a nested
// modal *inside* the parent's <ModalShell> children for this to work; pass
// `level` only to override. Escape closes only the topmost modal.
//
// Closing. x, Escape, backdrop click and any `requestClose` from the render
// prop fade out, then call onClose. When `dismissible` is false (e.g. while
// saving) all of those are ignored. `onBeforeClose` can veto any of them, e.g.
// to confirm discarding entered work. A parent may also simply unmount it.
//
// Escape that something else already handled (e.preventDefault(), as
// RightSidebar does in the capture phase) is ignored, so one press closes one
// layer. Overlays opened from inside a modal read `useModalLevel()` to stack
// above it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { MODAL_LAYERS, MAX_MODAL_LEVEL } from '../lib/zIndex'

const FADE_MS = 200

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
} as const

export type ModalSize = keyof typeof SIZE_CLASS

// Nesting level of the nearest enclosing ModalShell; -1 outside any modal.
const ModalLevelContext = createContext(-1)

/** Nesting level of the enclosing ModalShell, or -1 when not inside one. */
export function useModalLevel(): number {
  return useContext(ModalLevelContext)
}

// Open modals in mount order. Escape is handled only by the last one.
const openStack: string[] = []

// Body scroll lock, reference-counted across nested modals.
let lockCount = 0
let savedOverflow = ''
function lockBody() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount++
}
function unlockBody() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) document.body.style.overflow = savedOverflow
}

export interface ModalShellProps {
  /** Header title. Also labels the dialog for screen readers. */
  title: ReactNode
  /** Small line under the title, e.g. the current wizard step. */
  subtitle?: ReactNode
  /** Pinned strip between header and body, e.g. a step bar. Supplies its own padding. */
  subheader?: ReactNode
  /** Called after the fade-out, once the user has dismissed the modal. */
  onClose: () => void
  /** Body content. Scrolls when taller than the space available. */
  children: ReactNode | ((api: { requestClose: () => void }) => ReactNode)
  /** Pinned below the body; never scrolls out of reach. Usually the actions. */
  footer?: ReactNode | ((api: { requestClose: () => void }) => ReactNode)
  /** Extra content in the header, left of the close button. */
  headerExtra?: ReactNode
  size?: ModalSize
  /** False blocks x / Escape / backdrop (e.g. while a save is in flight). */
  dismissible?: boolean
  /** Backdrop click closes. Off for forms where a stray tap would lose work. */
  closeOnBackdrop?: boolean
  /** Return false to keep the modal open, e.g. after a declined discard prompt. */
  onBeforeClose?: () => boolean
  /** Element to focus on open. Defaults to the panel itself. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Override the automatic nesting level. Rarely needed. */
  level?: number
}

export default function ModalShell({
  title,
  subtitle,
  subheader,
  onClose,
  children,
  footer,
  headerExtra,
  size = 'md',
  dismissible = true,
  closeOnBackdrop = false,
  onBeforeClose,
  initialFocusRef,
  level,
}: ModalShellProps) {
  const parentLevel = useContext(ModalLevelContext)
  const myLevel = Math.min(level ?? parentLevel + 1, MAX_MODAL_LEVEL)
  const layer = MODAL_LAYERS[myLevel]

  const id = useId()
  const titleId = `${id}-title`
  const panelRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const closingRef = useRef(false)

  // Latest props without re-running effects.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const dismissibleRef = useRef(dismissible)
  dismissibleRef.current = dismissible
  const onBeforeCloseRef = useRef(onBeforeClose)
  onBeforeCloseRef.current = onBeforeClose

  const requestClose = useCallback(() => {
    if (!dismissibleRef.current || closingRef.current) return
    if (onBeforeCloseRef.current && !onBeforeCloseRef.current()) return
    closingRef.current = true
    setVisible(false)
    window.setTimeout(() => onCloseRef.current(), FADE_MS)
  }, [])

  // Mount: register, lock scroll, fade in, focus; restore focus on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    openStack.push(id)
    lockBody()
    const raf = requestAnimationFrame(() => {
      setVisible(true)
      const target = initialFocusRef?.current ?? panelRef.current
      target?.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(raf)
      const i = openStack.lastIndexOf(id)
      if (i !== -1) openStack.splice(i, 1)
      unlockBody()
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
    // initialFocusRef is read once, on open, by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Escape: topmost modal only.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (openStack[openStack.length - 1] !== id) return
      e.stopPropagation()
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, requestClose])

  const api = { requestClose }
  const body = typeof children === 'function' ? children(api) : children
  const foot = typeof footer === 'function' ? footer(api) : footer
  const fade = `transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`

  return createPortal(
    <ModalLevelContext.Provider value={myLevel}>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm ${layer.backdrop} ${fade}`}
        onClick={closeOnBackdrop ? requestClose : undefined}
      />

      {/* Positioner. Padding includes safe-area insets; the panel's max-height
          subtracts exactly the same amounts, measured against svh. */}
      <div
        className={`fixed inset-0 ${layer.panel} flex items-start justify-center overflow-hidden
          px-3 sm:px-4
          pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-[calc(2rem+env(safe-area-inset-top))]
          pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(2rem+env(safe-area-inset-bottom))]
          ${fade}`}
        onClick={closeOnBackdrop ? e => { if (e.target === e.currentTarget) requestClose() } : undefined}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`w-full ${SIZE_CLASS[size]} flex flex-col outline-none
            bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl
            max-h-[calc(100svh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]
            sm:max-h-[calc(100svh-4rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]`}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b dark:border-gray-800 shrink-0">
            <div className="flex-1 min-w-0">
              <h2 id={titleId} className="truncate font-bold text-gray-900 dark:text-white text-lg">
                {title}
              </h2>
              {subtitle != null && (
                <p className="truncate text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>
              )}
            </div>
            {headerExtra}
            <button
              type="button"
              onClick={requestClose}
              disabled={!dismissible}
              aria-label="Close"
              className="-mr-1 p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>

          {subheader != null && <div className="shrink-0">{subheader}</div>}

          {/* Body — min-h-0 lets it shrink and scroll inside the flex column. */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4">
            {body}
          </div>

          {/* Footer — shrink-0 keeps it pinned and on screen. */}
          {foot != null && (
            <div className="shrink-0 px-4 sm:px-5 py-3 sm:py-4 border-t dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
              {foot}
            </div>
          )}
        </div>
      </div>
    </ModalLevelContext.Provider>,
    document.body
  )
}
