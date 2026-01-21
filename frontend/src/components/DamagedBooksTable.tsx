// src/components/DamagedBooksTable.tsx
import React, { useEffect, useState } from 'react';
import { DamagedBooksService, DamagedRow } from '../components/DamagedBooksService';
import RightSidebar from '../components/RightSidebar';

const SHOPIFY_ADMIN_PREFIX = 'https://admin.shopify.com/store/castironbooks/products/';
const ONLINE_STORE_PREFIX = 'https://www.kitchenartsandletters.com/products/';

export default function DamagedBooksTable() {
  const [rows, setRows] = useState<DamagedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DamagedRow | null>(null);
  const [status, setStatus] = useState<{ at: string; inspected: number; updated: number; skipped: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: keyof DamagedRow; direction: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    (async () => {
      const [inventory, reconcileStatus] = await Promise.all([
        DamagedBooksService.listDamagedInventory(),
        DamagedBooksService.status()
      ]);
      setRows(inventory.data);
      setStatus(reconcileStatus);
      setLoading(false);
    })();
  }, []);

  const handleSort = (key: keyof DamagedRow) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig?.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredRows = rows
    .filter(r => {
      const query = searchTerm.toLowerCase();
      return (
        r.title?.toLowerCase().includes(query) ||
        r.barcode?.toLowerCase().includes(query)
      );
    })
    .filter(r => {
      if (stockFilter === 'all') return true;
      return r.stock_status === stockFilter;
    });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortConfig) return 0;
    const aVal = a[sortConfig.key] ?? '';
    const bVal = b[sortConfig.key] ?? '';
    const order = sortConfig.direction === 'asc' ? 1 : -1;

    if (sortConfig.key === 'stock_status') {
      const score = (s: string) => s === 'in_stock' ? 1 : 0;
      return (score(String(aVal)) - score(String(bVal))) * order;
    }

    return String(aVal).localeCompare(String(bVal)) * order;
  });

  if (loading) return <div className="text-sm text-gray-700 dark:text-gray-300">Loading damaged inventory…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Damaged Inventory</h2>
          <span className="text-sm opacity-70">{rows.length} rows</span>
        </div>
        {status && (
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Last reconcile: {new Date(status.at).toLocaleString()} — Inspected: {status.inspected}, Updated: {status.updated}, Skipped: {status.skipped}
          </div>
        )}
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
          onClick={async () => {
            await DamagedBooksService.reconcileNow();
            const [invRes, statusRes] = await Promise.all([
              DamagedBooksService.listDamagedInventory(),
              DamagedBooksService.status()
            ]);
            setRows(invRes.data);
            setStatus(statusRes);
          }}
        >
          Reconcile Now
        </button>
      </div>

      <div className="flex gap-3 flex-wrap items-left">
        <input
          type="text"
          placeholder="Search title or handle..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white"
        />
        <select
          className="border px-2 py-2 rounded text-sm dark:bg-gray-800 dark:text-white"
          value={stockFilter}
          onChange={e => setStockFilter(e.target.value as any)}
        >
          <option value="all">All</option>
          <option value="in_stock">In Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
      </div>

      <div className="overflow-auto border rounded-md">
        <table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm ">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700 cursor-pointer" onClick={() => handleSort('title')}>Title</th>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700">Condition</th>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700">Available</th>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700 w-48 max-w-48">
                Author
              </th>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700 w-64 max-w-64">Handle</th>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700 cursor-pointer" onClick={() => handleSort('stock_status')}>Status</th>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700">Shopify</th>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700">Online</th>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(r => (
              <tr key={r.inventory_item_id} className="even:bg-gray-50 dark:even:bg-gray-700">
                <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{r.title ?? r.handle}</td>
                <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 capitalize">
                  {r.condition_raw ?? r.condition_key ?? '—'}
                </td>
                <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-center">{r.available}</td>
                <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 w-48 max-w-48">
                  <div className="truncate" title={r.sku ?? ''}>
                    {r.sku ?? '—'}
                  </div>
                </td>
                <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 w-64 max-w-64">
                  <div className="truncate" title={r.barcode ?? ''}>
                    {r.barcode ?? '—'}
                  </div>
                </td>
                <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{r.stock_status === 'in_stock' ? 'In Stock' : 'Out of Stock'}</td>
                <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">
                  <a
                    href={`${SHOPIFY_ADMIN_PREFIX}${r.product_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Admin
                  </a>
                </td>
                <td className="px-3 py-2">
                  <a
                    href={`${ONLINE_STORE_PREFIX}${r.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Live
                  </a>
                </td>
                <td className="px-3 py-2 text-right">
                  <button className="underline" onClick={() => setSelected(r)}>Details</button>
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr><td className="px-3 py-6 text-center opacity-70" colSpan={9}>No rows</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <RightSidebar
        row={selected}
        onClose={() => setSelected(null)}
        renderRowContent={() => selected && (
          <>
            <div><strong>Title:</strong> {selected.title}</div>
            <div><strong>Barcode:</strong> {selected.barcode}</div>
            <div><strong>SKU:</strong> {selected.sku}</div>
            {/* Add more fields as needed */}
          </>
        )}
      />
    </div>
  );
}