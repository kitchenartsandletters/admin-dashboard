// EdelweissWizard.tsx
// Product creation wizard for new titles from Edelweiss records.
// Implements the 5-call Shopify sequence + 1 Supabase insert per the spec:
//   Call 1: productCreate         → shell + metafields
//   Call 2: productVariantsBulkUpdate → price, ISBN, SKU, inventory policy
//   Call 3: inventoryItemUpdate   → weight (removed from variants in 2026-04)
//   Call 4: inventoryActivate     → activate at HQ location
//   Call 5: productCreateMedia    → attach cover image from Edelweiss URL
//   Call 6: supplier_products INSERT → link to supply-chain account
//
// All calls go through POST /api/shopify/graphql (dashboard proxy).
// Proxy must be mounted in backend/app/main.py before this wizard works.
//
// Usage: drop into a route and pass an Edelweiss record from the scraper.

import React, { useEffect, useState, useCallback } from 'react'
import { fetchSuppliers } from '../api/supplyChainApi'
import { SupplierParty } from '../supply-chain/suppliers/supplierTypes'

// ---------------------------------------------------------------------------
// Constants (from spec)
// ---------------------------------------------------------------------------

const HQ_LOCATION_ID       = 'gid://shopify/Location/40052293765'
const PRINT_BOOKS_CATEGORY = 'gid://shopify/TaxonomyCategory/me-1-3'
const DEFAULT_WEIGHT_LBS   = 1.0
const DEFAULT_LANGUAGE_TAG = 'Ln_En'
const SHOPIFY_API_VERSION  = '2026-04'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EdelweissRecord {
  title: string
  format: string
  isbn13: string
  pub_date: string          // YYYY-MM-DD
  pub_date_raw: string
  publisher: string
  description: string       // HTML, may contain MUI wrappers
  contributors: Array<{ name: string; role: string }>
  cover_image_url: string
  edelweiss_url: string
  scrape_warnings: string[]
}

interface WizardState {
  // User-editable fields
  price: string
  unitCost: string
  inventoryPolicy: 'DENY' | 'CONTINUE'
  weight: string
  languageTag: string
  selectedParty: SupplierParty | null
  // Derived / read-only from record
  title: string
  descriptionHtml: string
  isbn: string
  formatTag: string
  bindingLabel: string
  pubDateTag: string
  authorSku: string
  authorMetafield: string
}

interface CreatedIds {
  productId: string
  variantId: string
  inventoryItemId: string
}

type WizardStep = 'form' | 'review' | 'executing' | 'done' | 'error'

interface StepResult {
  step: number
  label: string
  status: 'pending' | 'running' | 'done' | 'error' | 'warning'
  detail?: string
}

// ---------------------------------------------------------------------------
// Transformation helpers (from spec)
// ---------------------------------------------------------------------------

function cleanEdelweissHtml(raw: string): string {
  if (typeof document === 'undefined') return raw
  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')
  const outer = doc.querySelector('.MuiBox-root')
  if (!outer) return raw
  const inner = outer.querySelector('div')
  if (!inner) return outer.innerHTML
  return inner.innerHTML.trim()
}

const FORMAT_TAG_MAP: Record<string, string> = {
  'Hardcover':    'C',
  'Paperback':    'P',
  'Flexibound':   'F',
  'Spiral bound': 'S',
  'Board book':   'B',
}

const FORMAT_BINDING_MAP: Record<string, string> = {
  'Hardcover':    'Hardcover',
  'Paperback':    'Paperback',
  'Flexibound':   'Flexibound',
  'Spiral bound': 'Spiral Bound',
  'Board book':   'Board Book',
}

function formatTag(format: string): string {
  return FORMAT_TAG_MAP[format] ?? 'P'
}

function bindingLabel(format: string): string {
  return FORMAT_BINDING_MAP[format] ?? 'Paperback'
}

