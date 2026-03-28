import React, { useState, useEffect, useRef, useMemo } from "react";
import ConfirmModal from "./ConfirmModal";
import RightSidebar from "./RightSidebar";

interface BlacklistEntry {
  barcode: string;
  title: string;
  handle: string;
  author: string;
  product_id: number;
}

const ADMIN_API_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;
const BLACKLIST_API_BASE = import.meta.env.VITE_BLACKLIST_URL;
const SHOPIFY_ADMIN_PREFIX = 'https://admin.shopify.com/store/castironbooks/products/';

const fetchShopifyProductDetails = async (input: string): Promise<BlacklistEntry | null> => {
  const barcodeQuery = `{
    productVariants(first: 1, query: "barcode:${input}") {
      edges {
        node {
          barcode
          sku
          product { id title handle }
        }
      }
    }
  }`;

  try {
    const res = await fetch(`${BLACKLIST_API_BASE}/api/shopify/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: barcodeQuery })
    });

    const json = await res.json();
    const variant = json?.data?.productVariants?.edges?.[0]?.node;
    if (variant?.product) {
      return {
        barcode: variant.barcode,
        title: variant.product.title,
        handle: variant.product.handle,
        author: variant.sku || "Unknown",
        product_id: parseInt(variant.product.id.split("/").pop())
      };
    }

    const productIdQuery = `{
      product(id: "gid://shopify/Product/${input}") {
        id title handle
        variants(first: 1) {
          edges { node { barcode sku } }
        }
      }
    }`;

    const productRes = await fetch(`${BLACKLIST_API_BASE}/api/shopify/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: productIdQuery })
    });

    const productJson = await productRes.json();
    const product = productJson?.data?.product;
    const pidVariant = product?.variants?.edges?.[0]?.node;
    if (product && pidVariant) {
      return {
        barcode: pidVariant.barcode,
        title: product.title,
        handle: product.handle,
        author: pidVariant.sku || "Unknown",
        product_id: parseInt(product.id.split("/").pop())
      };
    }
    return null;
  } catch (err) {
    console.error("Shopify fetch error:", err);
    return null;
  }
};

