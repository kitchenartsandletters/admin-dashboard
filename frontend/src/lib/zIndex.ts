// zIndex.ts
// The app's stacking scale. One place to read what sits above what.
//
// Values are full Tailwind class strings, not numbers, so the JIT compiler
// can see them. Never build a z class by string concatenation
// (`z-[${n}]`) — Tailwind cannot detect it and the class will not exist.
//
//   z-10      dropdowns / popovers inside a surface (relative to that surface)
//   z-30      sticky headers inside pages
//   z-40/50   slide-over sidebars: backdrop / panel (e.g. SupplierDetailSidebar)
//   z-60/70   modal, level 0: backdrop / panel
//   z-80/90   modal, level 1 — a modal opened from inside a modal
//   z-100/110 modal, level 2
//   z-200     toasts — above everything, never blocks a modal's controls
//
// Modals must sit strictly above sidebars: at equal z, the later-portaled
// element wins on DOM order and can clip a modal's footer (the original
// SupplierForm bug).
//
// Anything portaled to document.body competes on this scale. Anything rendered
// inside a modal competes only within that modal's stacking context, so an
// in-modal dropdown keeps using z-10.

export const Z = {
  dropdown: 'z-10',
  sticky: 'z-30',
  sidebarBackdrop: 'z-40',
  sidebar: 'z-50',
  toast: 'z-[200]',
} as const

/** Modal layers by nesting level. ModalShell picks the level automatically. */
export const MODAL_LAYERS = [
  { backdrop: 'z-[60]',  panel: 'z-[70]'  },
  { backdrop: 'z-[80]',  panel: 'z-[90]'  },
  { backdrop: 'z-[100]', panel: 'z-[110]' },
] as const

export const MAX_MODAL_LEVEL = MODAL_LAYERS.length - 1
