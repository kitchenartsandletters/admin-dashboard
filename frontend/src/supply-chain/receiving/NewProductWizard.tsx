// NewProductWizard.tsx
// Product creation wizard — embedded in ReceivingEntryFlow.
// Replaces the standalone EdelweissWizardPage approach.
//
// Accepts prefill data from the packing slip (isbn, title, unit_cost, supplier).
// Two modes:
//   'edelweiss' — full record from scraper (Phase 3, not yet wired)
//   'manual'    — staff fill in what the packing slip doesn't have
//
// On completion, calls onCreated() with the new product's IDs so
// ReceivingEntryFlow can add it as a PO line.
//
// The 5-call Shopify sequence is identical to EdelweissWizard.tsx.
// This file can replace EdelweissWizard.tsx entirely.

import React, { useState, useCallback } from 'react'
import { fetchSuppliers } from '../../api/supplyChainApi'
import { SupplierParty } from '../suppliers/supplierTypes'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HQ_LOCATION_ID       = 'gid://shopify/Location/40052293765'
const PRINT_BOOKS_CATEGORY = 'gid://shopify/TaxonomyCategory/me-1-3'
const DEFAULT_WEIGHT_LBS   = 1.0
const DEFAULT_LANGUAGE_TAG = 'Ln_En'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewProductPrefill {
  isbn:           string
  title:          string
  unit_cost:      string
  supplier_party: SupplierParty | null
}

interface WizardForm {
  title:           string
  isbn:            string
  format:          string
  pub_date:        string
  description:     string
  author_name:     string
  cover_image_url: string
  price:           string
  unit_cost:       string
  weight:          string
  language_tag:    string
  inventory_policy: 'DENY' | 'CONTINUE'
  selected_party:  SupplierParty | null
}

type WizardStep = 'form' | 'review' | 'executing' | 'done' | 'error'

interface StepResult {
  step: number
  label: string
  status: 'pending' | 'running' | 'done' | 'error' | 'warning'
  detail?: string
}

// ---------------------------------------------------------------------------
// Helpers (from Edelweiss spec)
// ---------------------------------------------------------------------------

function authorSku(name: string): string {
  return name.trim()
}

function formatTag(format: string): string {
  const map: Record<string, string> = {
    Hardcover: 'C', Paperback: 'P', Flexibound: 'F',
    'Spiral bound': 'S', 'Board book': 'B',
  }
  return map[format] ?? 'P'
}

function bindingLabel(format: string): string {
  const map: Record<string, string> = {
    Hardcover: 'Hardcover', Paperback: 'Paperback', Flexibound: 'Flexibound',
    'Spiral bound': 'Spiral Bound', 'Board book': 'Board Book',
  }
  return map[format] ?? 'Paperback'
}

function pubDateTag(isoDate: string): string {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  return `${m}-${d}-${y}`
}

function missingFields(form: WizardForm): string[] {
  const missing: string[] = []
  if (!form.cover_image_url) missing.push('cover image')
  if (!form.description)     missing.push('description')
  missing.push('collections') // always a post-publish step
  return missing
}

