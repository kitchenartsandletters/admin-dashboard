// PODocumentImport.tsx
// Document-import wizard for PO creation (#56 follow-on).
//
// Sibling to POCSVImport, but instead of a Stocky CSV the source is a
// photographed / uploaded supplier order form, invoice, or screenshot. Each
// page is read by the vision parser (POST /api/purchase-orders/parse-order-image),
// matched lines are resolved to catalog products server-side, and the KAL-facing
// PO reference is read off the document when present.
//
// Flow:
//   upload   — add one or more document pages; each is parsed and the results merged
//   review   — ONE list of every document line, matched or not, with:
//                · Ordered and Shipped as separate, labelled, editable columns
//                  (Ordered becomes quantity_ordered; Shipped is comparison only)
//                · editable ISBN on every line, re-resolved against the catalog
//                · an ISBN check alert when the document carries component ISBNs
//                  under a line (HBG "BOM Component" rows), a bad check digit,
//                  or the line resolved via a component ISBN — must be cleared
//                · a Catalog Gaps-style "Check Shopify" on unmatched lines that
//                  registers a freshly added Shopify product and matches it in place
//   confirm  — supplier account, destination location, order date, external ref
//              (prefilled from the document PO reference), ad-hoc toggle
//   creating — createPurchaseOrder (status='submitted', ordered_at set) then one
//              createPOLine per included catalog item (duplicates combined)
//
// Price: only the document's MSRP (unit_price) is used. KAL does not track cost —
// see supply-chain-service docs/PRICING_FIELDS.md. It is sent as unit_cost because
// the PO-line API still uses that name mid-rename; the column means MSRP and a DB
// trigger mirrors it to unit_price. Discounts and net figures are never read. If
// no MSRP was read, nothing is sent ("—" at receiving = MSRP unknown).
//   done     — success, open the new PO
//
// The PO is created in submitted status with ordered_at set in a single call, so
// no separate submit round-trip is needed (mirrors POCSVImport). Only lines that
// resolve to a catalog product become PO lines. Document facts that differ from
// what was imported (ordered vs shipped, ISBN corrections, pack expansion) are
// written to the PO line's notes so the PO keeps its own audit trail.
//
// See docs/PO_DOCUMENT_IMPORT.md for the change log and open items.

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  parseOrderImage,
  createPurchaseOrder,
  createPOLine,
  lookupProductByISBN,
  searchShopifyByISBN,
  type MatchedOrderLine,
  type ParsedOrderLine,
  type OrderLineComponent,
  type OrderLineFlag,
  type Location,
} from '../../api/supplyChainApi'
import { useLocations } from '../hooks/useLocations'
import SupplierAccountPicker, { resolveAccountForLocation } from '../suppliers/SupplierAccountPicker'
import type { SupplierParty, SupplierAccount } from '../suppliers/supplierTypes'

type WizardStep = 'upload' | 'review' | 'confirm' | 'creating' | 'done'
type PageStatus = 'queued' | 'parsing' | 'done' | 'error'
type RefConfidence = 'high' | 'medium' | 'low' | null

interface QueuedPage {
  id:         string
  file:       File
  previewUrl: string
  status:     PageStatus
  matched:    MatchedOrderLine[]
  unmatched:  ParsedOrderLine[]
  error?:     string
}

type LineStatus = 'matched' | 'unmatched' | 'resolving'
type IsbnSource = 'document' | 'component' | 'edited' | null

// Feedback from the inline Catalog Gaps check on a line.
interface GapState {
  state:   'checking' | 'registered' | 'not_in_shopify' | 'unrecognized_vendor' | 'pending' | 'error'
  message: string
  vendor?: string
}

// One row of the review step — every line the document carried, matched or not.
interface DocLine {
  key:               string
  status:            LineStatus
  include:           boolean
  // Catalog resolution (null while unmatched)
  inventory_item_id: string | null
  variant_id:        string | null
  vendor:            string | null
  title:             string | null
  isbn:              string            // working ISBN — editable
  isbn_source:       IsbnSource
  // Document provenance (read-only)
  scanned_isbn:      string | null
  scanned_title:     string | null
  components:        OrderLineComponent[]
  flags:             OrderLineFlag[]
  // Quantities — editable. qty_shipped is null when the document gave only one quantity.
  qty_ordered:       number
  qty_shipped:       number | null
  single_qty:        boolean
  unit_price:        number | null     // publisher MSRP per unit from the document; null if none
  // ISBN check state
  isbn_ack:          boolean
  editing:           boolean
  isbn_draft:        string
  pack_offer:        number | null     // offered after switching to a pack component
  pack_expanded:     number | null     // multiplier the user applied
  gap?:              GapState
}

// Flags that require a human to look at the ISBN before the line can be imported.
const ISBN_CHECK_FLAGS: OrderLineFlag[] = ['isbn_checksum_invalid', 'component_isbns_present', 'component_isbn_used']

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── ISBN helpers ──────────────────────────────────────────────────────────

function isbn13CheckDigit(body12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += (i % 2 ? 3 : 1) * Number(body12[i])
  return String((10 - (sum % 10)) % 10)
}

// Strip punctuation; convert an ISBN-10 to ISBN-13. Returns '' for nothing usable.
function normalizeIsbn(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/[^0-9Xx]/g, '').toUpperCase()
  if (d.length === 10) {
    const body = '978' + d.slice(0, 9)
    return body + isbn13CheckDigit(body)
  }
  return d
}

function isValidIsbn13(isbn: string): boolean {
  return /^\d{13}$/.test(isbn) && isbn13CheckDigit(isbn.slice(0, 12)) === isbn[12]
}

