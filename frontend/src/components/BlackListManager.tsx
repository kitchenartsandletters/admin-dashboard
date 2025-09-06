import React, { useState, useEffect, useRef } from "react";
import ConfirmModal from "./ConfirmModal";

interface BlacklistEntry {
  barcode: string;
  title: string;
  handle: string;
  author: string;
  product_id: number;
}

const ADMIN_API_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;
const BLACKLIST_API_BASE = import.meta.env.VITE_BLACKLIST_URL;

const fetchShopifyProductDetails = async (input: string): Promise<BlacklistEntry | null> => {
  const isProductId = /^\d+$/.test(input);
  const query = isProductId
    ? `{
        product(id: "gid://shopify/Product/${input}") {
          id
          title
          handle
          variants(first: 1) {
            edges {
              node {
                barcode
                sku
              }
            }
          }
        }
      }`
    : `{
        productVariants(first: 1, query: "barcode:${input}") {
          edges {
            node {
              barcode
              sku
              product {
                id
                title
                handle
              }
            }
          }
        }
      }`;

  try {
    const res = await fetch(`${BLACKLIST_API_BASE}/api/shopify/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    });
    const json = await res.json();
    if (isProductId) {
      if (!json.data || !json.data.product) return null;
      const product = json.data.product;
      const variant = product?.variants?.edges?.[0]?.node;
      if (!product || !variant) return null;
      return {
        barcode: variant.barcode,
        title: product.title,
        handle: product.handle,
        author: variant.sku,
        product_id: parseInt(product.id.split("/").pop())
      };
    } else {
      if (!json.data || !json.data.productVariants) return null;
      const edge = json.data.productVariants.edges[0];
      if (!edge) return null;
      const variant = edge.node;
      if (!variant || !variant.product) return null;
      return {
        barcode: variant.barcode,
        title: variant.product.title,
        handle: variant.product.handle,
        author: variant.sku,
        product_id: parseInt(variant.product.id.split("/").pop())
      };
    }
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
  const [inputError, setInputError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof BlacklistEntry; direction: "asc" | "desc" } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const removeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Moved renderSortIcon inside component to access sortConfig correctly
  const renderSortIcon = (key: keyof BlacklistEntry): string => {
    if (!sortConfig || sortConfig.key !== key) return "⇅";
    return sortConfig.direction === "asc" ? "▲" : "▼";
  };

  const validateInput = (input: string): boolean => {
    // Reject if input is symbols only or empty after trim
    if (!input.trim()) return false;
    if (/^[^\w\d]+$/.test(input)) return false;
    // If input is digits only (product ID), must be at least 4 chars
    if (/^\d+$/.test(input) && input.length < 4) return false;
    return true;
  };

  const fetchBlacklist = async () => {
    try {
      const res = await fetch(`${BLACKLIST_API_BASE}/api/blacklist?token=${ADMIN_API_TOKEN}`);
      const json = await res.json();
      setEntries(json);
    } catch (err) {
      console.error("Failed to fetch blacklist:", err);
    }
  };

  useEffect(() => {
    fetchBlacklist();
  }, []);

  useEffect(() => {
    if (successModal) {
      const timer = setTimeout(() => setSuccessModal(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successModal]);

  const handleAdd = async () => {
    if (loading) return;
    setInputError(null);
    const normalizedInputs = barcodeInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (normalizedInputs.length === 0) {
      setInputError("Please enter at least one barcode or product ID.");
      return;
    }

    for (const input of normalizedInputs) {
      if (!validateInput(input)) {
        setInputError(`Invalid input: "${input}"`);
        return;
      }
    }

    // Check for duplicates in existing entries
    const duplicates = normalizedInputs.filter(input =>
      entries.some(e => e.barcode === input || e.product_id.toString() === input)
    );
    if (duplicates.length > 0) {
      setErrorModal({
        title: "Duplicate Entry",
        message: `This product${duplicates.length > 1 ? "s are" : " is"} already on the blacklist: ${duplicates.join(", ")}`
      });
      return;
    }

    setLoading(true);
    const fetchedEntries: BlacklistEntry[] = [];
    for (const input of normalizedInputs) {
      const enriched = await fetchShopifyProductDetails(input);
      if (enriched) {
        // Avoid duplicates in preview list
        if (!fetchedEntries.some(e => e.barcode === enriched.barcode)) {
          fetchedEntries.push(enriched);
        }
      }
    }
    setLoading(false);

    if (fetchedEntries.length === 0) {
      setErrorModal({ title: "No Products Found", message: "No valid products found for the given inputs." });
      return;
    }

    // Check if any fetched entries are duplicates again (in case input was different but product same)
    const alreadyBlacklisted = fetchedEntries.filter(fe =>
      entries.some(e => e.barcode === fe.barcode)
    );
    if (alreadyBlacklisted.length > 0) {
      setErrorModal({
        title: "Duplicate Entry",
        message: `This product${alreadyBlacklisted.length > 1 ? "s are" : " is"} already on the blacklist: ${alreadyBlacklisted.map(e => e.barcode).join(", ")}`
      });
      return;
    }

    setPreviewEntries(fetchedEntries);
  };

  const confirmAdd = async (entriesToAdd: BlacklistEntry[]) => {
    setLoading(true);
    try {
      const res = await fetch(`${BLACKLIST_API_BASE}/api/blacklist/add?token=${ADMIN_API_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entriesToAdd),
      });

      if (!res.ok) {
        if (res.status === 422) {
          setErrorModal({ title: "Duplicate Entry", message: "One or more products are already on the blacklist." });
        } else {
          const errText = await res.text();
          setErrorModal({ title: "❌ Failed to Add", message: errText });
        }
      } else {
        setSuccessModal("✅ Successfully added to blacklist");
        fetchBlacklist();
      }
    } catch (err) {
      setErrorModal({ title: "Error", message: "Failed to add entries." });
      console.error(err);
    }
    setLoading(false);
    setPreviewEntries(null);
    setBarcodeInput("");
  };

  const handleRemove = async (barcode: string) => {
    if (removing) return; // Prevent multiple removals at once
    setRemoving(barcode);
    // Wait for animation to finish before removing from state
    removeTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`${BLACKLIST_API_BASE}/api/blacklist/remove?token=${ADMIN_API_TOKEN}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ barcode })
        });
        setEntries((prev) => prev.filter(e => e.barcode !== barcode));
      } catch (err) {
        console.error("Failed to remove:", err);
      }
      setRemoving(null);
    }, 400); // Match CSS animation duration
  };

  const sortedFilteredEntries = React.useMemo(() => {
    let filtered = entries.filter(e => {
      const term = searchTerm.toLowerCase();
      return (
        e.barcode.toLowerCase().includes(term) ||
        e.title.toLowerCase().includes(term) ||
        e.handle.toLowerCase().includes(term) ||
        e.author.toLowerCase().includes(term) ||
        e.product_id.toString().includes(term)
      );
    });

    if (sortConfig !== null) {
      filtered = filtered.slice().sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (typeof aVal === "string" && typeof bVal === "string") {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [entries, searchTerm, sortConfig]);

  const requestSort = (key: keyof BlacklistEntry) => {
    if (!sortConfig || sortConfig.key !== key) {
      setSortConfig({ key, direction: "asc" });
    } else if (sortConfig.direction === "asc") {
      setSortConfig({ key, direction: "desc" });
    } else {
      setSortConfig(null);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Blacklist Manager</h2>
      <div className="flex gap-2 mb-2">
        <input
          value={barcodeInput}
          onChange={(e) => {
            setBarcodeInput(e.target.value);
            if (inputError) setInputError(null);
          }}
          placeholder="Enter barcode or product ID"
          className="border border-gray-300 dark:border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          onKeyDown={(e) => {
            if (e.key === "Enter" && barcodeInput.trim()) {
              e.preventDefault();
              handleAdd();
            }
          }}
          aria-describedby="input-error"
        />
        <button
          onClick={handleAdd}
          className={`bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors disabled:opacity-50`}
          disabled={loading}
        >
          {loading ? "Adding..." : "Add"}
        </button>
      </div>
      {inputError && (
        <div id="input-error" className="text-red-600 text-sm mb-2">
          {inputError}
        </div>
      )}
      <div className="mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter by barcode, title, handle, author, or product ID"
          className="w-full border border-gray-300 dark:border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800 cursor-pointer select-none">
              <th
                onClick={() => requestSort("barcode")}
                className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                  sortConfig?.key === "barcode" ? "text-green-600 dark:text-green-400" : ""
                }`}
              >
                Barcode {renderSortIcon("barcode")}
              </th>
              <th
                onClick={() => requestSort("title")}
                className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                  sortConfig?.key === "title" ? "text-green-600 dark:text-green-400" : ""
                }`}
              >
                Title {renderSortIcon("title")}
              </th>
              <th
                onClick={() => requestSort("author")}
                className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                  sortConfig?.key === "author" ? "text-green-600 dark:text-green-400" : ""
                }`}
              >
                Author {renderSortIcon("author")}
              </th>
              <th
                onClick={() => requestSort("handle")}
                className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                  sortConfig?.key === "handle" ? "text-green-600 dark:text-green-400" : ""
                }`}
              >
                Handle {renderSortIcon("handle")}
              </th>
              <th
                onClick={() => requestSort("product_id")}
                className={`cursor-pointer border px-4 py-2 dark:border-gray-700 text-left ${
                  sortConfig?.key === "product_id" ? "text-green-600 dark:text-green-400" : ""
                }`}
              >
                Product ID {renderSortIcon("product_id")}
              </th>
              <th className="border px-4 py-2 dark:border-gray-700"></th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredEntries.map((e, idx) => (
              <tr
                key={e.barcode}
                className={`${removing === e.barcode ? "fade-out" : ""} ${
                  idx % 2 === 0 ? "even:bg-gray-50 dark:even:bg-gray-900" : ""
                } transition-opacity duration-400`}
              >
                <td className="border px-4 py-2 dark:border-gray-700">{e.barcode}</td>
                <td className="border px-4 py-2 dark:border-gray-700">{e.title}</td>
                <td className="border px-4 py-2 dark:border-gray-700">{e.author}</td>
                <td className="border px-4 py-2 dark:border-gray-700">{e.handle}</td>
                <td className="border px-4 py-2 dark:border-gray-700">{e.product_id}</td>
                <td className="border px-4 py-2 dark:border-gray-700">
                  <button
                    onClick={() => handleRemove(e.barcode)}
                    className="text-red-600 hover:underline px-2 py-1 rounded"
                    disabled={!!removing}
                    aria-disabled={!!removing}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={async () => {
          if (loading) return;
          setLoading(true);
          try {
            const res = await fetch(`${BLACKLIST_API_BASE}/api/blacklist/export_snippet?token=${ADMIN_API_TOKEN}`, {
              method: "POST",
            });
            const json = await res.json();
            if (json.success) alert("✅ Liquid snippet exported successfully.");
            else alert("❌ Export failed.");
          } catch (err) {
            console.error("Export failed:", err);
            alert("❌ Network error during export.");
          }
          setLoading(false);
        }}
        className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 mt-4 disabled:opacity-50"
        disabled={loading}
      >
        {loading ? "Exporting..." : "Export to Shopify"}
      </button>

      {errorModal && (
        <ConfirmModal
          open={true}
          title={errorModal.title}
          description={errorModal.message}
          confirmLabel="OK"
          onConfirm={() => setErrorModal(null)}
          onCancel={() => setErrorModal(null)}
        />
      )}

      {previewEntries && (
        <ConfirmModal
          open={true}
          title={`Preview ${previewEntries.length} Product${previewEntries.length > 1 ? "s" : ""} to Add`}
          confirmLabel="Confirm All"
          cancelLabel="Cancel"
          onConfirm={() => previewEntries && confirmAdd(previewEntries)}
          onCancel={() => setPreviewEntries(null)}
        >
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {previewEntries.map((entry) => (
              <div key={entry.barcode} className="border rounded p-2 bg-gray-50 dark:bg-gray-800">
                <p><strong>Title:</strong> {entry.title}</p>
                <p><strong>Barcode:</strong> {entry.barcode}</p>
                <p><strong>Author (SKU):</strong> {entry.author}</p>
                <p><strong>Handle:</strong> {entry.handle}</p>
                <p><strong>Product ID:</strong> {entry.product_id}</p>
              </div>
            ))}
          </div>
        </ConfirmModal>
      )}

      {successModal && (
        <ConfirmModal
          open={true}
          title="Success"
          description={successModal}
          confirmLabel="OK"
          onConfirm={() => setSuccessModal(null)}
          onCancel={() => setSuccessModal(null)}
        />
      )}

      <style>{`
        .fade-out {
          opacity: 0 !important;
          transition: opacity 0.4s ease-out;
        }
      `}</style>
    </div>
  );
};

export default BlacklistManager;