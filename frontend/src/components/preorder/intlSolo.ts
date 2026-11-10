// intlSolo.ts
// Client for preorder-service's international cart isolation ("intl-solo")
// endpoints under /admin/preorders/intl-solo. See preorder-service
// docs/intl_solo.md.
//
// The backend derives every title's display state and the actions allowed in
// it (allowed_actions). This file only fetches and posts; it never decides
// eligibility itself, so the UI and the API cannot disagree.

const BASE = import.meta.env.VITE_PREORDER_BASE_URL
const TOKEN = import.meta.env.VITE_PREORDER_ADMIN_TOKEN

export type IntlSoloDisplayState =
  | 'restricted_past_pub'
  | 'early_arrival_review'
  | 'ready_to_clear'
  | 'restricted'
  | 'pending_restriction'
  | 'cleared'
  | 'not_applicable'

export type IntlSoloAction = 'clear_received' | 'clear_guaranteed' | 'restore' | 'force_on'

export interface IntlSoloState {
  product_id: number
  title: string | null
  isbn: string | null
  classification: string | null
  pub_date: string | null
  in_preorder_collection: boolean
  first_positive_inventory_at: string | null
  arrival_date_et: string | null
  state: 'restricted' | 'cleared' | null
  basis: 'auto_preorder' | 'force_on' | 'received' | 'guaranteed' | null
  reason: string | null
  changed_by: string | null
  state_updated_at: string | null
  snapshot_at: string | null
  display_state: IntlSoloDisplayState
  expected_tag: boolean
  tag_present: boolean
  drift: 'tag_missing' | 'tag_unexpected' | null
  allowed_actions: IntlSoloAction[]
}

export interface IntlSoloList {
  today_et: string
  tag: string
  count: number
  summary: Record<string, number>
  products: IntlSoloState[]
}

export class IntlSoloError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Admin-Token': TOKEN,
})

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/admin/preorders/intl-solo${path}`, { ...init, headers: headers() })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.detail
    const message =
      typeof detail === 'string' ? detail
      : typeof detail?.message === 'string' ? detail.message
      : `Request failed (${res.status})`
    throw new IntlSoloError(message, res.status)
  }
  return data as T
}

export function fetchIntlSolo(): Promise<IntlSoloList> {
  return request<IntlSoloList>('')
}

/** Run one action. Reason is required by the backend for every action here. */
export function runIntlSoloAction(
  productId: number,
  action: IntlSoloAction,
  reason: string,
  changedBy: string | null,
) {
  const body = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ reason, changed_by: changedBy, ...extra })
  switch (action) {
    case 'clear_received':
      return request(`/${productId}/clear`, { method: 'POST', body: body({ basis: 'received' }) })
    case 'clear_guaranteed':
      return request(`/${productId}/clear`, { method: 'POST', body: body({ basis: 'guaranteed' }) })
    case 'restore':
      return request(`/${productId}/restore`, { method: 'POST', body: body() })
    case 'force_on':
      return request(`/${productId}/force-on`, { method: 'POST', body: body() })
  }
}

export const ACTION_LABEL: Record<IntlSoloAction, string> = {
  clear_received: 'Clear — stock received',
  clear_guaranteed: 'Clear — stock guaranteed',
  restore: 'Restore restriction',
  force_on: 'Restrict internationally',
}

export const ACTION_HELP: Record<IntlSoloAction, string> = {
  clear_received:
    'Stock has arrived. Removes the intl-solo tag, so international customers can order this title with other items.',
  clear_guaranteed:
    'Stock has not arrived yet but is guaranteed. Removes the intl-solo tag now, so international customers can order this title with other items.',
  restore:
    'Undoes a clearance. Adds the intl-solo tag back, so international customers must order this title on its own again.',
  force_on:
    'Restricts a title that is not a preorder. Adds the intl-solo tag, so international customers must order it on its own.',
}

/** States an operator should act on: a decision is due, or the tag drifted. */
export function needsIntlDecision(s: IntlSoloState): boolean {
  return (
    s.display_state === 'restricted_past_pub' ||
    s.display_state === 'early_arrival_review' ||
    s.display_state === 'ready_to_clear' ||
    s.drift != null
  )
}

/** Currently restricted, or about to be (pending the auto-tag). */
export function isIntlRestricted(s: IntlSoloState | undefined): boolean {
  return !!s && s.expected_tag
}