function pubDateTag(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${m}-${d}-${y}`
}

function deriveAuthorSku(contributors: Array<{ name: string; role: string }>): string {
  const authors = contributors.filter(c => c.role === 'Author')
  if (authors.length === 0) return ''
  if (authors.length === 1) return authors[0].name
  if (authors.length === 2) return `${authors[0].name}, ${authors[1].name}`
  return `${authors[0].name} et al.`
}

function deriveAuthorMetafield(contributors: Array<{ name: string; role: string }>): string {
  const authors = contributors.filter(c => c.role === 'Author')
  return authors.map(a => a.name).join(', ')
}

function deriveNonAuthors(contributors: Array<{ name: string; role: string }>): typeof contributors {
  return contributors.filter(c => c.role !== 'Author')
}

// ---------------------------------------------------------------------------
// Proxy call helper
// ---------------------------------------------------------------------------

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
// Wizard form field components
// ---------------------------------------------------------------------------

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mb-1">
    {children}{required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
)

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 ${props.className ?? ''}`}
  />
)

const ReadOnly = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col py-1.5 border-b dark:border-gray-800 last:border-0">
    <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">{label}</span>
    <span className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{value || '—'}</span>
  </div>
)

// ---------------------------------------------------------------------------
// Vendor search
// ---------------------------------------------------------------------------

