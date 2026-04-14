// SupplierDetailSidebar.tsx
// Follows the PreorderDetailSidebar pattern: slide-in, ESC to close,
// backdrop blur, DetailItem + SectionHeader components.
import React, { useEffect, useRef, useState } from 'react'
import { SupplierDetail, SUPPLIER_ROLE_LABELS, ORDERING_METHOD_LABELS, CONTACT_ROLE_LABELS } from './supplierTypes'

interface Props {
  detail: SupplierDetail | null
  onClose: () => void
  onEdit: () => void
}

// ---------------------------------------------------------------------------
// Reusable primitives (mirrors PreorderDetailSidebar inline components)
// ---------------------------------------------------------------------------

const DetailItem = ({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | number | null | undefined
  mono?: boolean
}) => (
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
  label,
  color,
}: {
  label: string
  color: 'blue' | 'purple' | 'green' | 'amber' | 'gray' | 'teal'
}) => {
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

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

const SupplierDetailSidebar: React.FC<Props> = ({ detail, onClose, onEdit }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (detail) {
      setShouldRender(true)
      setTimeout(() => {
        setIsVisible(true)
        contentRef.current?.scrollTo(0, 0)
      }, 10)
    } else {
      setIsVisible(false)
      const t = setTimeout(() => setShouldRender(false), 300)
      return () => clearTimeout(t)
    }
  }, [detail])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) handleClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isVisible])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 300)
  }

  if (!shouldRender || !detail) return null

  const { party, accounts, contacts, products, children } = detail
  const primaryAccount = accounts.find(a => a.is_primary) ?? accounts[0]
  const primaryContact = contacts.find(c => c.is_primary) ?? contacts[0]

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[28rem] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 transition-transform duration-300 transform ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white leading-tight">
              {party.name}
            </h3>
            <div className="flex flex-wrap gap-1 mt-1">
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
          <div className="flex items-center gap-3">
            <button
              onClick={onEdit}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit
            </button>
            <button
              onClick={handleClose}
              className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:underline"
            >
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          className="p-5 text-sm space-y-8 overflow-y-auto h-[calc(100%-4.5rem)] pb-10"
        >
          {/* Identity */}
          <section>
            <SectionHeader label="Identity" color="blue" />
            <div className="space-y-3">
              <DetailItem label="Name" value={party.name} />
              {party.legal_name && <DetailItem label="Legal name" value={party.legal_name} />}
              <DetailItem label="Country" value={party.country} />
              <DetailItem label="Website" value={party.website} />
              <DetailItem label="Status" value={party.is_active ? 'Active' : 'Draft (inactive)'} />
            </div>
          </section>

          {/* Terms */}
          <section>
            <SectionHeader label="Terms" color="teal" />
            <div className="space-y-3">
              <DetailItem label="Payment terms" value={party.payment_terms} />
              <DetailItem
                label="Returns"
                value={
                  party.is_returnable === true ? 'Returnable'
                  : party.is_returnable === false ? 'Non-returnable'
                  : undefined
                }
              />
              <DetailItem
                label="Default discount"
                value={party.discount_pct != null ? `${party.discount_pct}%` : undefined}
              />
              {party.notes && (
                <div className="flex flex-col py-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">Notes</span>
                  <p className="text-gray-700 dark:text-gray-300 mt-0.5 text-sm leading-relaxed">{party.notes}</p>
                </div>
              )}
            </div>
          </section>

          {/* Primary ordering account */}
          {primaryAccount && (
            <section>
              <SectionHeader label="Primary Account" color="purple" />
              <div className="space-y-3">
                <DetailItem label="Label" value={primaryAccount.label} />
                <DetailItem label="Account #" value={primaryAccount.account_number} mono />
                <DetailItem
                  label="Ordering method"
                  value={primaryAccount.ordering_method ? ORDERING_METHOD_LABELS[primaryAccount.ordering_method] : undefined}
                />
                <DetailItem label="Ordering email" value={primaryAccount.ordering_email} />
                <DetailItem label="Portal URL" value={primaryAccount.ordering_url} />
                <DetailItem label="Freight terms" value={primaryAccount.freight_terms} />
                {primaryAccount.min_order_amount != null && (
                  <DetailItem
                    label="Min order"
                    value={`${primaryAccount.currency} ${primaryAccount.min_order_amount.toFixed(2)}`}
                  />
                )}
              </div>
            </section>
          )}

          {/* All accounts if more than one */}
          {accounts.length > 1 && (
            <section>
              <SectionHeader label={`All Accounts (${accounts.length})`} color="gray" />
              <div className="space-y-2">
                {accounts.map(acc => (
                  <div
                    key={acc.id}
                    className="rounded-md border dark:border-gray-800 px-3 py-2 bg-gray-50/50 dark:bg-gray-900/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-xs">{acc.label}</span>
                      {acc.is_primary && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-semibold">Primary</span>
                      )}
                    </div>
                    {acc.account_number && (
                      <p className="text-[11px] font-mono text-gray-500 dark:text-gray-500 mt-0.5">{acc.account_number}</p>
                    )}
                    {!acc.is_active && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-600 italic mt-0.5">Inactive</p>
                    )}
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
                <DetailItem
                  label="Role"
                  value={primaryContact.role ? CONTACT_ROLE_LABELS[primaryContact.role] : undefined}
                />
                <DetailItem label="Email" value={primaryContact.email} />
                <DetailItem label="Phone" value={primaryContact.phone} />
              </div>
            </section>
          )}

          {/* All contacts if more than one */}
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
                    {c.email && <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-0.5">{c.email}</p>}
                    {c.phone && <p className="text-[11px] text-gray-500 dark:text-gray-500">{c.phone}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Imprints / children */}
          {children.length > 0 && (
            <section>
              <SectionHeader label={`Imprints / Subsidiaries (${children.length})`} color="amber" />
              <div className="space-y-1">
                {children.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1 border-b dark:border-gray-800 last:border-0">
                    <span className="text-sm text-gray-800 dark:text-gray-200">{c.name}</span>
                    {!c.is_active && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-600 italic">draft</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Product mappings summary */}
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
