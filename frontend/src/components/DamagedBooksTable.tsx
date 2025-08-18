// src/components/DamagedBooksTable.tsx
import React, { useEffect, useState } from 'react';
import { DamagedBooksService, DamagedRow } from '../components/DamagedBooksService';
import RightSidebar from '../components/RightSidebar';

const SHOPIFY_ADMIN_PREFIX = 'https://admin.shopify.com/store/castironbooks/products/';

export default function DamagedBooksTable() {
  const [rows, setRows] = useState<DamagedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DamagedRow | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await DamagedBooksService.listDamagedInventory();
        setRows(res.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-sm text-gray-700 dark:text-gray-300">Loading damaged inventory…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Damaged Inventory</h2>
        <span className="text-sm opacity-70">{rows.length} rows</span>
      </div>

      <div className="overflow-auto border rounded-md">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-3 py-2 text-left">Title</th>
              <th className="px-3 py-2">Condition</th>
              <th className="px-3 py-2">Available</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Barcode</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Admin</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.inventory_item_id} className="border-t dark:border-gray-700">
                <td className="px-3 py-2">{r.title ?? r.handle}</td>
                <td className="px-3 py-2 capitalize">{r.condition}</td>
                <td className="px-3 py-2 text-center">{r.available}</td>
                <td className="px-3 py-2">{r.sku ?? '—'}</td>
                <td className="px-3 py-2">{r.barcode ?? '—'}</td>
                <td className="px-3 py-2">{r.stock_status === 'in_stock' ? 'In Stock' : 'Out of Stock'}</td>
                <td className="px-3 py-2">
                  <a
                    href={`${SHOPIFY_ADMIN_PREFIX}${r.product_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Open in Shopify
                  </a>
                </td>
                <td className="px-3 py-2 text-right">
                  <button className="underline" onClick={() => setSelected(r)}>Details</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-6 text-center opacity-70" colSpan={8}>No rows</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <RightSidebar row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}