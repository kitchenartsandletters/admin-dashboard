// src/components/tools/EdelweissLookup.tsx
// Route: /tools/edelweiss-lookup

import { useState, useRef } from "react"
import { ExternalLink } from "lucide-react"

const EW_BASE  = import.meta.env.VITE_EDELWEISS_SERVICE_URL as string
const EW_KEY   = import.meta.env.VITE_EDELWEISS_ADMIN_KEY as string

const ewHeaders = () => ({
  "Content-Type": "application/json",
  "x-admin-key": EW_KEY,
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contributor { name: string; role: string }

interface EdelweissRecord {
  isbn13: string
  edelweiss_url: string
  title: string | null
  contributors: Contributor[]
  publisher: string | null
  pub_date: string | null
  pub_date_raw: string | null
  format: string | null
  description: string | null
  cover_image_url: string | null
  interior_image_urls: string[]
  scraped_at: string
  selector_version: string
  scrape_warnings: string[]
}

interface LookupResult {
  source: "cache" | "scrape" | "fresh_scrape"
  record: EdelweissRecord
}

// Which fields can be selected for import
const IMPORTABLE_FIELDS = [
  { key: "title",               label: "Title",            dest: "Product title" },
  { key: "contributors",        label: "Contributors",     dest: "metafield: custom.author" },
  { key: "publisher",           label: "Publisher",        dest: "Vendor" },
  { key: "pub_date",            label: "Pub Date",         dest: "metafield: custom.pub_date" },
  { key: "format",              label: "Format / Binding", dest: "metafield: custom.format" },
  { key: "description",         label: "Description",      dest: "Body HTML" },
  { key: "cover_image_url",     label: "Cover Image",      dest: "Product image" },
  { key: "interior_image_urls", label: "Interior Images",  dest: "Additional images" },
] as const

type FieldKey = typeof IMPORTABLE_FIELDS[number]["key"]

const DEFAULT_SELECTED: Set<FieldKey> = new Set([
  "title", "contributors", "publisher", "pub_date", "format", "description", "cover_image_url",
])

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatScrapedAt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
    timeZoneName: "short",
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: LookupResult["source"] }) {
  const isCache = source === "cache"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border
      ${isCache
        ? "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/30 dark:border-green-800"
        : "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-800"
      }`}>
      {isCache ? "⚡ cache" : "🔍 live scrape"}
    </span>
  )
}

function FieldRow({
  fieldKey, label, dest, value, selected, onToggle,
}: {
  fieldKey: FieldKey
  label: string
  dest: string
  value: React.ReactNode
  selected: boolean
  onToggle: () => void
}) {
  return (
    <tr
      className={`border-b border-gray-100 dark:border-gray-700 last:border-0 cursor-pointer
        ${selected ? "bg-blue-50/40 dark:bg-blue-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}
      onClick={onToggle}
    >
      <td className="px-4 py-2.5 w-8">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={e => e.stopPropagation()}
          className="rounded text-blue-600"
        />
      </td>
      <td className="px-4 py-2.5 text-xs font-medium text-gray-700 dark:text-gray-300 w-36">{label}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 w-48">{dest}</td>
      <td className="px-4 py-2.5 text-xs text-gray-900 dark:text-gray-100 max-w-xs">{value}</td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EdelweissLookup() {
  const [isbn, setIsbn]             = useState("")
  const [result, setResult]         = useState<LookupResult | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [selected, setSelected]     = useState<Set<FieldKey>>(new Set(DEFAULT_SELECTED))
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const inputRef                    = useRef<HTMLInputElement>(null)

  // ── Fetch ──

  const lookup = async (fresh = false) => {
    const clean = isbn.replace(/[^0-9Xx]/g, "").trim()
    if (clean.length < 10) {
      setError("Enter a valid ISBN-10 or ISBN-13")
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const url = `${EW_BASE}/lookup/${clean}${fresh ? "/fresh" : ""}`
      const res = await fetch(url, { headers: ewHeaders() })
      if (res.status === 404) {
        setError(`No Edelweiss+ record found for ISBN ${clean}`)
        return
      }
      if (!res.ok) {
        setError(`Server error ${res.status} — check edelweiss-service logs`)
        return
      }
      setResult(await res.json())
    } catch {
      setError("Could not reach edelweiss-service. Confirm it is running and VITE_EDELWEISS_SERVICE_URL is set.")
    } finally {
      setLoading(false)
    }
  }

  const toggleField = (key: FieldKey) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const toggleAll = () =>
    setSelected(selected.size === IMPORTABLE_FIELDS.length
      ? new Set()
      : new Set(IMPORTABLE_FIELDS.map(f => f.key))
    )

  // ── Value renderers ──

  const renderValue = (key: FieldKey, rec: EdelweissRecord): React.ReactNode => {
    switch (key) {
      case "title":
        return <span className="font-medium">{rec.title ?? "—"}</span>
      case "contributors":
        return rec.contributors.length
          ? rec.contributors.map(c => `${c.name} (${c.role})`).join(", ")
          : "—"
      case "publisher":
        return rec.publisher ?? "—"
      case "pub_date":
        return rec.pub_date_raw ?? rec.pub_date ?? "—"
      case "format":
        return rec.format ?? "—"
      case "description":
        return rec.description
          ? (
            <div
              className="max-h-24 overflow-y-auto text-[11px] leading-relaxed prose prose-xs dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: rec.description }}
            />
          ) : "—"
      case "cover_image_url":
        return rec.cover_image_url
          ? (
            <img
              src={rec.cover_image_url}
              alt="Cover"
              className="h-16 w-auto rounded shadow cursor-zoom-in"
              onClick={e => { e.stopPropagation(); setLightboxUrl(rec.cover_image_url) }}
            />
          ) : "—"
      case "interior_image_urls":
        return rec.interior_image_urls.length
          ? (
            <div className="flex gap-1.5 flex-wrap">
              {rec.interior_image_urls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Interior ${i + 1}`}
                  className="h-12 w-auto rounded shadow cursor-zoom-in border border-gray-200 dark:border-gray-700"
                  onClick={e => { e.stopPropagation(); setLightboxUrl(url) }}
                />
              ))}
            </div>
          ) : "—"
    }
  }

  const rec = result?.record

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Edelweiss Lookup</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Tools › Edelweiss Lookup
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-6">
        <input
          ref={inputRef}
          type="text"
          value={isbn}
          onChange={e => setIsbn(e.target.value)}
          onKeyDown={e => e.key === "Enter" && lookup()}
          placeholder="ISBN-13 (e.g. 9781250301697)"
          className="flex-1 px-3 py-2 border rounded text-sm dark:bg-gray-900 dark:border-gray-700
                     dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
        />
        <button
          onClick={() => lookup(false)}
          disabled={loading}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition"
        >
          {loading ? "Searching…" : "Look Up"}
        </button>
        {result && (
          <button
            onClick={() => lookup(true)}
            disabled={loading}
            title="Force fresh scrape — bypass cache"
            className="px-3 py-2 rounded border border-gray-200 dark:border-gray-700
                       hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 transition"
          >
            ↻ Fresh
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded border border-red-200 dark:border-red-800
                        bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Result */}
      {rec && (
        <div className="space-y-4">

          {/* Title card */}
          <div className="flex gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                          rounded-lg shadow-sm">
            {rec.cover_image_url && (
              <img
                src={rec.cover_image_url}
                alt="Cover"
                className="h-28 w-auto rounded shadow shrink-0 cursor-zoom-in"
                onClick={() => setLightboxUrl(rec.cover_image_url)}
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                {rec.title ?? "Unknown Title"}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {rec.contributors.map(c => c.name).join(", ")}
              </p>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                {rec.publisher  && <span>📚 {rec.publisher}</span>}
                {rec.pub_date_raw && <span>📅 {rec.pub_date_raw}</span>}
                {rec.format     && <span>📖 {rec.format}</span>}
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <SourceBadge source={result!.source} />
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  ISBN {rec.isbn13}
                </span>
                {rec.scrape_warnings.length > 0 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠ {rec.scrape_warnings.length} warning{rec.scrape_warnings.length > 1 ? "s" : ""}
                  </span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                  Scraped {formatScrapedAt(rec.scraped_at)}
                </span>
                <a
                  href={`https://www.edelweiss.plus/#keywordSearch&q=${rec.isbn13}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                >
                  View on Edelweiss+ <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Field selection table */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Fields to import
              </p>
              <button
                onClick={toggleAll}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {selected.size === IMPORTABLE_FIELDS.length ? "Deselect all" : "Select all"}
              </button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-2 w-8" />
                  <th className="text-left px-4 py-2 font-medium">Field</th>
                  <th className="text-left px-4 py-2 font-medium">Shopify destination</th>
                  <th className="text-left px-4 py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {IMPORTABLE_FIELDS.map(f => (
                  <FieldRow
                    key={f.key}
                    fieldKey={f.key}
                    label={f.label}
                    dest={f.dest}
                    value={renderValue(f.key, rec)}
                    selected={selected.has(f.key)}
                    onToggle={() => toggleField(f.key)}
                  />
                ))}
              </tbody>
            </table>

            {/* Action bar */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700
                            bg-gray-50 dark:bg-gray-900/50">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selected.size} of {IMPORTABLE_FIELDS.length} fields selected
              </span>
              <div className="flex gap-2">
                <button
                  disabled={selected.size === 0}
                  className="px-4 py-1.5 rounded border border-gray-300 dark:border-gray-600
                             text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800
                             disabled:opacity-40 transition"
                  title="Shopify product creation coming in next phase"
                  onClick={() => alert("Product Builder coming soon — this will create a Shopify draft product with the selected fields.")}
                >
                  Create Draft Product
                </button>
              </div>
            </div>
          </div>

          {/* Scrape warnings (if any) */}
          {rec.scrape_warnings.length > 0 && (
            <div className="px-4 py-3 rounded border border-amber-200 dark:border-amber-800
                            bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <p className="font-medium uppercase tracking-wide text-[10px]">Scrape warnings</p>
              {rec.scrape_warnings.map((w, i) => <p key={i}>• {w}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-h-[85vh] max-w-[85vw] rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white text-2xl font-light hover:text-gray-300"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}