async function shopifyGraphQL(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<{ data: Record<string, unknown>; errors?: unknown[] }> {
  const baseUrl = import.meta.env.VITE_SC_BASE_URL as string ?? ''
  const res = await fetch(`${baseUrl}/api/shopify/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Proxy error ${res.status}: ${text}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
    {children}{required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
)

const Field = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 ${props.className ?? ''}`}
  />
)

// ---------------------------------------------------------------------------
// Vendor picker
// ---------------------------------------------------------------------------

function VendorPicker({
  value,
  onChange,
}: {
  value: SupplierParty | null
  onChange: (p: SupplierParty | null) => void
}) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [results, setResults] = useState<SupplierParty[]>([])
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  React.useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    fetchSuppliers({ search: query, activeOnly: true })
      .then(r => setResults(r.slice(0, 8))).catch(() => {})
  }, [query])

  const vendorCode = value?.shopify_vendor_codes?.[0] ?? null

  return (
    <div ref={ref} className="relative">
      <Label required>Vendor / Supplier</Label>
      <Field
        value={value ? value.name : query}
        onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search active suppliers…"
      />
      {value && vendorCode && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">
            {vendorCode}
          </span>
          <span className="text-xs text-gray-400">Shopify vendor string</span>
          <button type="button" onClick={() => { onChange(null); setQuery('') }}
            className="text-xs text-gray-400 hover:text-red-500 ml-auto">✕</button>
        </div>
      )}
      {open && results.length > 0 && !value && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow-xl overflow-hidden">
          {results.map(p => (
            <button key={p.id} type="button"
              onMouseDown={() => { onChange(p); setQuery(p.name); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 last:border-0">
              <span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
              {p.shopify_vendor_codes?.[0] && (
                <span className="text-xs font-mono text-gray-400 ml-2">{p.shopify_vendor_codes[0]}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step tracker
// ---------------------------------------------------------------------------

function StepTracker({ steps }: { steps: StepResult[] }) {
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
            ${s.status === 'done'     ? 'bg-green-500 text-white'
            : s.status === 'running'  ? 'bg-blue-500 text-white animate-pulse'
            : s.status === 'error'    ? 'bg-red-500 text-white'
            : s.status === 'warning'  ? 'bg-amber-400 text-white'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
            {s.status === 'done' ? '✓' : s.status === 'error' ? '✕' : s.status === 'warning' ? '!' : s.step}
          </div>
          <div>
            <span className={`font-medium
              ${s.status === 'done'    ? 'text-green-700 dark:text-green-300'
              : s.status === 'running' ? 'text-blue-700 dark:text-blue-300'
              : s.status === 'error'   ? 'text-red-700 dark:text-red-300'
              : s.status === 'warning' ? 'text-amber-700 dark:text-amber-300'
              : 'text-gray-400 dark:text-gray-600'}`}>
              {s.label}
            </span>
            {s.detail && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">{s.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

interface Props {
  prefill: NewProductPrefill
  onCreated: (
    productId: string,
    inventoryItemId: string,
    variantId: string,
    title: string,
    missingFields: string[],
  ) => void
  onCancel: () => void
}

const FORMAT_OPTIONS = ['Paperback', 'Hardcover', 'Flexibound', 'Spiral bound', 'Board book']

export default function NewProductWizard({ prefill, onCreated, onCancel }: Props) {
  const [wizardStep, setWizardStep] = useState<WizardStep>('form')
  const [error, setError] = useState<string | null>(null)

  const [steps, setSteps] = useState<StepResult[]>([
    { step: 1, label: 'Create product shell',   status: 'pending' },
    { step: 2, label: 'Set price & ISBN',        status: 'pending' },
    { step: 3, label: 'Set weight',              status: 'pending' },
    { step: 4, label: 'Activate at HQ',          status: 'pending' },
    { step: 5, label: 'Attach cover image',      status: 'pending' },
    { step: 6, label: 'Add to supply chain',     status: 'pending' },
  ])

  const updateStep = (i: number, patch: Partial<StepResult>) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))

  const [form, setForm] = useState<WizardForm>({
    title:            prefill.title,
    isbn:             prefill.isbn,
    format:           'Paperback',
    pub_date:         new Date().toISOString().slice(0, 10),
    description:      '',
    author_name:      '',
    cover_image_url:  '',
    price:            '',
    unit_cost:        prefill.unit_cost,
    weight:           String(DEFAULT_WEIGHT_LBS),
    language_tag:     DEFAULT_LANGUAGE_TAG,
    inventory_policy: 'DENY',
    selected_party:   prefill.supplier_party,
  })

  const setF = (patch: Partial<WizardForm>) => setForm(prev => ({ ...prev, ...patch }))

  // Vendor policy: new products use full publisher name as Shopify vendor field.
  // Legacy codes are for reference only — not used as the vendor on new products.
  const vendorCode = form.selected_party?.shopify_vendor_codes?.[0] ?? ''
  const vendorName = form.selected_party?.name ?? ''

  // Derived fields
  const fTag = formatTag(form.format)
  const bLabel = bindingLabel(form.format)
  const pdTag = pubDateTag(form.pub_date)
  const sku = authorSku(form.author_name)

  // ---------------------------------------------------------------------------
  // Execute
  // ---------------------------------------------------------------------------

  const execute = useCallback(async () => {
    setWizardStep('executing')
    setError(null)

    let productId = '', variantId = '', inventoryItemId = ''

    // Step 1: productCreate
    updateStep(0, { status: 'running' })
    try {
      const tags = [fTag, form.language_tag, pdTag].filter(Boolean)
      const { data } = await shopifyGraphQL(`
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id status
              variants(first: 1) {
                edges { node { id inventoryItem { id } } }
              }
            }
            userErrors { field message }
          }
        }
      `, {
        input: {
          title:           form.title,
          descriptionHtml: form.description || undefined,
          vendor:          vendorName || undefined,  // full name per vendor policy
          productType:     'BOOK',
          status:          'DRAFT',
          tags,
          category:        PRINT_BOOKS_CATEGORY,
          metafields: [
            { namespace: 'custom', key: 'binding',  value: bLabel,          type: 'single_line_text_field' },
            { namespace: 'custom', key: 'language', value: '["English"]',   type: 'list.single_line_text_field' },
            ...(sku   ? [{ namespace: 'custom', key: 'author',   value: sku,            type: 'single_line_text_field' }] : []),
            ...(form.pub_date ? [{ namespace: 'custom', key: 'pub_date', value: form.pub_date, type: 'date' }] : []),
          ],
        },
      })

      const pc = data.productCreate as any
      if (pc.userErrors?.length) throw new Error(pc.userErrors.map((e: any) => e.message).join(', '))
      productId       = pc.product.id
      variantId       = pc.product.variants.edges[0].node.id
      inventoryItemId = pc.product.variants.edges[0].node.inventoryItem.id
      updateStep(0, { status: 'done', detail: productId })
    } catch (e) {
      updateStep(0, { status: 'error', detail: String(e) })
      setError(`Step 1 failed: ${e}`)
      setWizardStep('error')
      return
    }

    // Step 2: productVariantsBulkUpdate
    updateStep(1, { status: 'running' })
    try {
      const { data } = await shopifyGraphQL(`
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id }
            userErrors { field message }
          }
        }
      `, {
        productId,
        variants: [{
          id: variantId,
          price: form.price,
          inventoryPolicy: form.inventory_policy,
          inventoryItem: {
            sku: sku || undefined,
            barcode: form.isbn || undefined,
          },
        }],
      })
      const pv = data.productVariantsBulkUpdate as any
      if (pv.userErrors?.length) throw new Error(pv.userErrors.map((e: any) => e.message).join(', '))
      updateStep(1, { status: 'done' })
    } catch (e) {
      updateStep(1, { status: 'error', detail: String(e) })
      setError(`Step 2 failed: ${e}`)
      setWizardStep('error')
      return
    }

    // Step 3: inventoryItemUpdate (weight) — non-blocking
    updateStep(2, { status: 'running' })
    try {
      const { data } = await shopifyGraphQL(`
        mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            inventoryItem { id }
            userErrors { field message }
          }
        }
      `, {
        id: inventoryItemId,
        input: { measurement: { weight: { value: parseFloat(form.weight) || DEFAULT_WEIGHT_LBS, unit: 'POUNDS' } } },
      })
      const iiu = data.inventoryItemUpdate as any
      updateStep(2, iiu.userErrors?.length
        ? { status: 'warning', detail: 'Weight not set — fix in Shopify admin' }
        : { status: 'done' })
    } catch (e) {
      updateStep(2, { status: 'warning', detail: 'Weight call failed — set manually' })
    }

    // Step 4: inventoryActivate
    updateStep(3, { status: 'running' })
    try {
      const idempotencyKey = crypto.randomUUID()
      const { data } = await shopifyGraphQL(`
        mutation inventoryActivate($idempotencyKey: String!) {
          inventoryActivate(
            inventoryItemId: "${inventoryItemId}",
            locationId: "${HQ_LOCATION_ID}"
          ) @idempotent(key: $idempotencyKey) {
            inventoryLevel { id }
            userErrors { field message }
          }
        }
      `, { idempotencyKey })
      const ia = data.inventoryActivate as any
      if (ia.userErrors?.length) throw new Error(ia.userErrors.map((e: any) => e.message).join(', '))
      updateStep(3, { status: 'done' })
    } catch (e) {
      updateStep(3, { status: 'error', detail: String(e) })
      setError(`Step 4 failed: ${e}. Product created but inventory not tracked — activate manually in Shopify.`)
      setWizardStep('error')
      return
    }

    // Step 5: productCreateMedia — non-blocking
    updateStep(4, { status: 'running' })
    if (form.cover_image_url) {
      try {
        const { data } = await shopifyGraphQL(`
          mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
            productCreateMedia(productId: $productId, media: $media) {
              mediaUserErrors { field message }
            }
          }
        `, {
          productId,
          media: [{ originalSource: form.cover_image_url, mediaContentType: 'IMAGE', alt: form.title }],
        })
        const pcm = data.productCreateMedia as any
        updateStep(4, pcm.mediaUserErrors?.length
          ? { status: 'warning', detail: 'Cover image not attached — upload manually' }
          : { status: 'done' })
      } catch {
        updateStep(4, { status: 'warning', detail: 'Cover image failed — upload manually' })
      }
    } else {
      updateStep(4, { status: 'warning', detail: 'No cover image provided — upload manually in Shopify' })
    }

    // Step 6: supplier_products INSERT
    updateStep(5, { status: 'running' })
    if (form.selected_party) {
      try {
        const scBaseUrl = import.meta.env.VITE_SC_BASE_URL as string
        const scToken   = import.meta.env.VITE_SC_ADMIN_TOKEN as string

        const acctRes = await fetch(`${scBaseUrl}/api/suppliers/${form.selected_party.id}`, {
          headers: { 'X-Admin-Token': scToken },
        })
        if (!acctRes.ok) throw new Error('Could not load supplier accounts')
        const acctData = await acctRes.json()
        const primaryAccount = acctData.accounts?.find((a: any) => a.is_primary && a.is_active)
          ?? acctData.accounts?.[0]
        if (!primaryAccount) throw new Error('No active account')

        const insertRes = await fetch(`${scBaseUrl}/api/suppliers/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': scToken },
          body: JSON.stringify({
            account_id:          primaryAccount.id,
            inventory_item_id:   inventoryItemId,
            variant_id:          variantId,
            isbn:                form.isbn || null,
            title:               form.title,
            vendor:              vendorName || null,  // full name per vendor policy
            unit_cost:           form.unit_cost ? parseFloat(form.unit_cost) : null,
            is_primary_supplier: true,
            is_active:           true,
          }),
        })
        if (!insertRes.ok) throw new Error(`HTTP ${insertRes.status}`)
        updateStep(5, { status: 'done' })
      } catch (e) {
        updateStep(5, { status: 'warning', detail: `Supabase insert failed: ${e}. Product GID: ${productId}` })
      }
    } else {
      updateStep(5, { status: 'warning', detail: 'No supplier selected — insert manually' })
    }

    setWizardStep('done')
    onCreated(productId, inventoryItemId, variantId, form.title, missingFields(form))
  }, [form, vendorCode, fTag, bLabel, pdTag, sku, onCreated])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-gray-950">
      <div className="max-w-2xl mx-auto py-8 px-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-bold text-xl text-gray-900 dark:text-white">Create New Product</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {prefill.isbn && `ISBN: ${prefill.isbn}`}
              {prefill.isbn && prefill.title && ' · '}
              {prefill.title}
            </p>
          </div>
          {(wizardStep === 'form' || wizardStep === 'error') && (
            <button onClick={onCancel} className="text-sm text-gray-500 hover:underline">
              Cancel
            </button>
          )}
        </div>

        {/* Form step */}
        {wizardStep === 'form' && (
          <div className="space-y-5">

            {/* Auto-filled from slip */}
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 border-l-2 border-blue-500 pl-2 mb-3">
                From packing slip
              </h3>
              <div className="space-y-3">
                <div>
                  <Label required>Title</Label>
                  <Field value={form.title} onChange={e => setF({ title: e.target.value })} autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>ISBN-13</Label>
                    <Field value={form.isbn} onChange={e => setF({ isbn: e.target.value })} placeholder="9780000000000" />
                  </div>
                  <div>
                    <Label>Format</Label>
                    <select value={form.format} onChange={e => setF({ format: e.target.value })}
                      className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none">
                      {FORMAT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Pub date</Label>
                    <Field type="date" value={form.pub_date} onChange={e => setF({ pub_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>Author name</Label>
                    <Field value={form.author_name} onChange={e => setF({ author_name: e.target.value })} placeholder="Davide Risso" />
                  </div>
                </div>
                <div>
                  <Label>Cover image URL</Label>
                  <Field value={form.cover_image_url} onChange={e => setF({ cover_image_url: e.target.value })} placeholder="https://…" />
                </div>
                <div>
                  <Label>Description</Label>
                  <textarea value={form.description} onChange={e => setF({ description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none resize-y" />
                </div>
              </div>
            </section>

            {/* Supplier */}
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 border-l-2 border-purple-500 pl-2 mb-3">
                Supplier
              </h3>
              <div className="space-y-3">
                <VendorPicker value={form.selected_party} onChange={p => setF({ selected_party: p })} />
                <div>
                  <Label>Unit cost (what KAL pays)</Label>
                  <Field type="number" min={0} step={0.01} value={form.unit_cost}
                    onChange={e => setF({ unit_cost: e.target.value })} placeholder="0.00" />
                </div>
              </div>
            </section>

            {/* Pricing */}
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 border-l-2 border-green-500 pl-2 mb-3">
                Pricing & Inventory
              </h3>
              <div className="space-y-3">
                <div>
                  <Label required>Retail price ($)</Label>
                  <Field type="number" min={0} step={0.01} value={form.price}
                    onChange={e => setF({ price: e.target.value })} placeholder="29.99" />
                </div>
                <div>
                  <Label>Inventory policy</Label>
                  <div className="flex gap-2 mt-1">
                    {(['DENY', 'CONTINUE'] as const).map(pol => (
                      <button key={pol} type="button" onClick={() => setF({ inventory_policy: pol })}
                        className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors
                          ${form.inventory_policy === pol
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>
                        {pol === 'DENY' ? 'Deny overselling' : 'Allow overselling'}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Use CONTINUE for direct/author titles.</p>
                </div>
                <div>
                  <Label>Weight (lbs)</Label>
                  <Field type="number" min={0} step={0.1} value={form.weight}
                    onChange={e => setF({ weight: e.target.value })} />
                </div>
              </div>
            </section>

            <div className="flex gap-3 pt-2">
              <button onClick={onCancel}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                Cancel
              </button>
              <button
                onClick={() => setWizardStep('review')}
                disabled={!form.title || !form.price}
                className="flex-1 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                Review →
              </button>
            </div>
          </div>
        )}

        {/* Review step */}
        {wizardStep === 'review' && (
          <div className="space-y-5">
            <div className="border dark:border-gray-700 rounded-lg overflow-hidden text-sm">
              {[
                ['Title',             form.title],
                ['ISBN-13',           form.isbn || '—'],
                ['Format',            `${form.format} → tag: ${fTag}`],
                ['Author (SKU)',       sku || '—'],
                ['Pub date tag',      pdTag || '—'],
                ['Shopify vendor',    vendorName || '—'],
            ['Legacy code',       vendorCode || '—'],
                ['Retail price',      `$${form.price}`],
                ['Unit cost',         form.unit_cost ? `$${form.unit_cost}` : '—'],
                ['Inventory policy',  form.inventory_policy],
                ['Weight',            `${form.weight} lbs`],
                ['Status',            'DRAFT'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between px-4 py-2.5 border-b dark:border-gray-800 last:border-0">
                  <span className="text-gray-500 dark:text-gray-400 shrink-0 w-36">{label}</span>
                  <span className="text-gray-900 dark:text-gray-100 text-right">{value}</span>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
              ⚠ After creation: add collections and publish in Shopify admin.
              {!form.cover_image_url && ' No cover image — upload manually.'}
              {!form.description && ' No description — add manually.'}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setWizardStep('form')}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                ← Back
              </button>
              <button onClick={execute}
                className="flex-1 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
                Create product
              </button>
            </div>
          </div>
        )}

        {/* Executing / done / error */}
        {(wizardStep === 'executing' || wizardStep === 'done' || wizardStep === 'error') && (
          <div className="space-y-5">
            <StepTracker steps={steps} />
            {error && (
              <div className="px-3 py-2.5 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}
            {wizardStep === 'done' && (
              <div className="px-3 py-2 rounded-md bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                Product created — returning to receiving flow.
              </div>
            )}
            {wizardStep === 'error' && (
              <button onClick={onCancel}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                Return without creating
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
