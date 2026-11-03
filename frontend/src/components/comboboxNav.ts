// comboboxNav.ts
// Keyboard navigation and mobile visibility for search-as-you-type result lists.
//
// useComboboxNav — Up/Down moves a highlight through the results, skipping
// disabled ones; Enter picks the highlighted result; Escape closes the list.
// The first pickable result is highlighted as soon as results arrive, so typing
// an ISBN and pressing Enter takes the top match. Mouse hover moves the same
// highlight, so keyboard and mouse never disagree about what Enter will pick.
//
// Escape calls preventDefault, and ModalShell ignores an already-handled
// Escape, so the first press closes the list and only a second press closes
// the modal. Keys are left alone when no list is showing.
//
// useRevealOnTouch — on a touch screen the on-screen keyboard covers the lower
// part of the page, which is exactly where a result list drops down. When
// results appear, scroll the search field to the top of its scroll container
// so the list gets the whole space above the keyboard.

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

export function useComboboxNav<T>({
  items,
  open,
  onPick,
  onClose,
  onOpen,
  isDisabled = () => false,
}: {
  items: T[]
  /** Whether the result list is currently showing. */
  open: boolean
  onPick: (item: T) => void
  /** Hide the list (Escape). */
  onClose: () => void
  /** Show a hidden list again (Up/Down while closed). Optional. */
  onOpen?: () => void
  isDisabled?: (item: T) => boolean
}) {
  const [active, setActive] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  // Highlight the first pickable result whenever the result set changes.
  useEffect(() => {
    setActive(open ? items.findIndex(i => !isDisabled(i)) : -1)
    // isDisabled is read fresh; re-running only on new results is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, open])

  // Keep the highlighted option visible inside a scrolling list.
  useEffect(() => {
    if (active < 0) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const move = (dir: 1 | -1) => {
    const n = items.length
    let i = active
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n
      if (!isDisabled(items[i])) { setActive(i); return }
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (items.length === 0) return
      e.preventDefault()
      if (!open) { onOpen?.(); return }
      move(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter') {
      const item = active >= 0 ? items[active] : undefined
      if (open && item !== undefined && !isDisabled(item)) {
        e.preventDefault()
        onPick(item)
      }
    } else if (e.key === 'Escape') {
      if (open && items.length > 0) {
        e.preventDefault()
        onClose()
      }
    }
  }

  /** Spread onto each option element. */
  const optionProps = (i: number) => ({
    'data-option-index': i,
    role: 'option' as const,
    'aria-selected': i === active,
    onMouseEnter: () => { if (!isDisabled(items[i])) setActive(i) },
  })

  return { active, onKeyDown, listRef, optionProps }
}

export function useRevealOnTouch(anchorRef: RefObject<HTMLElement | null>, show: boolean) {
  useEffect(() => {
    if (!show) return
    if (!window.matchMedia?.('(pointer: coarse)').matches) return
    const raf = requestAnimationFrame(() => {
      anchorRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [show, anchorRef])
}
