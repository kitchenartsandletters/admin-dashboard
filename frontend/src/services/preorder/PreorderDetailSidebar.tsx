import React, { useEffect, useState, useRef } from "react"
import { PreorderRow } from "../../types/preorderTypes"

interface PreorderDetailSidebarProps {
  row: PreorderRow | null
  onClose: () => void
}

const SHOPIFY_ADMIN_PREFIX = "https://admin.shopify.com/store/castironbooks/products/"

// Helper component for consistent label/value styling
const DetailItem = ({ label, value, mono = false }: { label: string; value: string | number | null | undefined; mono?: boolean }) => (
  <div className="flex flex-col py-1 border-b border-gray-50 dark:border-gray-800 last:border-0">
    <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">
      {label}
    </span>
    <span className={`text-gray-900 dark:text-gray-100 mt-0.5 ${mono ? 'font-mono' : ''}`}>
      {value ?? "—"}
    </span>
  </div>
)

const PreorderDetailSidebar: React.FC<PreorderDetailSidebarProps> = ({ row, onClose }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Handle Animation & Lifecycle
  useEffect(() => {
    if (row) {
      setShouldRender(true)
      // Small timeout to allow the slide-in animation to trigger after mounting
      setTimeout(() => {
        setIsVisible(true)
        contentRef.current?.scrollTo(0, 0)
      }, 10)
    } else {
      setIsVisible(false)
      // Wait for animation to finish before unmounting
      const timer = setTimeout(() => setShouldRender(false), 300)
      return () => clearTimeout(timer)
    }
  }, [row])

  // Keyboard support (Escape to close)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isVisible) {
        handleClose()
      }
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
      {/* Backdrop with blur - matched to RightSidebar */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      {/* Sidebar Container - matched to RightSidebar sm:w-[28rem] */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[28rem] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 transition-transform duration-300 transform ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header - matched to RightSidebar styling */}
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

        {/* Scrollable Content Area */}
        <div
          ref={contentRef}
          className="p-5 text-sm space-y-8 overflow-y-auto h-[calc(100%-4.5rem)] pb-24"
        >
          {/* Identity Section */}
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
              <DetailItem label="Vendor" value={row.vendor} />
            </div>
          </section>

          {/* Status Section */}
          <section>
            <h4 className="font-bold text-gray-900 dark:text-white uppercase text-[11px] tracking-widest border-l-2 border-purple-500 pl-2 mb-4">
              Classification & Timing
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Classification" value={row.classification_status.replace(/_/g, ' ')} />
              <DetailItem label="Arrival Timing" value={row.arrival_timing.replace(/_/g, ' ')} />
              <DetailItem label="Pub Date" value={row.effective_pub_date} mono />
              <DetailItem label="Anomaly" value={row.anomaly_type} />
            </div>
          </section>

          {/* Lifecycle Section */}
          <section>
            <h4 className="font-bold text-gray-900 dark:text-white uppercase text-[11px] tracking-widest border-l-2 border-green-500 pl-2 mb-4">
              Lifecycle & Sales
            </h4>
            <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md border dark:border-gray-800 grid grid-cols-2 gap-4">
              <DetailItem label="Current State" value={row.lifecycle_state} />
              <DetailItem label="Presale Commitments" value={row.presale_commitment_total} mono />
            </div>
          </section>

          {/* Reporting Section */}
          <section>
            <h4 className="font-bold text-gray-900 dark:text-white uppercase text-[11px] tracking-widest border-l-2 border-amber-500 pl-2 mb-4">
              Reporting Cycle
            </h4>
            <div className="space-y-3">
              <DetailItem label="Released to Reporting" value={row.released_to_reporting ? "YES" : "NO"} />
              <DetailItem label="Target Report Week" value={row.release_report_week_start} mono />
              <DetailItem label="CSV Output" value={row.csv_filename} />
            </div>
          </section>

          {/* Action Footer - Fixed at bottom of sidebar content */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-950 border-t dark:border-gray-800">
            <button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded shadow-lg transition-all active:scale-[0.98]"
              onClick={() => console.log("Reclassify product:", row.product_id)}
            >
              Reclassify Product
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default PreorderDetailSidebar