function needsIsbnCheck(l: DocLine): boolean {
  if (l.isbn_ack) return false
  if (l.flags.some(f => ISBN_CHECK_FLAGS.includes(f))) return true
  return !!l.isbn && !isValidIsbn13(l.isbn)
}

// ── Build review lines from parser output ─────────────────────────────────

function toDocLine(l: ParsedOrderLine | MatchedOrderLine, matched: boolean): DocLine {
  const m = matched ? (l as MatchedOrderLine) : null
  // Older backends send only `quantity` (the printed shipped / only quantity).
  const shipped = l.quantity_shipped !== undefined ? l.quantity_shipped : l.quantity
  const ordered = l.quantity_ordered ?? null
  const twoColumns = ordered != null
  // Matched server-side via a component ISBN: offer the pack conversion up front.
  const usedComponent = l.isbn_source === 'component'
    ? (l.component_isbns ?? []).find(c => c.isbn === normalizeIsbn(l.isbn))
    : undefined
  const packQty = usedComponent?.quantity_per_unit ?? null
  return {
    key:               crypto.randomUUID(),
    status:            matched ? 'matched' : 'unmatched',
    include:           matched,
    inventory_item_id: m?.inventory_item_id ?? null,
    variant_id:        m?.variant_id ?? null,
    vendor:            m?.vendor ?? null,
    title:             l.title,
    isbn:              normalizeIsbn(l.isbn),
    isbn_source:       l.isbn_source ?? (matched ? 'document' : null),
    scanned_isbn:      l.scanned_isbn ?? l.isbn ?? null,
    scanned_title:     l.scanned_title ?? l.title ?? null,
    components:        l.component_isbns ?? [],
    flags:             l.flags ?? [],
    qty_ordered:       Math.max(1, (twoColumns ? ordered : shipped) ?? 1),
    qty_shipped:       twoColumns ? (shipped ?? null) : null,
    single_qty:        !twoColumns,
    // Never read price from unit_cost: a backend from before 2026-10 can send a
    // net / discounted figure there. Only the explicit unit_price is trusted.
    unit_price:        l.unit_price ?? null,
    isbn_ack:          false,
    editing:           false,
    isbn_draft:        '',
    pack_offer:        packQty && packQty > 1 ? packQty : null,
    pack_expanded:     null,
  }
}

// Merge every page's lines into one review list. Matched lines for the same
// catalog item are combined (a title split across two pages of an invoice);
// unmatched lines are kept as-is, in document order.
function buildDocLines(pages: QueuedPage[]): DocLine[] {
  const out: DocLine[] = []
  const byItem = new Map<string, DocLine>()
  for (const page of pages) {
    for (const raw of page.matched) {
      const line = toDocLine(raw, true)
      const existing = line.inventory_item_id ? byItem.get(line.inventory_item_id) : undefined
      if (existing) {
        existing.qty_ordered += line.qty_ordered
        existing.qty_shipped = existing.qty_shipped == null && line.qty_shipped == null
          ? null : (existing.qty_shipped ?? 0) + (line.qty_shipped ?? 0)
        existing.flags = [...new Set([...existing.flags, ...line.flags])]
        existing.components = [...existing.components, ...line.components]
      } else {
        if (line.inventory_item_id) byItem.set(line.inventory_item_id, line)
        out.push(line)
      }
    }
    for (const raw of page.unmatched) out.push(toDocLine(raw, false))
  }
  return out
}

// PO line notes recording where the document and the import differ.
function lineNotes(l: DocLine): string | undefined {
  const parts: string[] = []
  if (l.qty_shipped != null && l.qty_shipped !== l.qty_ordered) {
    parts.push(`document: ordered ${l.qty_ordered}, shipped ${l.qty_shipped}`)
  }
  if (l.scanned_isbn && normalizeIsbn(l.scanned_isbn) !== l.isbn) {
    const how = l.isbn_source === 'component' ? 'component ISBN used' : 'ISBN corrected'
    parts.push(`${how}; document printed ${l.scanned_isbn}`)
  }
  if (l.pack_expanded && l.pack_expanded > 1) parts.push(`pack of ${l.pack_expanded} expanded to units`)
  return parts.length ? `Doc import: ${parts.join(' · ')}` : undefined
}

// ---------------------------------------------------------------------------
// Field primitives (local — matches SupplierAccountPicker's own styling)
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

