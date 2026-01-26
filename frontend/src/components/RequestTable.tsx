import React, { useState, useRef, useEffect, useMemo } from 'react';
import { InterestEntry, StatusPhase, STATUS_ORDER } from '../types';
import RightSidebar from './RightSidebar';

interface RequestTableProps {
  filteredData: InterestEntry[];
  handleSort: (key: keyof InterestEntry) => void;
  renderSortIcon: (key: keyof InterestEntry) => string;
  sortConfig: { key: keyof InterestEntry; direction: 'asc' | 'desc' } | null;
  decodeHTMLEntities: (str: string) => string;
  onStatusChange: (id: string, newStatus: StatusPhase) => void;
  selectedIds: Set<string>;
  onRowSelect: (id: string, checked: boolean) => void;
  onHeaderToggle: (checked: boolean, visibleIds: string[]) => void;
  selectedStatuses: StatusPhase[];
}

const statuses = STATUS_ORDER;
const SHOPIFY_ADMIN_PREFIX = 'https://admin.shopify.com/store/castironbooks/products/';
const ONLINE_STORE_PREFIX = 'https://www.kitchenartsandletters.com/products/';

// --- Environment Variables ---
// Fallback logic to ensure we have a URL to hit
const API_BASE = import.meta.env.VITE_REQUEST_URL || 'http://localhost:5173';
const ADMIN_TOKEN = import.meta.env.VITE_DBS_ADMIN_TOKEN;

// --- GraphQL Fetcher ---
const fetchShopifyHandle = async (productId: number): Promise<string | null> => {
  if (!API_BASE) return null;

  const query = `{
    product(id: "gid://shopify/Product/${productId}") {
      handle
    }
  }`;

  try {
    const res = await fetch(`${API_BASE}/api/shopify/graphql`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Admin-Token": ADMIN_TOKEN || "", // Pass token if available
      },
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      // Return null on HTTP error so UI can stop loading
      return null;
    }

    const json = await res.json();
    return json?.data?.product?.handle || null;
  } catch (err) {
    console.error("Error fetching Shopify handle:", err);
    return null;
  }
};

