// SupplierDetailSidebar.tsx
import React, { useEffect, useRef, useState } from 'react'
import {
  SupplierDetail, SupplierParty,
  SUPPLIER_ROLE_LABELS, ORDERING_METHOD_LABELS, CONTACT_ROLE_LABELS,
} from './supplierTypes'
import { fetchSuppliers, updateSupplier } from '../../api/supplyChainApi'

interface Props {
  detail: SupplierDetail | null
  canGoBack: boolean
  onBack: () => void
  onClose: () => void
  onEdit: () => void
  onNewPO: () => void
  onChildClick?: (party: SupplierParty) => void
  onImprintLinked?: () => void
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const DetailItem = ({
  label, value, mono = false,
}: { label: string; value: string | number | null | undefined; mono?: boolean }) => (
  <div className="flex flex-col py-1 border-b border-gray-50 dark:border-gray-800 last:border-0">
    <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">
      {label}
    </span>
    <span className={`text-gray-900 dark:text-gray-100 mt-0.5 text-sm ${mono ? 'font-mono' : ''}`}>
      {value ?? '—'}
    </span>
  </div>
)

const SectionHeader = ({
  label, color,
}: { label: string; color: 'blue' | 'purple' | 'green' | 'amber' | 'gray' | 'teal' }) => {
  const borders: Record<string, string> = {
    blue:   'border-blue-500',
    purple: 'border-purple-500',
    green:  'border-green-500',
    amber:  'border-amber-500',
    gray:   'border-gray-400',
    teal:   'border-teal-500',
  }
  return (
    <h4 className={`font-bold text-gray-900 dark:text-white uppercase text-[11px] tracking-widest border-l-2 ${borders[color]} pl-2 mb-4`}>
      {label}
    </h4>
  )
}

function getRelationshipType(notes: string | null | undefined): 'imprint' | 'distribution_client' | null {
  if (!notes) return null
  if (notes.startsWith('[IMPRINT]')) return 'imprint'
  if (notes.startsWith('[DISTRIBUTION CLIENT]')) return 'distribution_client'
  return null
}

function RelTypeBadge({ notes }: { notes: string | null | undefined }) {
  const rel = getRelationshipType(notes)
  if (!rel) return null
  if (rel === 'imprint') return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold uppercase tracking-wide">
      Imprint
    </span>
  )
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 font-bold uppercase tracking-wide">
      Dist. client
    </span>
  )
}

// ---------------------------------------------------------------------------
// Link imprint widget
// ---------------------------------------------------------------------------

