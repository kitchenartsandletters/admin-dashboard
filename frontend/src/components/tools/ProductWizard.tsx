// components/tools/ProductWizard.tsx
// Modal wizard: Edelweiss record → Shopify draft product
// Mounts inside EdelweissLookup when "Create Draft Product" is clicked.

import { useState } from "react"
import { ExternalLink, X, CheckCircle, XCircle, Loader } from "lucide-react"

const EW_BASE = import.meta.env.VITE_EDELWEISS_SERVICE_URL as string
const EW_KEY  = import.meta.env.VITE_EDELWEISS_ADMIN_KEY as string

const ewHeaders = () => ({
  "Content-Type": "application/json",
  "x-admin-key": EW_KEY,
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contributor { name: string; role: string }

interface EdelweissRecord {
  isbn13: string
  title: string | null
  contributors: Contributor[]
  publisher: string | null
  pub_date: string | null
  pub_date_raw: string | null
  format: string | null
  description: string | null
  cover_image_url: string | null
  interior_image_urls: string[]
  weight_lbs: number | null
  // optional fields returned by the Edelweiss service
  price_usd?: string | null
}

interface StepResult {
  step: string
  ok: boolean
  blocking: boolean
  errors?: Array<{ message: string; field?: string }>
}

interface ProductCreateResponse {
  isbn13: string
  product_id: string | null
  shopify_admin_url: string | null
  steps: StepResult[]
}

// ── Vendor options (update to match your supplier_parties) ────────────────────

const VENDOR_OPTIONS = [
  { code: "RDH",   label: "Penguin Random House" },
  { code: "UCHI",  label: "University of Chicago Press" },
  { code: "HBGUSA",label: "Hachette Book Group" },
  { code: "SCHB",  label: "Scholastic" },
  { code: "HS",    label: "HarperCollins" },
  { code: "SS",    label: "Simon & Schuster" },
  { code: "MACM",  label: "Macmillan Publishers" },
  { code: "NORW",  label: "W. W. Norton" },
  { code: "UCAL",  label: "University of California Press" },
  { code: "UCOL",  label: "Columbia University Press" },
]

const LANGUAGE_OPTIONS = [
  { tag: "Ln_En", label: "English" },
  { tag: "Ln_Es", label: "Spanish" },
  { tag: "Ln_Fr", label: "French" },
  { tag: "Ln_De", label: "German" },
  { tag: "Ln_It", label: "Italian" },
  { tag: "Ln_Pt", label: "Portuguese" },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function authorNames(contributors: Contributor[]): string {
  const authors = contributors.filter(c => c.role.toLowerCase() === "author")
  return authors.map(c => c.name).join(", ") || "—"
}

function nonAuthors(contributors: Contributor[]): Contributor[] {
  return contributors.filter(c => c.role.toLowerCase() !== "author")
}

function formatTag(fmt: string | null): string {
  const map: Record<string, string> = {
    Hardcover: "C", Paperback: "P", Flexibound: "F",
    Spiralbound: "S", "Spiral bound": "S", "Board book": "B",
  }
  return map[fmt ?? ""] ?? "P"
}

function pubDateDisplay(iso: string | null): string {
  if (!iso) return "—"
  try {
    const [y, m, d] = iso.split("-")
    return `${m}-${d}-${y}`
  } catch { return iso }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldRow({ label, value, mono = false }: {
  label: string; value: React.ReactNode; mono?: boolean
}) {
  return (
    <div className="flex gap-4 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="w-36 shrink-0 text-xs text-gray-500 dark:text-gray-400 pt-0.5">{label}</span>
      <span className={`text-sm text-gray-900 dark:text-gray-100 ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  )
}

function StepRow({ step }: { step: StepResult }) {
  const icon = step.ok
    ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
    : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2 text-sm">
        {icon}
        <span className={step.ok ? "text-gray-800 dark:text-gray-200" : "text-red-700 dark:text-red-300 font-medium"}>
          {step.step}
          {!step.blocking && !step.ok && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">(non-blocking)</span>
          )}
        </span>
      </div>
      {step.errors?.map((e, i) => (
        <p key={i} className="ml-6 text-xs text-red-600 dark:text-red-400">{e.message}</p>
      ))}
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────

type WizardStep = "review" | "inputs" | "confirm" | "result"

interface WizardState {
  vendor: string
  price: string
  weight: string
  inventoryPolicy: "DENY" | "CONTINUE"
  languageTag: string
  unitCost: string
}

export default function ProductWizard({
  record,
  onClose,
}: {
  record: EdelweissRecord
  onClose: () => void
}) {
  const [step, setStep]       = useState<WizardStep>("review")
  const [form, setForm]       = useState<WizardState>({
    vendor:          "",
    price:           record.price_usd ?? "",
    weight:          record.weight_lbs ? String(record.weight_lbs) : "",
    inventoryPolicy: "DENY",
    languageTag:     "Ln_En",
    unitCost:        "",
  })
  const [submitting, setSubmitting]   = useState(false)
  const [result, setResult]           = useState<ProductCreateResponse | null>(null)
  const [error, setError]             = useState<string | null>(null)

  const set = (k: keyof WizardState) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }))

  const canProceedToConfirm =
    form.vendor.trim() &&
    form.price.trim() &&
    parseFloat(form.price) > 0

  // ── Submit ──

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const resp = await fetch(`${EW_BASE}/products/create`, {
        method: "POST",
        headers: ewHeaders(),
        body: JSON.stringify({
          isbn13:           record.isbn13,
          price:            form.price,
          vendor:           form.vendor,
          weight_lbs:       form.weight ? parseFloat(form.weight) : null,
          inventory_policy: form.inventoryPolicy,
          language_tag:     form.languageTag,
          unit_cost:        form.unitCost || null,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ detail: "Unknown error" }))
        throw new Error(body.detail ?? `HTTP ${resp.status}`)
      }
      setResult(await resp.json())
      setStep("result")
    } catch (e: any) {
      setError(e.message ?? "Request failed")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Layout ──

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col
                      bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Create Draft Product
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {record.isbn13} — {record.title ?? "Unknown title"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        {step !== "result" && (
          <div className="flex px-6 py-2 gap-6 border-b dark:border-gray-800 shrink-0">
            {(["review", "inputs", "confirm"] as WizardStep[]).map((s, i) => (
              <span key={s} className={`text-xs font-medium ${
                step === s ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"
              }`}>
                {i + 1}. {s === "review" ? "Review fields" : s === "inputs" ? "Pricing & vendor" : "Confirm"}
              </span>
            ))}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step: review ── */}
          {step === "review" && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Auto-populated from Edelweiss. These will be written exactly as shown.
              </p>
              {record.cover_image_url && (
                <div className="float-right ml-4 mb-2">
                  <img src={record.cover_image_url} alt="Cover"
                       className="h-28 w-auto rounded shadow" />
                </div>
              )}
              <FieldRow label="Title"        value={record.title ?? "—"} />
              <FieldRow label="Author(s)"    value={authorNames(record.contributors)} />
              <FieldRow label="Publisher"    value={record.publisher ?? "—"} />
              <FieldRow label="Format"       value={`${record.format ?? "—"} → tag: ${formatTag(record.format)}`} />
              <FieldRow label="Pub date"     value={`${pubDateDisplay(record.pub_date)} → tag: ${pubDateDisplay(record.pub_date)}`} mono />
              <FieldRow label="ISBN-13"      value={record.isbn13} mono />
              <FieldRow label="Weight"       value={record.weight_lbs ? `${record.weight_lbs} lbs (KAL rule applied)` : "Not found — enter manually"} />
              <FieldRow label="Description"  value={record.description
                ? <span className="text-xs text-gray-400">HTML ready ({record.description.length} chars)</span>
                : <span className="text-xs text-amber-500">Missing</span>} />
              {nonAuthors(record.contributors).length > 0 && (
                <FieldRow label="Also credited" value={
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {nonAuthors(record.contributors).map(c => `${c.name} (${c.role})`).join(" · ")}
                    {" — "}not mapped to Shopify fields
                  </span>
                } />
              )}
              <div className="mt-4 px-3 py-2 rounded bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium">Post-publish reminders:</span> Collections must be assigned manually after publishing.
              </div>
            </div>
          )}

          {/* ── Step: inputs ── */}
          {step === "inputs" && (
            <div className="space-y-5">
              {/* Vendor */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Vendor <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.vendor}
                  onChange={e => set("vendor")(e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600
                             dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  <option value="">Select vendor…</option>
                  {VENDOR_OPTIONS.map(v => (
                    <option key={v.code} value={v.code}>{v.label} ({v.code})</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Sets the Shopify Vendor field (e.g. "RDH" not full name)
                </p>
              </div>

              {/* Price */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Retail price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.price}
                    onChange={e => set("price")(e.target.value)}
                    placeholder="29.99"
                    className="w-full pl-7 pr-3 py-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600
                               dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
              </div>

              {/* Weight */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Weight (lbs)
                  {record.weight_lbs && (
                    <span className="ml-2 text-green-600 dark:text-green-400 font-normal">
                      ✓ extracted from Edelweiss ({record.weight_lbs} lbs)
                    </span>
                  )}
                </label>
                <input
                  type="number" step="1" min="0"
                  value={form.weight}
                  onChange={e => set("weight")(e.target.value)}
                  placeholder="1"
                  className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600
                             dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">
                  KAL rule: ceil(Edelweiss weight + 1 lb). Whole pounds only.
                </p>
              </div>

              {/* Inventory policy */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Inventory policy
                </label>
                <div className="flex gap-3">
                  {(["DENY", "CONTINUE"] as const).map(p => (
                    <label key={p} className={`flex items-center gap-2 px-4 py-2 rounded border cursor-pointer text-sm transition-colors ${
                      form.inventoryPolicy === p
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200"
                        : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                    }`}>
                      <input type="radio" name="invpolicy" checked={form.inventoryPolicy === p}
                             onChange={() => setForm(f => ({ ...f, inventoryPolicy: p }))}
                             className="text-blue-600" />
                      {p === "DENY" ? "Deny overselling" : "Allow overselling"}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Use "Allow" for direct/author orders. "Deny" for standard trade.
                </p>
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Language tag
                </label>
                <select
                  value={form.languageTag}
                  onChange={e => set("languageTag")(e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600
                             dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  {LANGUAGE_OPTIONS.map(l => (
                    <option key={l.tag} value={l.tag}>{l.label} ({l.tag})</option>
                  ))}
                </select>
              </div>

              {/* Unit cost */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Unit cost <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.unitCost}
                    onChange={e => set("unitCost")(e.target.value)}
                    placeholder="15.00"
                    className="w-full pl-7 pr-3 py-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600
                               dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">What KAL pays per copy</p>
              </div>
            </div>
          )}

          {/* ── Step: confirm ── */}
          {step === "confirm" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Review the complete payload before creating the product. All 5 Shopify API calls
                fire sequentially after confirmation.
              </p>

              <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Shopify product
                </div>
                <div className="px-4 divide-y dark:divide-gray-800">
                  <FieldRow label="Title"     value={record.title ?? "—"} />
                  <FieldRow label="Vendor"    value={`${form.vendor}`} mono />
                  <FieldRow label="Barcode"   value={record.isbn13} mono />
                  <FieldRow label="Price"     value={`$${form.price}`} />
                  <FieldRow label="Weight"    value={`${form.weight || record.weight_lbs || "—"} lbs`} />
                  <FieldRow label="Inv. policy" value={form.inventoryPolicy} mono />
                  <FieldRow label="Format tag"  value={`${formatTag(record.format)} → binding: ${record.format}`} />
                  <FieldRow label="Pub date tag" value={pubDateDisplay(record.pub_date)} mono />
                  <FieldRow label="Language"  value={`${LANGUAGE_OPTIONS.find(l => l.tag === form.languageTag)?.label} (${form.languageTag})`} />
                  <FieldRow label="Status"    value="DRAFT" mono />
                  {form.unitCost && <FieldRow label="Unit cost" value={`$${form.unitCost}`} />}
                </div>
              </div>

              <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Metafields
                </div>
                <div className="px-4 divide-y dark:divide-gray-800">
                  <FieldRow label="custom.author"  value={authorNames(record.contributors)} />
                  <FieldRow label="custom.binding" value={record.format ?? "Paperback"} />
                  <FieldRow label="custom.pub_date" value={record.pub_date ?? "—"} mono />
                  <FieldRow label="custom.language" value={`["${LANGUAGE_OPTIONS.find(l => l.tag === form.languageTag)?.label}"]`} mono />
                </div>
              </div>

              <div className="px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                <strong>After publishing:</strong> Assign collections manually. Cover image attached automatically.
              </div>

              {error && (
                <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step: result ── */}
          {step === "result" && result && (
            <div className="space-y-4">
              {result.product_id ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">Product created</p>
                    {result.shopify_admin_url && (
                      <a href={result.shopify_admin_url} target="_blank" rel="noopener noreferrer"
                         className="text-xs text-green-700 dark:text-green-300 hover:underline flex items-center gap-1 mt-0.5">
                        View in Shopify admin <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">Product creation failed</p>
                </div>
              )}

              <div className="space-y-2">
                {result.steps.map(s => <StepRow key={s.step} step={s} />)}
              </div>

              <div className="px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
                <strong>Next steps:</strong> Assign collections · Set inventory quantity · Review description · Publish when ready
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t dark:border-gray-700 shrink-0 bg-gray-50 dark:bg-gray-900">
          {step === "result" ? (
            <button onClick={onClose}
                    className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600
                               text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
              Close
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  if (step === "review")   onClose()
                  if (step === "inputs")   setStep("review")
                  if (step === "confirm")  setStep("inputs")
                }}
                className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600
                           text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {step === "review" ? "Cancel" : "Back"}
              </button>

              <button
                onClick={() => {
                  if (step === "review")  setStep("inputs")
                  if (step === "inputs")  setStep("confirm")
                  if (step === "confirm") submit()
                }}
                disabled={step === "inputs" && !canProceedToConfirm || submitting}
                className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                           disabled:opacity-40 transition flex items-center gap-2"
              >
                {submitting && <Loader className="w-4 h-4 animate-spin" />}
                {step === "review"  ? "Continue →" :
                 step === "inputs"  ? "Review payload →" :
                 submitting         ? "Creating…" : "Create product"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}