// Helper to determine status color styling
const getStatusBadgeClass = (status: string) => {
  const base = "cursor-pointer inline-flex items-center px-2 py-1 rounded text-xs font-medium border-0 focus:outline-none focus:ring-2 focus:ring-offset-1";
  
  switch (status) {
    case 'New':
      return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200`;
    case 'In Progress':
      return `${base} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200`;
    case 'Request Filed':
      return `${base} bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200`;
    case 'Complete':
      return `${base} bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200`;
    default:
      return `${base} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`;
  }
};

const RequestTable: React.FC<RequestTableProps> = ({
  filteredData,
  handleSort,
  renderSortIcon,
  sortConfig,
  decodeHTMLEntities,
  onStatusChange,
  selectedIds,
  onRowSelect,
  onHeaderToggle,
  selectedStatuses
}) => {
  // Extended state to track the handle and its loading status
  const [selected, setSelected] = useState<(InterestEntry & { handle?: string; isLoadingHandle?: boolean }) | null>(null);
  
  const headerCbRef = useRef<HTMLInputElement>(null);
  const idsOnPage = useMemo(() => filteredData.map(r => r.id), [filteredData]);
  const allChecked = idsOnPage.length > 0 && idsOnPage.every(id => selectedIds.has(id));
  const someChecked = idsOnPage.some(id => selectedIds.has(id)) && !allChecked;

  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someChecked;
  }, [someChecked]);

  // --- Effect: Fetch Handle on Selection ---
  useEffect(() => {
    let isMounted = true;
    
    const loadHandle = async () => {
      // Only fetch if we have a selected item, it has a product_id, and we don't have a handle yet
      if (selected && selected.product_id && selected.handle === undefined) {
        
        // 1. Set loading state immediately
        if (isMounted) {
          setSelected(prev => prev ? { ...prev, isLoadingHandle: true } : null);
        }

        // 2. Perform fetch
        const handle = await fetchShopifyHandle(selected.product_id);
        
        // 3. Update state regardless of success/failure to clear loading flag
        if (isMounted && selected) {
          setSelected(prev => 
            prev ? { 
              ...prev, 
              handle: handle || '', // Use empty string if null to indicate "checked but failed"
              isLoadingHandle: false 
            } : null
          );
        }
      }
    };

    loadHandle();

    return () => { isMounted = false; };
  }, [selected?.id]); // Re-run when the selected row changes

  const visibleRows = filteredData.filter(entry => {
    const status = (entry.status ?? "New") as StatusPhase;
    return selectedStatuses.includes(status);
  });

  return (
    <div className="overflow-x-auto border rounded-md dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-3 py-3 border-b dark:border-gray-700 text-left w-10">
              <input
                ref={headerCbRef}
                type="checkbox"
                checked={allChecked}
                onChange={(e) => onHeaderToggle(e.currentTarget.checked, idsOnPage)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </th>
            <th onClick={() => handleSort('cr_id')} className="hidden sm:table-cell px-3 py-3 border-b dark:border-gray-700 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              ID {renderSortIcon('cr_id')}
            </th>
            <th onClick={() => handleSort('product_title')} className="px-3 py-3 border-b dark:border-gray-700 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              Title {renderSortIcon('product_title')}
            </th>
            <th onClick={() => handleSort('email')} className="hidden md:table-cell px-3 py-3 border-b dark:border-gray-700 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              Email {renderSortIcon('email')}
            </th>
            <th onClick={() => handleSort('customer_name')} className="hidden lg:table-cell px-3 py-3 border-b dark:border-gray-700 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              Name {renderSortIcon('customer_name')}
            </th>
            <th onClick={() => handleSort('created_at')} className="hidden sm:table-cell px-3 py-3 border-b dark:border-gray-700 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              Date {renderSortIcon('created_at')}
            </th>
            <th onClick={() => handleSort('status')} className="px-3 py-3 border-b dark:border-gray-700 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              Status {renderSortIcon('status')}
            </th>
            <th className="px-3 py-3 border-b dark:border-gray-700 text-right">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {visibleRows.map((entry, index) => (
            <tr key={entry.id || index} className="even:bg-gray-50 dark:even:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <td className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(entry.id)}
                  onChange={(e) => onRowSelect(entry.id, e.currentTarget.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </td>
              
              <td className="hidden sm:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                {entry.cr_id || '—'}
              </td>

              <td className="px-3 py-3 font-medium text-gray-900 dark:text-white max-w-[140px] sm:max-w-xs truncate" title={decodeHTMLEntities(entry.product_title)}>
                {decodeHTMLEntities(entry.product_title)}
              </td>

              <td className="hidden md:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 truncate max-w-[150px]" title={entry.email}>
                {entry.email}
              </td>

              <td className="hidden lg:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                {entry.customer_name?.trim() || '—'}
              </td>

              <td className="hidden sm:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {new Date(entry.created_at).toLocaleDateString()}
              </td>

              <td className="px-3 py-3">
                <select
                  value={entry.status || "New"}
                  onChange={(e) => onStatusChange(entry.id || "", e.target.value as StatusPhase)}
                  className={getStatusBadgeClass(entry.status || "New")}
                >
                  {statuses.map(status => (
                    <option key={status} value={status} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">
                      {status}
                    </option>
                  ))}
                </select>
              </td>

              <td className="px-3 py-3 text-right whitespace-nowrap">
                <button
                  onClick={() => setSelected(entry)}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 font-medium text-sm"
                >
                  Details
                </button>
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 && (
            <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">No requests found.</td></tr>
          )}
        </tbody>
      </table>

      {/* Right Sidebar Integration */}
      <RightSidebar
        row={selected}
        onClose={() => setSelected(null)}
        renderRowContent={() => selected && (
          <div className="space-y-6">
            
            {/* Header Info */}
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Product Title</label>
                <div className="text-base font-medium text-gray-900 dark:text-white">{decodeHTMLEntities(selected.product_title)}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Request ID</label>
                  <div className="font-mono text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1">
                    {selected.cr_id || selected.id}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">ISBN</label>
                  <div className="font-mono text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1">
                    {selected.isbn || '—'}
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* Customer Details */}
            <div className="space-y-4">
               <div>
                  <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Customer</label>
                  <div className="text-sm text-gray-900 dark:text-white">{selected.customer_name?.trim() || '—'}</div>
               </div>
               <div>
                  <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Email</label>
                  <div className="text-sm text-gray-900 dark:text-white">{selected.email}</div>
               </div>
               <div>
                  <label className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Date Submitted</label>
                  <div className="text-sm text-gray-900 dark:text-white">{new Date(selected.created_at).toLocaleString()}</div>
               </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* Links Section */}
            <div>
              <h4 className="text-sm font-bold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
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

                {/* Conditional Link Rendering */}
                <a
                  href={selected.handle ? `${ONLINE_STORE_PREFIX}${selected.handle}` : '#'}
                  target={selected.handle ? "_blank" : undefined}
                  rel="noreferrer"
                  className={`flex items-center justify-between p-3 rounded border border-gray-200 dark:border-gray-700 transition-colors group 
                    ${selected.handle ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer' : 'opacity-60 cursor-default'}`}
                  onClick={(e) => { if (!selected.handle) e.preventDefault(); }}
                >
                  <div>
                    <div className="font-medium text-blue-600 dark:text-blue-400 group-hover:underline">Website PDP</div>
                    <div className="text-xs text-gray-500">
                      {selected.isLoadingHandle 
                        ? 'Fetching link...' 
                        : selected.handle 
                          ? 'View public product page' 
                          : 'Link unavailable'}
                    </div>
                  </div>
                  {selected.isLoadingHandle ? (
                    <span className="text-xs animate-pulse">...</span>
                  ) : (
                    <span className="text-gray-400">↗</span>
                  )}
                </a>
              </div>
            </div>

          </div>
        )}
      />
    </div>
  );
};

export default RequestTable;