const BlacklistManager = () => {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [previewEntries, setPreviewEntries] = useState<BlacklistEntry[] | null>(null);
  const [successModal, setSuccessModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportModal, setExportModal] = useState<{ success: boolean; message: string } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof BlacklistEntry; direction: "asc" | "desc" } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<BlacklistEntry | null>(null);
  const [docsFilePath, setDocsFilePath] = useState<string | null>(null);
  const removeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const fetchBlacklist = async () => {
    try {
      const res = await fetch(`${BLACKLIST_API_BASE}/api/blacklist?token=${ADMIN_API_TOKEN}`);
      const json = await res.json();
      setEntries(json);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchBlacklist(); }, []);

  const handleAdd = async () => {
    if (loading || !barcodeInput.trim()) return;
    setInputError(null);
    const normalizedInputs = barcodeInput.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

    setLoading(true);
    const fetchedEntries: BlacklistEntry[] = [];
    for (const input of normalizedInputs) {
      const enriched = await fetchShopifyProductDetails(input);
      if (enriched && !entries.some(e => e.product_id === enriched.product_id)) {
        fetchedEntries.push(enriched);
      }
    }
    setLoading(false);

    if (fetchedEntries.length === 0) {
      setErrorModal({ title: "No New Products", message: "Products not found or already blacklisted." });
    } else {
      setPreviewEntries(fetchedEntries);
    }
  };

  const confirmAdd = async (entriesToAdd: BlacklistEntry[]) => {
    setLoading(true);
    try {
      const res = await fetch(`${BLACKLIST_API_BASE}/api/blacklist/add?token=${ADMIN_API_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entriesToAdd),
      });
      if (res.ok) {
        setSuccessModal("Successfully added to blacklist");
        fetchBlacklist();
        setBarcodeInput("");
      }
    } catch (err) { console.error(err); }
    setLoading(false);
    setPreviewEntries(null);
  };

  const handleRemove = async (product_id: number) => {
    if (removing) return;
    setRemoving(product_id.toString());
    removeTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`${BLACKLIST_API_BASE}/api/blacklist/remove?token=${ADMIN_API_TOKEN}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id })
        });
        setEntries((prev) => prev.filter(e => e.product_id !== product_id));
      } catch (err) { console.error(err); }
      setRemoving(null);
    }, 400);
  };

  const filteredEntries = useMemo(() => {
    let filtered = entries.filter(e => {
      const term = searchTerm.toLowerCase();
      return e.title.toLowerCase().includes(term) || e.barcode.includes(term) || e.author.toLowerCase().includes(term);
    });
    if (sortConfig) {
      filtered.sort((a, b) => {
        const aVal = String(a[sortConfig.key]).toLowerCase();
        const bVal = String(b[sortConfig.key]).toLowerCase();
        return sortConfig.direction === "asc" ? (aVal < bVal ? -1 : 1) : (aVal > bVal ? -1 : 1);
      });
    }
    return filtered;
  }, [entries, searchTerm, sortConfig]);

  const closeModal = () => {
    setErrorModal(null);
    setSuccessModal(null);
    setExportModal(null);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch(`${BLACKLIST_API_BASE}/api/blacklist/export_snippet?token=${ADMIN_API_TOKEN}`, { 
        method: "POST" 
      });
      const json = await res.json();
      setExportModal({ 
        success: json.success, 
        message: json.success ? "Liquid snippet exported successfully." : "Export failed." 
      });
    } catch (err) {
      setExportModal({ success: false, message: "A network error occurred during export." });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white dark:bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Blacklist Manager</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Prevent specific products from sync or display.</p>
        </div>
        <button
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          onClick={() => setDocsFilePath("/docs/blacklist-manager.md")}
        >
          View Documentation
        </button>
      </div>

      {/* Add Section */}
      <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border dark:border-gray-800 shadow-sm space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Quick Add</label>
        <div className="flex gap-2">
          <input
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            placeholder="Barcode or Product ID..."
            className="flex-1 px-3 py-2 border rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Searching..." : "Add"}
          </button>
        </div>
        {inputError && <p className="text-red-500 text-xs">{inputError}</p>}
      </div>

      {/* Search/Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter list..."
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
          />
          <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-md dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider font-bold">
            <tr>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="hidden md:table-cell px-4 py-3 text-left">Barcode</th>
              <th className="hidden lg:table-cell px-4 py-3 text-left">Author/SKU</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredEntries.map((e) => (
              <tr 
                key={e.product_id} 
                className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${removing === e.product_id.toString() ? 'opacity-0 scale-95 duration-400' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-white truncate max-w-[180px] sm:max-w-xs">{e.title}</div>
                  <div className="text-[10px] font-mono text-gray-400">{e.product_id}</div>
                </td>
                <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-gray-500">{e.barcode}</td>
                <td className="hidden lg:table-cell px-4 py-3 text-gray-500 truncate max-w-[150px]">{e.author}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                  <button onClick={() => setSelectedEntry(e)} className="text-blue-600 dark:text-blue-400 font-medium sm:hidden">Details</button>
                  <button onClick={() => handleRemove(e.product_id)} className="text-red-600 hover:text-red-800 font-medium">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end pt-4 border-t dark:border-gray-800">
        <button
          onClick={handleExport}
          disabled={isExporting}
          className={`
            flex items-center gap-2 px-6 py-2.5 rounded-md text-sm font-bold transition-all
            ${isExporting 
              ? "bg-gray-400 cursor-not-allowed text-white" 
              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm active:scale-95"
            }
          `}
        >
          {isExporting ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Exporting to Shopify...
            </>
          ) : (
            <>
              <span className="text-lg">📦</span>
              Export to Shopify
            </>
          )}
        </button>
      </div>

      {/* Sidebar and Guides */}
      <RightSidebar
        row={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title="Product Details"
        renderRowContent={() => selectedEntry && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500">Title</label>
                <p className="text-gray-900 dark:text-white font-medium">{selectedEntry.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500">ID</label>
                  <p className="font-mono text-xs dark:text-gray-300">{selectedEntry.product_id}</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500">Barcode</label>
                  <p className="font-mono text-xs dark:text-gray-300">{selectedEntry.barcode}</p>
                </div>
              </div>
            </div>
            <a href={`${SHOPIFY_ADMIN_PREFIX}${selectedEntry.product_id}`} target="_blank" rel="noreferrer" className="block w-full text-center py-2 bg-blue-600 text-white rounded font-bold text-sm">Open in Shopify Admin ↗</a>
          </div>
        )}
      />

      {docsFilePath && (
        <RightSidebar title="Blacklist Guide" docsFilePath={docsFilePath} onClose={() => setDocsFilePath(null)} />
      )}

      {/* Modals with missing onCancel props fixed */}
      {previewEntries && (
        <ConfirmModal
          open={true}
          title={`Add ${previewEntries.length} Item(s)?`}
          confirmLabel="Confirm"
          onConfirm={() => confirmAdd(previewEntries)}
          onCancel={() => setPreviewEntries(null)}
        >
          <ul className="space-y-2 max-h-60 overflow-y-auto">
            {previewEntries.map(e => (
              <li key={e.product_id} className="text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded">
                <span className="font-bold">{e.title}</span> ({e.barcode})
              </li>
            ))}
          </ul>
        </ConfirmModal>
      )}

      {(errorModal || successModal || exportModal) && (
        <ConfirmModal
          open={true}
          title={errorModal?.title || (exportModal?.success ? "Success" : "Status")}
          description={errorModal?.message || successModal || exportModal?.message}
          confirmLabel="OK"
          onConfirm={closeModal}
          onCancel={closeModal} // Missing property fixed
        />
      )}
    </div>
  );
};

export default BlacklistManager;