function VendorPicker({
  value,
  onChange,
}: {
  value: SupplierParty | null
  onChange: (p: SupplierParty | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SupplierParty[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    fetchSuppliers({ search: query, activeOnly: true })
      .then(r => setResults(r.slice(0, 8)))
      .catch(() => {})
  }, [query])

  const vendorCode = value?.shopify_vendor_codes?.[0] ?? null

  return (
    <div className="relative">
      <Label required>Vendor / Supplier</Label>
      <Input
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
          <button
            type="button"
            onClick={() => { onChange(null); setQuery('') }}
            className="text-xs text-gray-400 hover:text-red-500 ml-auto"
          >
            ✕
          </button>
        </div>
      )}
      {!value && vendorCode === null && value !== null && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          This supplier has no vendor codes — the Shopify vendor field will be blank.
        </p>
      )}
      {open && results.length > 0 && !value && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow-xl overflow-hidden">
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => { onChange(p); setQuery(p.name); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 last:border-0"
            >
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
// Execution step tracker
// ---------------------------------------------------------------------------

function StepTracker({ steps }: { steps: StepResult[] }) {
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
            ${s.status === 'done'    ? 'bg-green-500 text-white'
            : s.status === 'running' ? 'bg-blue-500 text-white animate-pulse'
            : s.status === 'error'   ? 'bg-red-500 text-white'
            : s.status === 'warning' ? 'bg-amber-400 text-white'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}
          >
            {s.status === 'done' ? '✓'
              : s.status === 'error' ? '✕'
              : s.status === 'warning' ? '!'
              : s.step}
          </div>
          <div>
            <span className={`font-medium
              ${s.status === 'done'    ? 'text-green-700 dark:text-green-300'
              : s.status === 'running' ? 'text-blue-700 dark:text-blue-300'
              : s.status === 'error'   ? 'text-red-700 dark:text-red-300'
              : s.status === 'warning' ? 'text-amber-700 dark:text-amber-300'
              : 'text-gray-400 dark:text-gray-600'}`}
            >
              {s.label}
            </span>
            {s.detail && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.detail}</p>
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
  record: EdelweissRecord
  onClose: () => void
  onCreated: (productId: string) => void
}

export default function EdelweissWizard({ record, onClose, onCreated }: Props) {
  const [wizardStep, setWizardStep] = useState<WizardStep>('form')
  const [error, setError] = useState<string | null>(null)
  const [createdIds, setCreatedIds] = useState<CreatedIds | null>(null)

  const [steps, setSteps] = useState<StepResult[]>([
    { step: 1, label: 'Create product shell',   status: 'pending' },
    { step: 2, label: 'Set price & ISBN',        status: 'pending' },
    { step: 3, label: 'Set weight',              status: 'pending' },
    { step: 4, label: 'Activate at HQ',          status: 'pending' },
    { step: 5, label: 'Attach cover image',      status: 'pending' },
    { step: 6, label: 'Add to supply chain',     status: 'pending' },
  ])

  const updateStep = (index: number, patch: Partial<StepResult>) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s))
  }

  // Form state
  const [form, setForm] = useState<WizardState>({
    price:             '',
    unitCost:          '',
    inventoryPolicy:   'DENY',
    weight:            String(DEFAULT_WEIGHT_LBS),
    languageTag:       DEFAULT_LANGUAGE_TAG,
    selectedParty:     null,
    title:             record.title,
    descriptionHtml:   cleanEdelweissHtml(record.description),
    isbn:              record.isbn13,
    formatTag:         formatTag(record.format),
    bindingLabel:      bindingLabel(record.format),
    pubDateTag:        pubDateTag(record.pub_date),
    authorSku:         deriveAuthorSku(record.contributors),
    authorMetafield:   deriveAuthorMetafield(record.contributors),
  })

  const setF = (patch: Partial<WizardState>) => setForm(prev => ({ ...prev, ...patch }))

  const nonAuthors = deriveNonAuthors(record.contributors)
  const vendorCode = form.selectedParty?.shopify_vendor_codes?.[0] ?? ''

  // ---------------------------------------------------------------------------
  // Execute the 6-step sequence
  // ---------------------------------------------------------------------------

  const execute = useCallback(async () => {
    setWizardStep('executing')
    setError(null)

    let productId = ''
    let variantId = ''
    let inventoryItemId = ''

    // ── Step 1: productCreate ────────────────────────────────────────────────
    updateStep(0, { status: 'running' })
    try {
      const tags = [form.formatTag, form.languageTag, form.pubDateTag]
      const { data } = await shopifyGraphQL(`
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              status
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
          descriptionHtml: form.descriptionHtml,
          vendor:          vendorCode,
          productType:     'BOOK',
          status:          'DRAFT',
          tags,
          category:        PRINT_BOOKS_CATEGORY,
          metafields: [
            { namespace: 'custom', key: 'binding',  value: form.bindingLabel,       type: 'single_line_text_field' },
            { namespace: 'custom', key: 'language', value: '["English"]',            type: 'list.single_line_text_field' },
            { namespace: 'custom', key: 'author',   value: form.authorMetafield,     type: 'single_line_text_field' },
            { namespace: 'custom', key: 'pub_date', value: record.pub_date,          type: 'date' },
          ],
        },
      })

      const pc = data.productCreate as any
      if (pc.userErrors?.length) throw new Error(pc.userErrors.map((e: any) => e.message).join(', '))

      productId       = pc.product.id
      variantId       = pc.product.variants.edges[0].node.id
      inventoryItemId = pc.product.variants.edges[0].node.inventoryItem.id

      setCreatedIds({ productId, variantId, inventoryItemId })
      updateStep(0, { status: 'done', detail: productId })
    } catch (e) {
      updateStep(0, { status: 'error', detail: String(e) })
      setError(`Step 1 failed: ${e}. Product not created — safe to retry.`)
      setWizardStep('error')
      return
    }

    // ── Step 2: productVariantsBulkUpdate ────────────────────────────────────
    updateStep(1, { status: 'running' })
    try {
      const { data } = await shopifyGraphQL(`
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id price inventoryPolicy inventoryItem { sku } }
            userErrors { field message }
          }
        }
      `, {
        productId: productId,
        variants: [{
          id:              variantId,
          price:           form.price,
          inventoryPolicy: form.inventoryPolicy,
          inventoryItem: {
            sku:     form.authorSku,
            barcode: form.isbn,
          },
        }],
      })

      const pv = data.productVariantsBulkUpdate as any
      if (pv.userErrors?.length) throw new Error(pv.userErrors.map((e: any) => e.message).join(', '))
      updateStep(1, { status: 'done' })
    } catch (e) {
      updateStep(1, { status: 'error', detail: String(e) })
      setError(`Step 2 failed: ${e}. Product shell exists (${productId}) — note this ID for manual cleanup if needed.`)
      setWizardStep('error')
      return
    }

    // ── Step 3: inventoryItemUpdate (weight) ─────────────────────────────────
    updateStep(2, { status: 'running' })
    try {
      const { data } = await shopifyGraphQL(`
        mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            inventoryItem { id measurement { weight { value unit } } }
            userErrors { field message }
          }
        }
      `, {
        id: inventoryItemId,
        input: {
          measurement: {
            weight: { value: parseFloat(form.weight) || DEFAULT_WEIGHT_LBS, unit: 'POUNDS' },
          },
        },
      })

      const iiu = data.inventoryItemUpdate as any
      if (iiu.userErrors?.length) {
        // Non-blocking — log as warning, continue
        updateStep(2, { status: 'warning', detail: `Weight not set: ${iiu.userErrors[0].message}. Fix manually in Shopify admin.` })
      } else {
        updateStep(2, { status: 'done' })
      }
    } catch (e) {
      // Non-blocking warning
      updateStep(2, { status: 'warning', detail: `Weight call failed: ${e}. Set manually in Shopify admin.` })
    }

    // ── Step 4: inventoryActivate ─────────────────────────────────────────────
    updateStep(3, { status: 'running' })
    try {
      const idempotencyKey = crypto.randomUUID()
      const { data } = await shopifyGraphQL(`
        mutation inventoryActivate($idempotencyKey: String!) {
          inventoryActivate(
            inventoryItemId: "${inventoryItemId}",
            locationId: "${HQ_LOCATION_ID}"
          ) @idempotent(key: $idempotencyKey) {
            inventoryLevel {
              id
              quantities(names: ["available"]) { name quantity }
            }
            userErrors { field message }
          }
        }
      `, { idempotencyKey })

      const ia = data.inventoryActivate as any
      if (ia.userErrors?.length) throw new Error(ia.userErrors.map((e: any) => e.message).join(', '))
      updateStep(3, { status: 'done' })
    } catch (e) {
      updateStep(3, { status: 'error', detail: String(e) })
      setError(`Step 4 failed: ${e}. Product created but inventory not tracked at HQ. Activate manually in Shopify Admin → Products → [this product] → Inventory.`)
      setWizardStep('error')
      return
    }

    // ── Step 5: productCreateMedia (cover image) ──────────────────────────────
    updateStep(4, { status: 'running' })
    try {
      const { data } = await shopifyGraphQL(`
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media { ... on MediaImage { id image { url } } }
            mediaUserErrors { field message }
          }
        }
      `, {
        productId: productId,
        media: [{
          originalSource:    record.cover_image_url,
          mediaContentType:  'IMAGE',
          alt:               form.title,
        }],
      })

      const pcm = data.productCreateMedia as any
      if (pcm.mediaUserErrors?.length) {
        updateStep(4, { status: 'warning', detail: 'Cover image not attached — upload manually.' })
      } else {
        updateStep(4, { status: 'done' })
      }
    } catch (e) {
      updateStep(4, { status: 'warning', detail: `Cover image failed: ${e}. Upload manually in Shopify admin.` })
    }

    // ── Step 6: supplier_products INSERT ─────────────────────────────────────
    updateStep(5, { status: 'running' })
    if (!form.selectedParty) {
      updateStep(5, { status: 'warning', detail: 'No supplier selected — insert supplier_products manually.' })
    } else {
      try {
        const scBaseUrl = import.meta.env.VITE_SC_BASE_URL as string
        const scToken   = import.meta.env.VITE_SC_ADMIN_TOKEN as string

        // Get the primary account for the selected party
        const acctRes = await fetch(
          `${scBaseUrl}/api/suppliers/${form.selectedParty.id}`,
          { headers: { 'X-Admin-Token': scToken } }
        )
        if (!acctRes.ok) throw new Error('Could not load supplier accounts')
        const acctData = await acctRes.json()
        const primaryAccount = acctData.accounts?.find((a: any) => a.is_primary && a.is_active)
          ?? acctData.accounts?.[0]
        if (!primaryAccount) throw new Error('No active account found for this supplier')

        const insertRes = await fetch(`${scBaseUrl}/api/suppliers/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': scToken },
          body: JSON.stringify({
            account_id:          primaryAccount.id,
            inventory_item_id:   inventoryItemId,
            variant_id:          variantId,
            isbn:                form.isbn,
            title:               form.title,
            vendor:              vendorCode,
            unit_cost:           form.unitCost ? parseFloat(form.unitCost) : null,
            is_primary_supplier: true,
            is_active:           true,
          }),
        })
        if (!insertRes.ok) {
          const body = await insertRes.json().catch(() => ({}))
          throw new Error(body.detail ?? `HTTP ${insertRes.status}`)
        }
        updateStep(5, { status: 'done' })
      } catch (e) {
        updateStep(5, {
          status: 'warning',
          detail: `Supabase insert failed: ${e}. Product GID: ${productId}. Insert supplier_products manually using this GID.`,
        })
      }
    }

    setWizardStep('done')
    onCreated(productId)
  }, [form, record, vendorCode])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isVisible = true // parent controls mount/unmount

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={wizardStep === 'form' ? onClose : undefined} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4 pb-6 overflow-y-auto">
        <div className="w-full max-w-2xl bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">New Product from Edelweiss</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {wizardStep === 'form'      ? 'Review and complete the fields below.'
                : wizardStep === 'review'   ? 'Confirm the payload before creating.'
                : wizardStep === 'executing' ? 'Creating product in Shopify…'
                : wizardStep === 'done'     ? 'Product created successfully.'
                : 'An error occurred — see details below.'}
              </p>
            </div>
            {(wizardStep === 'form' || wizardStep === 'done' || wizardStep === 'error') && (
              <button onClick={onClose} className="text-sm text-gray-500 hover:underline">
                {wizardStep === 'form' ? 'Cancel' : 'Close'}
              </button>
            )}
          </div>

          <div className="px-5 py-5 space-y-6">

            {/* ── FORM STEP ── */}
            {wizardStep === 'form' && (
              <>
                {/* Section 1: Auto-populated */}
                <section>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 border-l-2 border-blue-500 pl-2 mb-3">
                    From Edelweiss (editable)
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <Label>Title</Label>
                      <input
                        value={form.title}
                        onChange={e => setF({ title: e.target.value })}
                        className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <ReadOnly label="ISBN-13"     value={form.isbn} />
                    <ReadOnly label="Format"      value={`${record.format} → tag: ${form.formatTag}, binding: ${form.bindingLabel}`} />
                    <ReadOnly label="Pub date"    value={`${record.pub_date} → tag: ${form.pubDateTag}`} />
                    <ReadOnly label="Author (SKU)" value={form.authorSku || '—'} />
                    {nonAuthors.length > 0 && (
                      <ReadOnly
                        label="Other contributors (not mapped)"
                        value={nonAuthors.map(c => `${c.name} (${c.role})`).join(', ')}
                      />
                    )}
                    {record.scrape_warnings.length > 0 && (
                      <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                        ⚠ Scrape warnings: {record.scrape_warnings.join(', ')}
                      </div>
                    )}
                    {record.cover_image_url && (
                      <div>
                        <Label>Cover preview</Label>
                        <img
                          src={record.cover_image_url}
                          alt={form.title}
                          className="h-24 w-auto rounded border dark:border-gray-700 object-contain mt-1"
                        />
                      </div>
                    )}
                  </div>
                </section>

                {/* Section 2: Supplier */}
                <section>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 border-l-2 border-purple-500 pl-2 mb-3">
                    Supplier
                  </h3>
                  <div className="space-y-3">
                    <VendorPicker value={form.selectedParty} onChange={p => setF({ selectedParty: p })} />
                    <div>
                      <Label>Unit cost (what KAL pays)</Label>
                      <Input
                        type="number" min={0} step={0.01}
                        value={form.unitCost}
                        onChange={e => setF({ unitCost: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </section>

                {/* Section 3: Pricing & Inventory */}
                <section>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 border-l-2 border-green-500 pl-2 mb-3">
                    Pricing & Inventory
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <Label required>Retail price ($)</Label>
                      <Input
                        type="number" min={0} step={0.01}
                        value={form.price}
                        onChange={e => setF({ price: e.target.value })}
                        placeholder="29.99"
                      />
                    </div>
                    <div>
                      <Label>Inventory policy</Label>
                      <div className="flex gap-3 mt-1">
                        {(['DENY', 'CONTINUE'] as const).map(pol => (
                          <button
                            key={pol}
                            type="button"
                            onClick={() => setF({ inventoryPolicy: pol })}
                            className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors
                              ${form.inventoryPolicy === pol
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}
                          >
                            {pol === 'DENY' ? 'Deny overselling' : 'Allow overselling'}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                        Use CONTINUE for direct/author titles. DENY for standard trade.
                      </p>
                    </div>
                    <div>
                      <Label>Weight (lbs)</Label>
                      <Input
                        type="number" min={0} step={0.1}
                        value={form.weight}
                        onChange={e => setF({ weight: e.target.value })}
                      />
                    </div>
                  </div>
                </section>

                {/* Section 4: Catalog */}
                <section>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 border-l-2 border-gray-400 pl-2 mb-3">
                    Catalog
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Language tag</span>
                      <input
                        value={form.languageTag}
                        onChange={e => setF({ languageTag: e.target.value })}
                        className="w-24 px-2 py-1 border rounded text-xs dark:bg-gray-800 dark:text-white dark:border-gray-600 text-right"
                      />
                    </div>
                    <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                      <span>Collections</span>
                      <span className="text-xs text-amber-600 dark:text-amber-400">Assigned after publish ↗</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                      <span>Status</span>
                      <span className="text-xs font-semibold bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">DRAFT</span>
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* ── REVIEW STEP ── */}
            {wizardStep === 'review' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  All 5 Shopify API calls and 1 Supabase insert will fire sequentially after confirmation.
                  Any failure halts the sequence and surfaces the error.
                </p>
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden text-sm">
                  {[
                    ['Title',              form.title],
                    ['ISBN-13',            form.isbn],
                    ['Vendor code',        vendorCode || '(none)'],
                    ['Supplier',           form.selectedParty?.name ?? '(none — insert manually)'],
                    ['Retail price',       `$${form.price}`],
                    ['Unit cost',          form.unitCost ? `$${form.unitCost}` : '(not set)'],
                    ['Inventory policy',   form.inventoryPolicy],
                    ['Weight',             `${form.weight} lbs`],
                    ['Format tag',         form.formatTag],
                    ['Binding metafield',  form.bindingLabel],
                    ['Author (SKU)',        form.authorSku || '(none)'],
                    ['Pub date tag',       form.pubDateTag],
                    ['Language tag',       form.languageTag],
                    ['Status',             'DRAFT'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between px-3 py-2 border-b dark:border-gray-800 last:border-0">
                      <span className="text-gray-500 dark:text-gray-400 shrink-0 w-40">{label}</span>
                      <span className="text-gray-900 dark:text-gray-100 text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── EXECUTING / DONE / ERROR STEP ── */}
            {(wizardStep === 'executing' || wizardStep === 'done' || wizardStep === 'error') && (
              <div className="space-y-4">
                <StepTracker steps={steps} />
                {error && (
                  <div className="px-3 py-2.5 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                    {error}
                  </div>
                )}
                {wizardStep === 'done' && createdIds && (
                  <div className="px-3 py-2.5 rounded-md bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 space-y-1">
                    <p className="font-semibold">Product created — status: DRAFT</p>
                    <p className="font-mono text-xs">{createdIds.productId}</p>
                    <p className="text-xs mt-1">Remember to add collections and publish when ready.</p>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/30">
            {wizardStep === 'form' && (
              <>
                <button onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                  Cancel
                </button>
                <button
                  onClick={() => setWizardStep('review')}
                  disabled={!form.price || !form.title}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  Review →
                </button>
              </>
            )}
            {wizardStep === 'review' && (
              <>
                <button onClick={() => setWizardStep('form')} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50">
                  ← Back
                </button>
                <button
                  onClick={execute}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                >
                  Create product
                </button>
              </>
            )}
            {(wizardStep === 'done' || wizardStep === 'error') && (
              <button onClick={onClose} className="ml-auto px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold">
                Done
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
