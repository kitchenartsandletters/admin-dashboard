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
  
  // CHANGED: Default sort set to Title (Ascending)
  const [sortConfig, setSortConfig] = useState<{ key: keyof DamagedRow; direction: 'asc' | 'desc' } | null>({ 
    key: 'title', 
    direction: 'asc' 
  });

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
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Damaged Inventory</h2>
          <span className="text-sm opacity-70">{rows.length} rows</span>
        </div>
        
        {/* Mobile-friendly Status Block */}
        {status && (
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded sm:bg-transparent sm:p-0">
            <span className="block sm:inline">Last reconcile: {new Date(status.at).toLocaleString()}</span>
            <span className="hidden sm:inline"> — </span>
            <span className="block sm:inline mt-1 sm:mt-0">
              Inspected: {status.inspected}, Updated: {status.updated}, Skipped: {status.skipped}
            </span>
          </div>
        )}
        
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm w-full sm:w-auto"
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

      <div className="flex gap-3 flex-col sm:flex-row">
        <input
          type="text"
          placeholder="Search title..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white w-full sm:w-64"
        />
        <select
          className="border px-2 py-2 rounded text-sm dark:bg-gray-800 dark:text-white w-full sm:w-auto"
          value={stockFilter}
          onChange={e => setStockFilter(e.target.value as any)}
        >
          <option value="all">All Stock Status</option>
          <option value="in_stock">In Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
      </div>

      {/* Table Area */}
      <div className="overflow-x-auto border rounded-md">
        <table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-3 py-3 text-left border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort('title')}>Title</th>
              <th className="px-3 py-3 text-left border-b border-gray-200 dark:border-gray-700">Condition</th>
              <th className="px-3 py-3 text-left border-b border-gray-200 dark:border-gray-700 w-24">Avail</th>
              <th className="px-3 py-3 text-left border-b border-gray-200 dark:border-gray-700 hidden sm:table-cell">Author</th>
              <th className="px-3 py-3 text-left border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort('stock_status')}>Status</th>
              <th className="px-3 py-3 text-right border-b border-gray-200 dark:border-gray-700">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedRows.map(r => (
              <tr key={r.inventory_item_id} className="even:bg-gray-50 dark:even:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                
                {/* Title Column */}
                <td className="px-3 py-3 max-w-[150px] sm:max-w-xs truncate" title={r.title ?? r.handle}>
                  <div className="font-medium text-gray-900 dark:text-white">{r.title ?? r.handle}</div>
                </td>

                {/* Condition */}
                <td className="px-3 py-3 capitalize text-gray-600 dark:text-gray-300">
                  {r.condition_raw ?? r.condition_key ?? '—'}
                </td>

                {/* Available Qty */}
                <td className="px-3 py-3 text-center sm:text-left">
                  {r.available}
                </td>

                {/* Author (Hidden on tiny screens) */}
                <td className="px-3 py-3 hidden sm:table-cell text-gray-500">
                  <div className="truncate w-32" title={r.sku ?? ''}>
                    {r.sku ?? '—'}
                  </div>
                </td>

                {/* Stock Status */}
                <td className="px-3 py-3">
                  <span className={`inline-flex px-2 text-xs font-semibold leading-5 rounded-full ${
                    r.stock_status === 'in_stock' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {r.stock_status === 'in_stock' ? 'In Stock' : 'Out'}
                  </span>
                </td>

                {/* Details Button */}
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <button 
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 font-medium text-sm" 
                    onClick={() => setSelected(r)}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr><td className="px-3 py-6 text-center opacity-70" colSpan={6}>No damaged inventory found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <RightSidebar
        row={selected}
        onClose={() => setSelected(null)}
        renderRowContent={() => selected && (
          <div className="space-y-6">
            
            {/* Main Info */}
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Title</label>
                <div className="text-base font-medium">{selected.title ?? 'Unknown Title'}</div>
              </div>
              
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Handle</label>
                <div className="font-mono text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1 break-all">
                  {selected.handle ?? '—'}
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Author</label>
                <div>{selected.sku ?? '—'}</div>
              </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* Inventory Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Condition</label>
                <div className="capitalize">{selected.condition_raw ?? selected.condition_key ?? '—'}</div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Quantity</label>
                <div>{selected.available}</div>
              </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* Links Section */}
            <div>
              <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                See it Live
              </h4>
              <div className="space-y-2">
                <a
                  href={`${SHOPIFY_ADMIN_PREFIX}${selected.product_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div>
                    <div className="font-medium text-blue-600 dark:text-blue-400 group-hover:underline">Shopify Admin</div>
                    <div className="text-xs text-gray-500">Edit product settings</div>
                  </div>
                  <span className="text-gray-400">↗</span>
                </a>

                <a
                  href={`${ONLINE_STORE_PREFIX}${selected.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div>
                    <div className="font-medium text-blue-600 dark:text-blue-400 group-hover:underline">Website PDP</div>
                    <div className="text-xs text-gray-500">View public product page</div>
                  </div>
                  <span className="text-gray-400">↗</span>
                </a>
              </div>
            </div>

          </div>
        )}
      />
    </div>
  );
}