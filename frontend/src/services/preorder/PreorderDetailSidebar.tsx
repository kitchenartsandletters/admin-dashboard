// PreorderDetailSidebar.tsx
import React, { useEffect, useState, useRef } from "react"
import { PreorderRow } from "../../types/preorderTypes"
import { formatDate } from "../../utils/tableUtils"

interface PreorderDetailSidebarProps {
  row: PreorderRow | null
  onClose: () => void
}

const SHOPIFY_ADMIN_PREFIX = "https://admin.shopify.com/store/castironbooks/products/"

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
    <span className={`text-gray-900 dark:text-gray-100 mt-0.5 ${mono ? "font-mono" : ""}`}>
      {value ?? "—"}
    </span>
  </div>
)

const ConfidenceBadge = ({ confidence }: { confidence: "verified" | "estimated" }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border-0 ${
      confidence === "verified"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
    }`}
  >
    {confidence === "verified" ? "✓ verified" : "~ estimated"}
  </span>
)

const PreorderDetailSidebar: React.FC<PreorderDetailSidebarProps> = ({ row, onClose }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (row) {
      setShouldRender(true)
      setTimeout(() => {
        setIsVisible(true)
        contentRef.current?.scrollTo(0, 0)
      }, 10)
    } else {
      setIsVisible(false)
      const timer = setTimeout(() => setShouldRender(false), 300)
      return () => clearTimeout(timer)
    }
  }, [row])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isVisible) handleClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isVisible])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 300)
  }

  if (!shouldRender || !row) return null

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[28rem] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 transition-transform duration-300 transform ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white leading-tight">
              Preorder Details
            </h3>
            <p className="text-[11px] font-mono text-gray-400 uppercase tracking-tighter">
              PID: {row.product_id}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          className="p-5 text-sm space-y-8 overflow-y-auto h-[calc(100%-4.5rem)] pb-24"
        >
          {/* Identity */}
          <section>
            <div className="flex justify-between items-start mb-4">
              <h4 className="font-bold text-gray-900 dark:text-white uppercase text-[11px] tracking-widest border-l-2 border-blue-500 pl-2">
                Product Identity
              </h4>
              <a
                href={`${SHOPIFY_ADMIN_PREFIX}${row.product_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Shopify Admin ↗
              </a>
            </div>
            <div className="space-y-3">
              <DetailItem label="Title" value={row.title} />
              <DetailItem label="ISBN" value={row.isbn} mono />
            </div>
          </section>

          {/* Classification & Timing */}
          <section>
            <h4 className="font-bold text-gray-900 dark:text-white uppercase text-[11px] tracking-widest border-l-2 border-purple-500 pl-2 mb-4">
              Classification & Timing
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem
                label="Classification"
                value={row.classification?.replace(/_/g, " ")}
              />
              <DetailItem
                label="Arrival Timing"
                value={row.arrival_timing?.replace(/_/g, " ") ?? "—"}
              />
              <DetailItem label="Pub Date" value={formatDate(row.pub_date)} mono />
              <DetailItem label="Anomaly" value={row.anomaly_type} />
            </div>
            {row.early_stock_arrival && (
              <div className="mt-3 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 rounded text-xs text-purple-700 dark:text-purple-300 font-medium">
                ⚠ Early stock has arrived before pub date
              </div>
            )}
            {row.due_for_release_review && (
              <div className="mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-700 dark:text-amber-300 font-medium">
                ⚡ Due for release review within 7 days
              </div>
            )}
          </section>

          {/* Presale Data */}
          <section>
            <h4 className="font-bold text-gray-900 dark:text-white uppercase text-[11px] tracking-widest border-l-2 border-green-500 pl-2 mb-4">
              Presale Data
            </h4>
            <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md border dark:border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                  Data Confidence
                </span>
                <ConfidenceBadge confidence={row.data_confidence} />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-1 border-t dark:border-gray-700">
                <DetailItem
                  label="Live Presales"
                  value={row.live_presale_qty.toLocaleString()}
                  mono
                />
                <DetailItem
                  label="Est. Presales"
                  value={row.estimated_presale_qty.toLocaleString()}
                  mono
                />
              </div>
              {row.data_confidence === "estimated" && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  This title has backfill-sourced history. Live figure reflects
                  post-Feb 2026 verified events only.
                </p>
              )}
            </div>
          </section>

          {/* Metadata */}
          <section>
            <h4 className="font-bold text-gray-900 dark:text-white uppercase text-[11px] tracking-widest border-l-2 border-gray-400 pl-2 mb-4">
              Metadata
            </h4>
            <div className="space-y-3">
              <DetailItem label="Override Status" value={row.override_status} />
              <DetailItem label="Last Updated" value={row.last_updated} mono />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-950 border-t dark:border-gray-800">
          <button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded shadow-lg transition-all active:scale-[0.98]"
            onClick={() => console.log("Reclassify product:", row.product_id)}
          >
            Reclassify Product
          </button>
        </div>
      </div>
    </>
  )
}

export default PreorderDetailSidebar