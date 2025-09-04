import React, { useState, useEffect } from "react";

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
    const res = await fetch("/api/shopify/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    });
    const json = await res.json();
    if (isProductId) {
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
      const edge = json.data.productVariants.edges[0];
      if (!edge) return null;
      const variant = edge.node;
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

  const fetchBlacklist = async () => {
    const res = await fetch(`${BLACKLIST_API_BASE}/api/blacklist?token=${ADMIN_API_TOKEN}`);
    const json = await res.json();
    const data = Array.isArray(json.data) ? json.data : [];
    setEntries(data);
  };

  const handleAdd = async () => {
    const normalizedInputs = barcodeInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (normalizedInputs.length === 0) return;

    const enrichedEntries: BlacklistEntry[] = [];

    for (const input of normalizedInputs) {
      const enriched = await fetchShopifyProductDetails(input);
      if (!enriched) {
        alert("No product found for: " + input);
      } else {
        enrichedEntries.push(enriched);
      }
    }

    if (enrichedEntries.length > 0) {
      await fetch(`${BLACKLIST_API_BASE}/api/blacklist/add?token=${ADMIN_API_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enrichedEntries)
      });
    }

    setBarcodeInput("");
    fetchBlacklist();
  };

  const handleRemove = async (barcode: string) => {
    await fetch(`${BLACKLIST_API_BASE}/api/blacklist/remove?token=${ADMIN_API_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode })
    });
    fetchBlacklist();
  };

  useEffect(() => {
    fetchBlacklist();
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Blacklist Manager</h2>
      <div className="flex gap-2 mb-4">
        <input
          value={barcodeInput}
          onChange={(e) => setBarcodeInput(e.target.value)}
          placeholder="Enter barcode or product ID"
          className="border border-gray-300 dark:border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        />
        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          Add
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border px-4 py-2 dark:border-gray-700 text-left">Barcode</th>
              <th className="border px-4 py-2 dark:border-gray-700 text-left">Title</th>
              <th className="border px-4 py-2 dark:border-gray-700 text-left">Author</th>
              <th className="border px-4 py-2 dark:border-gray-700 text-left">Handle</th>
              <th className="border px-4 py-2 dark:border-gray-700 text-left">Product ID</th>
              <th className="border px-4 py-2 dark:border-gray-700"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, idx) => (
              <tr
                key={e.barcode}
                className={
                  idx % 2 === 0
                    ? "even:bg-gray-50 dark:even:bg-gray-900"
                    : ""
                }
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
        }}
        className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 mt-4"
      >
        Export Liquid Snippet
      </button>
    </div>
  );
};

export default BlacklistManager;