function RefConfidenceBadge({ confidence }: { confidence: RefConfidence }) {
  if (!confidence) return null
  const cls =
    confidence === 'high'   ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    : confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${cls}`}>
      {confidence} confidence
    </span>
  )
}

function LineStatusBadge({ status }: { status: LineStatus }) {
  if (status === 'resolving') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mt-1">
        <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Checking
      </span>
    )
  }
  const cls = status === 'matched'
    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  return (
    <span className={`inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${cls}`}>
      {status === 'matched' ? 'In catalog' : 'Not in catalog'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onClose:   () => void
  onCreated: (poId: string) => void
}

export default function PODocumentImport({ onClose, onCreated }: Props) {
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => { setTimeout(() => setIsVisible(true), 10) }, [])
  const handleClose = () => { setIsVisible(false); setTimeout(onClose, 300) }

  const [step, setStep]   = useState<WizardStep>('upload')
  const [error, setError] = useState<string | null>(null)

  // Upload / parse
  const [queue, setQueue] = useState<QueuedPage[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Review
  const [lines, setLines]                   = useState<DocLine[]>([])
  const [checkingAll, setCheckingAll]       = useState(false)
  const [detectedSupplier, setDetectedSupplier] = useState<string | null>(null)
  const [poReference, setPoReference]       = useState<string | null>(null)
  const [poRefConfidence, setPoRefConfidence] = useState<RefConfidence>(null)

  // Confirm
  const { locations } = useLocations()
  const [supplierSelection, setSupplierSelection] = useState<{ party: SupplierParty; accounts: SupplierAccount[] } | null>(null)
  const [locationId,  setLocationId]  = useState('')
  const [orderedAt,   setOrderedAt]   = useState(todayISO())
  const [informalRef, setInformalRef] = useState('')
  const [isAdHoc, setIsAdHoc]         = useState(false)

  // Create
  const [progress, setProgress]       = useState<{ current: number; total: number } | null>(null)
  const [createdPoId, setCreatedPoId] = useState<string | null>(null)

  // Default to HQ (active, non-seasonal) location
  useEffect(() => {
    if (locations.length > 0 && !locationId) {
      const hq = locations.find((l: Location) => l.is_active && !l.is_seasonal) ?? locations[0]
      setLocationId(hq.id)
    }
  }, [locations])

  // ── Upload queue ────────────────────────────────────────────────────────

  const addPage = useCallback((file: File) => {
    const page: QueuedPage = {
      id:         crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status:     'queued',
      matched:    [],
      unmatched:  [],
    }
    setQueue(prev => [...prev, page])
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const removePage = useCallback((id: string) => {
    setQueue(prev => prev.filter(p => p.id !== id))
  }, [])

  const handleReset = () => {
    setQueue([])
    setLines([])
    setDetectedSupplier(null)
    setPoReference(null)
    setPoRefConfidence(null)
    setError(null)
    setStep('upload')
  }

  const processQueue = useCallback(async () => {
    if (queue.length === 0) return
    setError(null)

    const processed: QueuedPage[] = [...queue]
    let supplierName: string | null = null
    let ref: string | null = null
    let refConf: RefConfidence = null

    for (let i = 0; i < processed.length; i++) {
      processed[i] = { ...processed[i], status: 'parsing' }
      setQueue([...processed])
      try {
        const res = await parseOrderImage(processed[i].file)
        processed[i] = {
          ...processed[i],
          status:    res.stub || (res.matched.length === 0 && res.unmatched.length === 0) ? 'error' : 'done',
          error:     res.stub ? 'No lines could be read — try a clearer image' : undefined,
          matched:   res.matched,
          unmatched: res.unmatched,
        }
        // First page that names each field wins.
        if (!supplierName && res.supplier_name) supplierName = res.supplier_name
        if (!ref && res.po_reference) { ref = res.po_reference; refConf = res.po_reference_confidence }
      } catch (e) {
        processed[i] = {
          ...processed[i],
          status: 'error',
          error:  e instanceof Error ? e.message : 'Parse failed',
        }
      }
      setQueue([...processed])
    }

    const donePages = processed.filter(p => p.status === 'done')
    if (donePages.length === 0) {
      setError('No lines could be read from any page. Try clearer photos or a higher-quality scan.')
      setStep('upload')
      return
    }

    setLines(buildDocLines(donePages))
    setDetectedSupplier(supplierName)
    setPoReference(ref)
    setPoRefConfidence(refConf)
    if (ref) setInformalRef(ref)
    setStep('review')
  }, [queue])

  // ── Review: line edits ──────────────────────────────────────────────────

  const setLine = useCallback((key: string, fn: (l: DocLine) => DocLine) => {
    setLines(prev => prev.map(l => l.key === key ? fn(l) : l))
  }, [])

  const toggleInclude = (key: string) => setLine(key, l => l.status === 'matched' ? { ...l, include: !l.include } : l)
  const setOrdered = (key: string, qty: number) => setLine(key, l => ({ ...l, qty_ordered: Math.max(1, qty) }))
  const setShipped = (key: string, raw: string) => setLine(key, l => ({
    ...l, qty_shipped: raw.trim() === '' ? null : Math.max(0, parseInt(raw) || 0),
  }))
  const ackIsbn = (key: string) => setLine(key, l => ({ ...l, isbn_ack: true }))
  const startEdit = (key: string) => setLine(key, l => ({ ...l, editing: true, isbn_draft: l.isbn }))
  const cancelEdit = (key: string) => setLine(key, l => ({ ...l, editing: false, isbn_draft: '' }))

  // Look an ISBN up in the catalog and apply the result to the line.
  // Exact ISBN match only — the product search also does partial matches.
  const lookupAndApply = useCallback(async (key: string, isbn: string): Promise<boolean> => {
    const results = await lookupProductByISBN(isbn)
    const exact = results.find(r => normalizeIsbn(r.isbn) === isbn)
    setLine(key, l => exact
      ? { ...l, status: 'matched', include: true, isbn,
          inventory_item_id: exact.inventory_item_id, variant_id: exact.variant_id,
          title: exact.title || l.scanned_title, vendor: exact.vendor ?? null }
      : { ...l, status: 'unmatched', include: false, isbn,
          inventory_item_id: null, variant_id: null, vendor: null, title: l.scanned_title })
    return !!exact
  }, [setLine])

  // Re-resolve a line against a different ISBN — typed by the user, or one of
  // the component ISBNs the document printed under the line. Choosing an ISBN
  // deliberately counts as having checked it.
  const resolveIsbn = useCallback(async (key: string, rawIsbn: string, source: IsbnSource, packQty?: number | null) => {
    const isbn = normalizeIsbn(rawIsbn)
    if (!isbn) return
    setLine(key, l => ({
      ...l, status: 'resolving', isbn, isbn_source: source, isbn_ack: true,
      editing: false, isbn_draft: '', gap: undefined,
      pack_offer: packQty && packQty > 1 && !l.pack_expanded ? packQty : null,
    }))
    try {
      await lookupAndApply(key, isbn)
    } catch (e) {
      setLine(key, l => ({ ...l, status: 'unmatched', include: false,
        gap: { state: 'error', message: e instanceof Error ? e.message : 'Lookup failed' } }))
    }
  }, [lookupAndApply, setLine])

  // Catalog Gaps "Register by ISBN", inline: check Shopify for the ISBN and, if
  // the product is there, register it into the catalog and match the line.
  const checkShopify = useCallback(async (key: string, rawIsbn: string) => {
    const isbn = normalizeIsbn(rawIsbn)
    if (isbn.length !== 13) {
      setLine(key, l => ({ ...l, gap: { state: 'error', message: 'Enter a 13-digit ISBN before checking Shopify.' } }))
      return
    }
    setLine(key, l => ({ ...l, status: 'resolving', gap: { state: 'checking', message: 'Checking Shopify…' } }))
    try {
      const res = await searchShopifyByISBN(isbn)
      if (res.registered && res.record?.inventory_item_id && res.record.variant_id) {
        const rec = res.record
        setLine(key, l => ({
          ...l, status: 'matched', include: true, isbn,
          inventory_item_id: rec.inventory_item_id, variant_id: rec.variant_id,
          title: rec.title ?? res.title ?? l.scanned_title, vendor: rec.vendor ?? res.vendor ?? null,
          gap: { state: 'registered', message: 'Found in Shopify and registered in the catalog.' },
        }))
        return
      }
      if (res.not_in_shopify) {
        setLine(key, l => ({ ...l, status: 'unmatched', gap: { state: 'not_in_shopify',
          message: 'Not in Shopify. Create the product in Shopify (or correct the ISBN), then check again.' } }))
        return
      }
      if (res.unrecognized_vendor) {
        setLine(key, l => ({ ...l, status: 'unmatched', gap: { state: 'unrecognized_vendor', vendor: res.vendor,
          message: `In Shopify${res.title ? ` as “${res.title}”` : ''}, but its vendor code isn't mapped to a supplier.` } }))
        return
      }
      // In Shopify and already catalogued (or registered without a record):
      // resolve through the normal catalog search.
      const ok = await lookupAndApply(key, isbn)
      setLine(key, l => ({ ...l, gap: ok
        ? { state: 'registered', message: 'In Shopify and in the catalog.' }
        : { state: 'pending', message: "Shopify has it, but the catalog search isn't returning it yet. Check again in a moment, or run a sync in Catalog Coverage." } }))
    } catch (e) {
      setLine(key, l => ({ ...l, status: 'unmatched',
        gap: { state: 'error', message: e instanceof Error ? e.message : 'Shopify check failed' } }))
    }
  }, [lookupAndApply, setLine])

  const checkAllUnmatched = async () => {
    setCheckingAll(true)
    try {
      for (const l of lines.filter(x => x.status === 'unmatched' && normalizeIsbn(x.isbn).length === 13)) {
        await checkShopify(l.key, l.isbn)
      }
    } finally {
      setCheckingAll(false)
    }
  }

  // Ordering a pack code by its component: offer to express the quantities in
  // single units (2 packs of 20 → 40; MSRP per pack ÷ 20). Never applied automatically — whether a
  // supplier's count is per pack or in total is for the person holding the slip.
  const applyPack = (key: string) => setLine(key, l => {
    const n = l.pack_offer ?? 1
    return { ...l, pack_offer: null, pack_expanded: n,
      qty_ordered: l.qty_ordered * n,
      qty_shipped: l.qty_shipped == null ? null : l.qty_shipped * n,
      unit_price: l.unit_price == null ? null : Math.round((l.unit_price / n) * 100) / 100 }
  })

  // ── Computed ──────────────────────────────────────────────────────────────

  const matchedLines   = lines.filter(l => l.status === 'matched')
  const unmatchedCount = lines.filter(l => l.status === 'unmatched').length
  const includedLines  = matchedLines.filter(l => l.include)
  const isbnChecksDue  = includedLines.filter(needsIsbnCheck).length
  const anyResolving   = lines.some(l => l.status === 'resolving')
  const parsing        = queue.some(p => p.status === 'parsing')
  const errorCount     = queue.filter(p => p.status === 'error').length

  // Two document lines can resolve to the same catalog item (e.g. after an ISBN
  // edit). They become one PO line with the quantities combined.
  const importGroups = (() => {
    const byItem = new Map<string, DocLine[]>()
    for (const l of includedLines) {
      const k = l.inventory_item_id as string
      byItem.set(k, [...(byItem.get(k) ?? []), l])
    }
    return [...byItem.values()]
  })()
  const includedCount = importGroups.length
  const includedUnits = includedLines.reduce((s, l) => s + l.qty_ordered, 0)
  const duplicateItems = new Set(importGroups.filter(g => g.length > 1).map(g => g[0].inventory_item_id))

  const reviewValid = includedCount > 0 && isbnChecksDue === 0 && !anyResolving

  const effectiveAccount = supplierSelection
    ? resolveAccountForLocation(supplierSelection.accounts, locationId || null)
    : null
  const confirmValid = !!effectiveAccount && !!locationId && !!orderedAt && includedCount > 0

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!effectiveAccount || !locationId || !orderedAt || includedCount === 0) return
    setStep('creating')
    setError(null)
    setProgress({ current: 0, total: includedCount + 1 })

    try {
      const po = await createPurchaseOrder({
        supplier_account_id:     effectiveAccount.id,
        destination_location_id: locationId,
        status:                  'submitted',
        ordered_at:              new Date(orderedAt).toISOString(),
        is_ad_hoc:               isAdHoc,
        ad_hoc_source:           isAdHoc ? 'other' : undefined,
        informal_ref:            informalRef.trim() || undefined,
        notes:                   poReference
          ? `Imported from document · ${poReference}`
          : 'Imported from document',
      })
      setProgress({ current: 1, total: includedCount + 1 })

      let i = 1
      for (const group of importGroups) {
        const first = group[0]
        const notes = group.map(lineNotes).filter(Boolean).join(' | ')
        await createPOLine(po.id, {
          inventory_item_id: first.inventory_item_id as string,
          variant_id:        first.variant_id as string,
          quantity_ordered:  group.reduce((s, l) => s + l.qty_ordered, 0),
          // MSRP, sent under the API's legacy name — see header comment.
          unit_cost:         group.find(l => l.unit_price != null)?.unit_price ?? undefined,
          notes:             notes || undefined,
        })
        i++
        setProgress({ current: i, total: includedCount + 1 })
      }

      setCreatedPoId(po.id)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
      setStep('confirm')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const stepLabels: Record<WizardStep, string> = {
    upload: 'Upload document', review: 'Review lines',
    confirm: 'Confirm', creating: 'Importing…', done: 'Done',
  }
  const stepOrder: WizardStep[] = ['upload', 'review', 'confirm']
  const stepIndex = stepOrder.indexOf(step)

  return (
    <>
      <div className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose} />
      <div className={`fixed inset-0 z-50 flex items-start justify-center pt-6 px-4 pb-6 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="w-full max-w-3xl bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[92vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800 shrink-0">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">Import PO from document</h2>
              <p className="text-xs text-gray-400 mt-0.5">{stepLabels[step]}</p>
            </div>
            <button onClick={handleClose} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">Cancel</button>
          </div>

          {/* Step bar */}
          {stepOrder.includes(step) && (
            <div className="flex items-center gap-2 px-5 py-3 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 shrink-0">
              {(['Upload', 'Review', 'Confirm'] as const).map((label, i) => {
                const done = i < stepIndex; const active = i === stepIndex
                return (
                  <div key={label} className="contents">
                    {i > 0 && <div className={`flex-1 h-px ${done ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        active ? 'bg-blue-600 text-white' : done ? 'bg-blue-200 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                      }`}>{done ? '✓' : i + 1}</div>
                      <span className={`text-xs font-medium hidden sm:block ${active ? 'text-blue-600 dark:text-blue-400' : done ? 'text-blue-400' : 'text-gray-400'}`}>{label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5">

            {/* ── Upload ──────────────────────────────────────────────── */}
            {step === 'upload' && (
              <div className="space-y-4">
                {queue.length === 0 ? (
                  <div className="border-2 border-dashed dark:border-gray-700 rounded-lg p-6 text-center space-y-3">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Upload a supplier order form, invoice, or screenshot
                    </p>
                    <div className="text-left space-y-1 px-2 max-w-md mx-auto">
                      {[
                        'Use your phone\u2019s document scan feature for the best results',
                        'Or upload a screenshot (email, iPage, supplier portal)',
                        'Add every page before reading — quantities merge across pages',
                      ].map((tip, i) => (
                        <p key={i} className="text-xs text-gray-400 dark:text-gray-500">• {tip}</p>
                      ))}
                    </div>
                    <button type="button" onClick={() => inputRef.current?.click()}
                      className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
                      📷 Add page
                    </button>
                  </div>
                ) : (
                  <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {parsing
                          ? `Reading… (${queue.filter(p => p.status === 'done' || p.status === 'error').length} of ${queue.length})`
                          : `${queue.length} page${queue.length !== 1 ? 's' : ''} ready`}
                      </p>
                      {!parsing && (
                        <button type="button" onClick={handleReset}
                          className="text-xs text-gray-400 dark:text-gray-500 hover:underline">Start over</button>
                      )}
                    </div>
                    <div className="px-4 py-4">
                      <div className="flex gap-3 overflow-x-auto pb-1 items-start">
                        {queue.map((page, i) => (
                          <div key={page.id} className="relative flex-shrink-0 w-20">
                            <div className={`relative rounded-md overflow-hidden border-2 ${
                              page.status === 'done'  ? 'border-green-400 dark:border-green-500'
                              : page.status === 'error' ? 'border-red-400 dark:border-red-500'
                              : page.status === 'parsing' ? 'border-blue-400 dark:border-blue-500'
                              : 'border-gray-300 dark:border-gray-600'}`}>
                              <img src={page.previewUrl} alt={`Page ${i + 1}`} className="w-20 h-28 object-cover" />
                              {page.status === 'parsing' && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                </div>
                              )}
                              {page.status === 'done' && (
                                <div className="absolute inset-0 bg-green-500/20 flex items-end justify-end p-1">
                                  <span className="text-[10px] font-bold text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-900/60 px-1 py-0.5 rounded">
                                    {page.matched.length}✓
                                  </span>
                                </div>
                              )}
                              {page.status === 'error' && (
                                <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                                  <span className="text-red-200 text-lg">!</span>
                                </div>
                              )}
                            </div>
                            <p className="text-center text-[10px] text-gray-500 dark:text-gray-400 mt-1">pg {i + 1}</p>
                            {!parsing && (
                              <button type="button" onClick={() => removePage(page.id)}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-600 dark:bg-gray-400 text-white dark:text-gray-900 text-[10px] font-bold leading-none flex items-center justify-center hover:bg-red-600">×</button>
                            )}
                          </div>
                        ))}
                        {!parsing && (
                          <button type="button" onClick={() => inputRef.current?.click()}
                            className="w-20 h-28 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 hover:border-blue-400 shrink-0">
                            <span className="text-2xl text-gray-400">+</span>
                            <span className="text-[10px] text-gray-400 text-center">Add page</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Review ──────────────────────────────────────────────── */}
            {step === 'review' && (
              <div className="space-y-4">
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {lines.length} line{lines.length !== 1 ? 's' : ''} read · {matchedLines.length} in catalog
                          {unmatchedCount > 0 && <span className="text-red-600 dark:text-red-400"> · {unmatchedCount} not in catalog</span>}
                          {isbnChecksDue > 0 && <span className="text-amber-600 dark:text-amber-400"> · {isbnChecksDue} ISBN check{isbnChecksDue !== 1 ? 's' : ''}</span>}
                          {errorCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {errorCount} page{errorCount !== 1 ? 's' : ''} failed</span>}
                        </p>
                        {detectedSupplier && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Detected supplier: {detectedSupplier}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {unmatchedCount > 0 && (
                          <button type="button" onClick={checkAllUnmatched} disabled={checkingAll || anyResolving}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
                            {checkingAll ? 'Checking Shopify…' : `Check ${unmatchedCount} in Shopify`}
                          </button>
                        )}
                        <button type="button" onClick={handleReset}
                          className="text-xs text-gray-400 dark:text-gray-500 hover:underline">Start over</button>
                      </div>
                    </div>
                    {poReference && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Document PO reference:</span>
                        <span className="text-xs font-mono font-semibold text-gray-800 dark:text-gray-200">{poReference}</span>
                        <RefConfidenceBadge confidence={poRefConfidence} />
                        <span className="text-[11px] text-gray-400">— prefilled as the external reference; edit it in the next step if needed.</span>
                      </div>
                    )}
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      <strong className="font-semibold text-gray-600 dark:text-gray-300">Ordered</strong> becomes the quantity on the PO line.{' '}
                      <strong className="font-semibold text-gray-600 dark:text-gray-300">Shipped</strong> is what this document says shipped — shown for comparison only; record what actually arrives in Receiving.
                    </p>
                  </div>

                  {/* Column headings */}
                  <div className="grid grid-cols-[auto_1fr_4rem_4rem_6.5rem] gap-3 px-4 py-2 border-b dark:border-gray-700 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    <span className="w-4" />
                    <span>Title / ISBN</span>
                    <span className="text-center">Ordered</span>
                    <span className="text-center">Shipped</span>
                    <span>Status</span>
                  </div>

                  <div className="divide-y dark:divide-gray-800 max-h-[26rem] overflow-y-auto">
                    {lines.map(line => {
                      const checkDue = line.status === 'matched' && line.include && needsIsbnCheck(line)
                      const otherComponents = line.components.filter(c => c.isbn !== line.isbn)
                      const showIsbnAlert = needsIsbnCheck(line) || (line.status === 'unmatched' && otherComponents.length > 0)
                      const delta = line.qty_shipped == null ? 0 : line.qty_shipped - line.qty_ordered
                      const dim = line.status === 'matched' && !line.include
                      return (
                        <div key={line.key} className={`px-4 py-2.5 space-y-2 ${checkDue ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                          <div className={`grid grid-cols-[auto_1fr_4rem_4rem_6.5rem] gap-3 items-start ${dim ? 'opacity-40' : ''}`}>
                            <input type="checkbox" checked={line.include} disabled={line.status !== 'matched'}
                              onChange={() => toggleInclude(line.key)}
                              title={line.status === 'matched' ? 'Include on the PO' : 'Only catalog items can be imported'}
                              className="accent-blue-600 mt-1 w-4 disabled:opacity-30" />

                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                                {line.title ?? line.scanned_title ?? '—'}
                                {line.inventory_item_id && duplicateItems.has(line.inventory_item_id) && line.include && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-1">(same item as another line — quantities combine)</span>
                                )}
                              </p>
                              {line.editing ? (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <input autoFocus value={line.isbn_draft}
                                    onChange={e => setLine(line.key, l => ({ ...l, isbn_draft: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') resolveIsbn(line.key, line.isbn_draft, 'edited')
                                      if (e.key === 'Escape') cancelEdit(line.key)
                                    }}
                                    placeholder="13-digit ISBN"
                                    className="w-40 px-2 py-0.5 border rounded text-xs font-mono dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-1 focus:ring-blue-500 outline-none" />
                                  <button type="button" onClick={() => resolveIsbn(line.key, line.isbn_draft, 'edited')}
                                    disabled={normalizeIsbn(line.isbn_draft).length !== 13}
                                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40">Look up</button>
                                  <button type="button" onClick={() => cancelEdit(line.key)}
                                    className="text-[11px] text-gray-400 hover:underline">Cancel</button>
                                  {line.isbn_draft && normalizeIsbn(line.isbn_draft).length === 13 && !isValidIsbn13(normalizeIsbn(line.isbn_draft)) && (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400">check digit doesn't match</span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 flex items-center gap-2 flex-wrap">
                                  <span>{line.isbn || '—'}</span>
                                  {line.unit_price != null && (
                                    <span className="font-sans text-gray-500 dark:text-gray-400"
                                      title="Publisher list price (MSRP) printed on the document">Price ${line.unit_price.toFixed(2)}</span>
                                  )}
                                  {line.scanned_isbn && normalizeIsbn(line.scanned_isbn) !== line.isbn && (
                                    <span className="font-sans text-gray-400">(document: <span className="font-mono line-through">{line.scanned_isbn}</span>)</span>
                                  )}
                                  <button type="button" onClick={() => startEdit(line.key)}
                                    className="font-sans text-blue-600 dark:text-blue-400 hover:underline">Edit ISBN</button>
                                </p>
                              )}
                            </div>

                            <input type="number" min={1} value={line.qty_ordered}
                              onChange={e => setOrdered(line.key, parseInt(e.target.value) || 1)}
                              className="w-full px-1.5 py-1 border rounded text-sm text-center dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-1 focus:ring-blue-500 outline-none" />
                            <div>
                              <input type="number" min={0} value={line.qty_shipped ?? ''} placeholder="—"
                                onChange={e => setShipped(line.key, e.target.value)}
                                title={line.single_qty ? 'Only one quantity was read from the document — it was used as Ordered.' : undefined}
                                className="w-full px-1.5 py-1 border rounded text-sm text-center dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-1 focus:ring-blue-500 outline-none" />
                              {delta !== 0 && (
                                <p className={`text-[10px] text-center mt-0.5 ${delta < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                  {delta < 0 ? `${-delta} short` : `${delta} over`}
                                </p>
                              )}
                            </div>

                            <LineStatusBadge status={line.status} />
                          </div>

                          {/* ISBN check alert */}
                          {showIsbnAlert && (
                            <div className="ml-7 px-3 py-2 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
                              <p className="font-semibold">Check the ISBN on this line.</p>
                              {line.flags.includes('isbn_checksum_invalid') && (
                                <p>The ISBN printed on the document ({line.scanned_isbn}) fails its check digit — it was probably misread.</p>
                              )}
                              {line.components.length > 0 && (
                                <p>
                                  The document lists {line.components.length === 1 ? 'a component ISBN' : 'component ISBNs'} under this line.
                                  The ISBN printed on the line ({line.scanned_isbn ?? '—'}) may be a pack or set code rather than the book itself.
                                  {line.isbn_source === 'component' && ' The line was matched using the component ISBN.'}
                                </p>
                              )}
                              {otherComponents.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {otherComponents.map(c => (
                                    <button key={c.isbn} type="button"
                                      onClick={() => resolveIsbn(line.key, c.isbn, 'component', c.quantity_per_unit)}
                                      className="px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 hover:border-blue-400 font-mono text-[11px]">
                                      Use {c.isbn}
                                      {c.quantity_per_unit != null && <span className="font-sans text-gray-500"> · {c.quantity_per_unit} per unit</span>}
                                      {c.occurrences > 1 && <span className="font-sans text-gray-500"> · listed {c.occurrences}×</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center gap-3">
                                {line.status === 'matched' && !line.isbn_ack && (
                                  <button type="button" onClick={() => ackIsbn(line.key)}
                                    className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                                    {line.isbn} is correct
                                  </button>
                                )}
                                <button type="button" onClick={() => startEdit(line.key)}
                                  className="text-blue-600 dark:text-blue-400 hover:underline">Enter a different ISBN</button>
                              </div>
                            </div>
                          )}

                          {/* Pack expansion offer */}
                          {line.pack_offer && line.status === 'matched' && (
                            <div className="ml-7 px-3 py-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-800 dark:text-blue-200 flex items-center justify-between gap-3">
                              <span>
                                The document shows {line.pack_offer} of this book per unit. If those quantities are packs, convert them to single copies
                                ({line.qty_ordered} × {line.pack_offer} = {line.qty_ordered * line.pack_offer}
                                {line.unit_price != null && `; price $${line.unit_price.toFixed(2)} ÷ ${line.pack_offer} = $${(line.unit_price / line.pack_offer).toFixed(2)} per copy`}).
                              </span>
                              <span className="flex items-center gap-3 shrink-0">
                                <button type="button" onClick={() => applyPack(line.key)} className="font-semibold hover:underline">Convert</button>
                                <button type="button" onClick={() => setLine(line.key, l => ({ ...l, pack_offer: null }))} className="text-gray-500 hover:underline">Keep as is</button>
                              </span>
                            </div>
                          )}

                          {/* Catalog gap — not in catalog */}
                          {line.status !== 'matched' && (
                            <div className="ml-7 flex items-start justify-between gap-3 text-xs">
                              <p className={line.gap?.state === 'error' || line.gap?.state === 'not_in_shopify' ? 'text-red-600 dark:text-red-400'
                                : line.gap?.state === 'unrecognized_vendor' || line.gap?.state === 'pending' ? 'text-amber-700 dark:text-amber-300'
                                : 'text-gray-500 dark:text-gray-400'}>
                                {line.gap?.message ?? (line.isbn
                                  ? 'Not in the catalog. If it was just added to Shopify, check Shopify to register it now.'
                                  : 'No ISBN was read for this line. Enter one to match it.')}
                                {line.gap?.state === 'unrecognized_vendor' && (
                                  <> Vendor code <span className="font-mono">{line.gap.vendor}</span> —{' '}
                                    <a href="/suppliers/catalog-gaps" target="_blank" rel="noopener noreferrer" className="underline">open Catalog Coverage</a>.</>
                                )}
                              </p>
                              {line.isbn && line.status === 'unmatched' && (
                                <button type="button" onClick={() => checkShopify(line.key, line.isbn)} disabled={checkingAll}
                                  className="shrink-0 font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
                                  {line.gap ? 'Check again' : 'Check Shopify'}
                                </button>
                              )}
                            </div>
                          )}
                          {line.status === 'matched' && line.gap?.state === 'registered' && (
                            <p className="ml-7 text-xs text-green-700 dark:text-green-400">✓ {line.gap.message}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {includedCount} catalog item{includedCount !== 1 ? 's' : ''} · {includedUnits} unit{includedUnits !== 1 ? 's' : ''} will be added.
                  {unmatchedCount > 0 && ` ${unmatchedCount} line${unmatchedCount !== 1 ? 's' : ''} not in the catalog will be left off.`}
                  {isbnChecksDue > 0 && <span className="text-amber-600 dark:text-amber-400"> Clear the ISBN check{isbnChecksDue !== 1 ? 's' : ''} to continue.</span>}
                </p>
              </div>
            )}

            {/* ── Confirm ─────────────────────────────────────────────── */}
            {step === 'confirm' && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Confirm import</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Review the details below, then click Import.</p>
                </div>

                <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Import summary</p>
                  </div>
                  <div className="px-4 py-3 space-y-1.5 text-sm">
                    {poReference && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Document PO reference</span>
                        <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{poReference}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Lines to import</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {includedCount} line{includedCount !== 1 ? 's' : ''} · {includedUnits} units ordered
                      </span>
                    </div>
                    {lines.length - includedLines.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Left off this PO</span>
                        <span className="text-amber-700 dark:text-amber-300">
                          {lines.length - includedLines.length} document line{lines.length - includedLines.length !== 1 ? 's' : ''}
                          {unmatchedCount > 0 && ` (${unmatchedCount} not in catalog)`}
                        </span>
                      </div>
                    )}
                    {detectedSupplier && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Detected supplier</span>
                        <span className="text-gray-700 dark:text-gray-300">{detectedSupplier}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Supplier */}
                <div>
                  <Label required>Supplier</Label>
                  <SupplierAccountPicker
                    value={supplierSelection} effectiveAccount={effectiveAccount}
                    onChange={setSupplierSelection} label="Publisher or distributor"
                    placeholder={detectedSupplier || 'Search publisher name…'} />
                </div>

                {/* Location */}
                <div>
                  <Label required>Receiving location</Label>
                  <select value={locationId} onChange={e => setLocationId(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">— select location —</option>
                    {locations.filter((l: Location) => l.is_active).map((l: Location) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                {/* Order date */}
                <div>
                  <Label required>Order date</Label>
                  <input type="date" value={orderedAt} onChange={e => setOrderedAt(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Defaults to today. Adjust to the date the order was actually placed with the supplier.
                  </p>
                </div>

                {/* External ref */}
                <div>
                  <Label>External reference</Label>
                  <Input value={informalRef} onChange={e => setInformalRef(e.target.value)}
                    placeholder={poReference ?? 'e.g. supplier PO number'} />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Read from the document's PO reference. Used for PO lookup during receiving.
                  </p>
                </div>

                {/* Ad hoc toggle */}
                <div className="flex items-center justify-between rounded-md border dark:border-gray-700 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Ad hoc order</p>
                    <p className="text-[11px] text-gray-400">Mark if this was placed outside the standard ordering workflow</p>
                  </div>
                  <button type="button" onClick={() => setIsAdHoc(!isAdHoc)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAdHoc ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isAdHoc ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            )}

            {/* ── Creating ────────────────────────────────────────────── */}
            {step === 'creating' && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {progress ? 'Creating PO and lines…' : 'Reading document…'}
                </p>
                {progress && (
                  <div className="w-full max-w-sm">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{progress.current} of {progress.total}</span>
                      <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div className="bg-blue-600 h-1.5 rounded-full transition-all"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400">Do not close this window.</p>
              </div>
            )}

            {/* ── Done ────────────────────────────────────────────────── */}
            {step === 'done' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-2xl">✓</div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">PO created successfully</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {includedCount} line{includedCount !== 1 ? 's' : ''} imported from document.
                  </p>
                  {informalRef && <p className="text-xs font-mono text-gray-400 mt-2">ref: {informalRef}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { if (createdPoId) onCreated(createdPoId); handleClose() }}
                    className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
                    Open PO →
                  </button>
                  <button onClick={handleClose}
                    className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    Close
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 px-3 py-2.5 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          {(step === 'upload' || step === 'review' || step === 'confirm') && (
            <div className="px-5 py-4 border-t dark:border-gray-800 flex items-center justify-between shrink-0 bg-gray-50/50 dark:bg-gray-900/30">
              <button
                onClick={() => {
                  if (step === 'confirm') setStep('review')
                  else if (step === 'review') setStep('upload')
                  else handleClose()
                }}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {step === 'upload' ? 'Cancel' : '← Back'}
              </button>

              {step === 'upload' && (
                <button onClick={processQueue} disabled={queue.length === 0 || parsing}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]">
                  Read {queue.length > 1 ? `${queue.length} pages` : 'document'} →
                </button>
              )}
              {step === 'review' && (
                <button onClick={() => setStep('confirm')} disabled={!reviewValid}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]">
                  Confirm details →
                </button>
              )}
              {step === 'confirm' && (
                <button onClick={handleCreate} disabled={!confirmValid}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]">
                  Import {includedCount} line{includedCount !== 1 ? 's' : ''} →
                </button>
              )}
            </div>
          )}

          <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment"
            onChange={e => { const f = e.target.files?.[0]; if (f) addPage(f) }} className="hidden" />
        </div>
      </div>
    </>
  )
}
