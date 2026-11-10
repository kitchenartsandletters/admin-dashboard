import type { IntlSoloState } from './intlSolo'

interface IntlSoloBadgeProps {
  state: IntlSoloState | undefined
  className?: string
}

const STYLE: Record<string, { label: string; cls: string; help: string }> = {
  restricted: {
    label: '🌐 Intl solo',
    cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
    help: 'International orders containing this title may contain only this title.',
  },
  restricted_past_pub: {
    label: '🌐 Intl solo · past pub',
    cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
    help: 'Pub date has passed and no stock has arrived, so the title stays restricted internationally. Clear it once stock is guaranteed.',
  },
  early_arrival_review: {
    label: '🌐 Intl solo · review',
    cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
    help: 'Stock arrived before the pub date. Decide whether to clear the international restriction.',
  },
  ready_to_clear: {
    label: '🌐 Intl · ready to clear',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    help: 'Stock has arrived. Clear the international restriction when ready.',
  },
  pending_restriction: {
    label: '🌐 Intl pending',
    cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400',
    help: 'A preorder with no international decision recorded yet. It will be restricted automatically.',
  },
}

function details(s: IntlSoloState): string {
  const parts: string[] = []
  if (s.basis && s.state) {
    parts.push(`${s.state === 'cleared' ? 'Cleared' : 'Restricted'} (${s.basis.replace('_', ' ')})`)
  }
  if (s.reason) parts.push(`Reason: ${s.reason}`)
  if (s.changed_by) parts.push(`By: ${s.changed_by}`)
  return parts.join('\n')
}

// Shown on titles under, or due a decision about, the international cart
// restriction. Renders nothing for cleared or not-applicable titles unless the
// Shopify tag has drifted from the recorded decision.
export default function IntlSoloBadge({ state, className = '' }: IntlSoloBadgeProps) {
  if (!state) return null
  const style = STYLE[state.display_state]
  const drift = state.drift
  if (!style && !drift) return null

  const extra = details(state)
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {style && (
        <span
          title={[style.help, extra].filter(Boolean).join('\n\n')}
          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold whitespace-nowrap ${style.cls}`}
        >
          {style.label}
        </span>
      )}
      {drift && (
        <span
          title={
            drift === 'tag_missing'
              ? 'Recorded as restricted, but the Shopify product is missing the intl-solo tag, so checkout is NOT enforcing it.'
              : 'The Shopify product has the intl-solo tag, but no restriction is recorded. Checkout is enforcing it anyway.'
          }
          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold whitespace-nowrap bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
        >
          ⚠ {drift === 'tag_missing' ? 'Tag missing' : 'Unexpected tag'}
        </span>
      )}
    </span>
  )
}