function LinkImprintWidget({
  parentId, existingChildIds, onLinked,
}: {
  parentId: string
  existingChildIds: Set<string>
  onLinked: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SupplierParty[]>([])
  const [linking, setLinking] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setQuery(''); setResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    fetchSuppliers({ search: query, activeOnly: false })
      .then(r => setResults(r.filter(p => p.id !== parentId && !existingChildIds.has(p.id)).slice(0, 8)))
      .catch(() => {})
  }, [query, parentId, existingChildIds])

  const handleLink = async (child: SupplierParty) => {
    setLinking(true)
    try {
      await updateSupplier(child.id, { parent_id: parentId } as any)
      setQuery(''); setResults([]); setOpen(false)
      onLinked()
    } catch {} finally { setLinking(false) }
  }

  return (
    <div ref={ref} className="relative mt-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 hover:underline">
          + Link imprint or client
        </button>
      ) : (
        <div className="space-y-1">
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search supplier to link…"
            className="w-full px-2 py-1.5 border dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 outline-none" />
          {results.length > 0 && (
            <div className="absolute z-10 left-0 right-0 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded shadow-xl overflow-hidden">
              {results.map(p => (
                <button key={p.id} type="button" disabled={linking}
                  onMouseDown={() => handleLink(p)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 last:border-0 disabled:opacity-50">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                  {p.parent_id && <span className="text-gray-400 ml-1">(already has parent)</span>}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { setOpen(false); setQuery(''); setResults([]) }}
            className="text-xs text-gray-400 hover:underline">Cancel</button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

const SupplierDetailSidebar: React.FC<Props> = ({
  detail, canGoBack, onBack, onClose, onEdit, onNewPO, onChildClick, onImprintLinked,
}) => {
  // isOpen controls the slide animation — only flips when sidebar opens or closes.
  // It does NOT flip when navigating between parties (detail.party.id changes).
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Track whether detail was previously null to detect open/close transitions
  const wasNullRef = useRef(true)

  useEffect(() => {
    const isNull = detail === null
    const wasNull = wasNullRef.current
    wasNullRef.current = isNull

    if (!isNull && wasNull) {
      // Opening: mount then animate in
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setIsOpen(true)))
    } else if (isNull && !wasNull) {
      // Closing: animate out then unmount
      setIsOpen(false)
      const t = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(t)
    }
    // Party swap (both non-null): do nothing to animation state
  }, [detail])

  // Scroll to top on party change
  useEffect(() => {
    if (detail) {
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [detail?.party.id])

  // ESC closes sidebar (modal handles its own ESC separately)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'ArrowLeft' && isOpen && canGoBack) {
        onBack()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [isOpen, canGoBack, onClose, onBack])

  if (!mounted || !detail) return null

  const { party, accounts, contacts, products, children } = detail
  const primaryAccount = accounts.find(a => a.is_primary && a.is_active)
    ?? accounts.find(a => a.is_primary)
    ?? accounts[0]
  const primaryContact = contacts.find(c => c.is_primary) ?? contacts[0]
  const existingChildIds = new Set(children.map(c => c.id))
  const canCreatePO = !!primaryAccount && primaryAccount.is_active && party.is_active

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel — slides in once on open, slides out once on close */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[28rem] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 shrink-0">
          {canGoBack && (
            <button onClick={onBack} title="Back (←)"
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors shrink-0 text-lg">
              ‹
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base text-gray-900 dark:text-white leading-tight truncate">
              {party.name}
            </h3>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {party.roles.map(r => (
                <span key={r} className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  {SUPPLIER_ROLE_LABELS[r]}
                </span>
              ))}
              {party.roles.length === 0 && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">No roles assigned</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canCreatePO && (
              <button onClick={onNewPO}
                className="px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors active:scale-[0.97]">
                + New PO
              </button>
            )}
            <button onClick={onEdit}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Edit
            </button>
            <button onClick={onClose}
              className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:underline">
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-5 space-y-8 pb-10 text-sm">

          {/* Identity */}
          <section>
            <SectionHeader label="Identity" color="blue" />
            <div className="space-y-3">
              <DetailItem label="Name" value={party.name} />
              {party.legal_name && <DetailItem label="Legal name" value={party.legal_name} />}
              <DetailItem label="Country" value={party.country} />
              {party.website && (
                <div className="flex flex-col py-1 border-b border-gray-50 dark:border-gray-800">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">Website</span>
                  <a href={party.website} target="_blank" rel="noopener noreferrer"
                    className="text-blue-500 hover:underline mt-0.5 text-sm truncate">{party.website}</a>
                </div>
              )}
              <DetailItem label="Status" value={party.is_active ? 'Active' : 'Draft (inactive)'} />
              {party.shopify_vendor_codes && party.shopify_vendor_codes.length > 0 && (
                <div className="flex flex-col py-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1.5">Vendor codes</span>
                  <div className="flex flex-wrap gap-1">
                    {party.shopify_vendor_codes.map(code => (
                      <span key={code} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Terms */}
          <section>
            <SectionHeader label="Terms" color="teal" />
            <div className="space-y-3">
              <DetailItem label="Payment terms" value={party.payment_terms} />
              <DetailItem label="Returns"
                value={party.is_returnable === true ? 'Returnable' : party.is_returnable === false ? 'Non-returnable' : undefined} />
              <DetailItem label="Default discount"
                value={party.discount_pct != null ? `${party.discount_pct}%` : undefined} />
              {party.notes && (
                <div className="flex flex-col py-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">Notes</span>
                  <p className="text-gray-700 dark:text-gray-300 mt-0.5 text-sm leading-relaxed whitespace-pre-line">{party.notes}</p>
                </div>
              )}
            </div>
          </section>

          {/* Primary account */}
          {primaryAccount && (
            <section>
              <SectionHeader label="Primary Account" color="purple" />
              <div className="space-y-3">
                <DetailItem label="Label" value={primaryAccount.label} />
                <DetailItem label="Account #" value={primaryAccount.account_number} mono />
                <DetailItem label="Ordering method"
                  value={primaryAccount.ordering_method ? ORDERING_METHOD_LABELS[primaryAccount.ordering_method] : undefined} />
                <DetailItem label="Ordering email" value={primaryAccount.ordering_email} />
                <DetailItem label="Portal URL" value={primaryAccount.ordering_url} />
                <DetailItem label="Ship-from address" value={primaryAccount.ship_from_address} />
                <DetailItem label="Freight terms" value={primaryAccount.freight_terms} />
                {primaryAccount.min_order_amount != null && (
                  <DetailItem label="Min order"
                    value={`${primaryAccount.currency} ${primaryAccount.min_order_amount.toFixed(2)}`} />
                )}
                {primaryAccount.notes && (
                  <div className="flex flex-col py-1">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">Account notes</span>
                    <p className="text-gray-700 dark:text-gray-300 mt-0.5 text-sm leading-relaxed whitespace-pre-line">{primaryAccount.notes}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* All accounts */}
          {accounts.length > 1 && (
            <section>
              <SectionHeader label={`All Accounts (${accounts.length})`} color="gray" />
              <div className="space-y-2">
                {accounts.map(acc => (
                  <div key={acc.id} className="rounded-md border dark:border-gray-800 px-3 py-2 bg-gray-50/50 dark:bg-gray-900/50">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-xs">{acc.label}</span>
                      {acc.is_primary && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-semibold">Primary</span>
                      )}
                    </div>
                    {acc.account_number && <p className="text-[11px] font-mono text-gray-500 mt-0.5">{acc.account_number}</p>}
                    {!acc.is_active && <p className="text-[10px] text-gray-400 italic mt-0.5">Inactive</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Primary contact */}
          {primaryContact && (
            <section>
              <SectionHeader label="Primary Contact" color="green" />
              <div className="space-y-3">
                <DetailItem label="Name" value={primaryContact.name} />
                <DetailItem label="Title" value={primaryContact.title} />
                <DetailItem label="Role"
                  value={primaryContact.role ? CONTACT_ROLE_LABELS[primaryContact.role] : undefined} />
                <DetailItem label="Email" value={primaryContact.email} />
                <DetailItem label="Phone" value={primaryContact.phone} />
              </div>
            </section>
          )}

          {/* All contacts */}
          {contacts.length > 1 && (
            <section>
              <SectionHeader label={`All Contacts (${contacts.length})`} color="gray" />
              <div className="space-y-2">
                {contacts.map(c => (
                  <div key={c.id} className="rounded-md border dark:border-gray-800 px-3 py-2 bg-gray-50/50 dark:bg-gray-900/50">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-xs">{c.name}</span>
                      {c.is_primary && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-semibold">Primary</span>
                      )}
                    </div>
                    {c.email && <p className="text-[11px] text-gray-500 mt-0.5">{c.email}</p>}
                    {c.phone && <p className="text-[11px] text-gray-500">{c.phone}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Imprints & clients */}
          <section>
            <SectionHeader
              label={`Imprints & Clients${children.length > 0 ? ` (${children.length})` : ''}`}
              color="amber"
            />
            {children.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">No imprints or distribution clients linked yet.</p>
            ) : (
              <div className="mb-2">
                {children.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b dark:border-gray-800 last:border-0">
                    <button type="button" onClick={() => onChildClick?.(c)}
                      className="text-sm text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 text-left truncate flex items-center gap-1">
                      <span className="text-gray-300 dark:text-gray-600 text-xs">›</span>
                      {c.name}
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <RelTypeBadge notes={c.notes} />
                      {!c.is_active && <span className="text-[10px] text-gray-400 italic">draft</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <LinkImprintWidget
              parentId={party.id}
              existingChildIds={existingChildIds}
              onLinked={() => onImprintLinked?.()}
            />
          </section>

          {/* Variant mappings */}
          <section>
            <SectionHeader label="Variant Mappings" color="gray" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {products.length === 0
                ? 'No variants mapped to this supplier.'
                : `${products.filter(p => p.is_active).length} active mapping${products.filter(p => p.is_active).length !== 1 ? 's' : ''} across ${accounts.length} account${accounts.length !== 1 ? 's' : ''}.`
              }
            </p>
          </section>
        </div>
      </div>
    </>
  )
}

export default SupplierDetailSidebar
