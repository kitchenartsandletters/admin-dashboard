import { useEffect, useState } from 'react'
import FilterControls, { FilterControlsProps } from './FilterControls';
import ExportButtons from "./ExportButtons";
import RequestTable from './RequestTable';
import { InterestEntry, StatusPhase, STATUS_ORDER, getStatusIndex } from '../types';
import ConfirmModal from './ConfirmModal';
import UndoToast from './UndoToast';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

function decodeHTMLEntities(str: string) {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

// ------------------------------------------------------------------
// Constants & Helpers
// ------------------------------------------------------------------

const SHOPIFY_ADMIN_PREFIX = 'https://admin.shopify.com/store/castironbooks/products/';
const ONLINE_STORE_PREFIX = 'https://www.kitchenartsandletters.com/products/';

// Fallback logic to ensure we have a URL to hit
const API_BASE = import.meta.env.VITE_BLACKLIST_URL || import.meta.env.VITE_REQUEST_URL;
const ADMIN_TOKEN = import.meta.env.VITE_DBS_ADMIN_TOKEN;

// GraphQL Fetcher for Handle
const fetchShopifyHandle = async (productId: number): Promise<string | null> => {
  if (!API_BASE) {
    console.warn("[RequestService] API_BASE is missing.");
    return null;
  }

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
        "X-Admin-Token": ADMIN_TOKEN || "", 
      },
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      console.error(`[RequestService] ❌ HTTP Error: ${res.status}`);
      return null;
    }

    const json = await res.json();
    const handle = json?.data?.product?.handle;
    return handle || null;
  } catch (err) {
    console.error("[RequestService] 💥 Exception:", err);
    return null;
  }
};

// ------------------------------------------------------------------
// Sub-Components
// ------------------------------------------------------------------

// Inline bulk actions toolbar - Hidden on Mobile
const BulkActionsBar: React.FC<{
  selectionCount: number;
  onBulkStatus: (status: StatusPhase) => void;
  onBulkArchive: () => void;
}> = ({ selectionCount, onBulkStatus, onBulkArchive }) => {
  const disabled = selectionCount === 0;
  // hidden sm:flex ensures this is gone on mobile
  return (
    <div className="hidden sm:flex print-hidden items-center gap-2 text-sm">
      <span className="text-xs text-gray-600 dark:text-gray-300">
        {selectionCount > 0 ? `${selectionCount} selected` : 'No rows selected'}
      </span>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600 dark:text-gray-300" htmlFor="bulk-status">Bulk:</label>
        <select
          id="bulk-status"
          className="text-xs border-blue-200 rounded px-2 py-1 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500"
          disabled={disabled}
          onChange={(e) => {
            const val = e.target.value as StatusPhase | '';
            if (val) {
              onBulkStatus(val);
              e.currentTarget.selectedIndex = 0;
            }
          }}
          defaultValue=""
        >
          <option value="" disabled>Change status…</option>
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled}
          className="text-xs px-3 py-1 rounded border border-red-200 bg-white text-red-700 hover:bg-red-50 dark:bg-gray-800 dark:text-red-300 dark:border-red-900 dark:hover:bg-red-900/20 transition-colors"
          onClick={onBulkArchive}
        >
          Archive selected
        </button>
      </div>
    </div>
  );
};

// Props definition for the mobile card
interface MobileRequestCardProps {
  entry: InterestEntry;
  onRequestStatusChange: (id: string, newStatus: StatusPhase) => void;
  onArchiveClick: (id: string) => void;
}

// Mobile Card Component - Mimics RightSidebar content
const MobileRequestCard: React.FC<MobileRequestCardProps> = ({ 
  entry, 
  onRequestStatusChange, 
  onArchiveClick 
}) => {
  const [expanded, setExpanded] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);
  const [isLoadingHandle, setIsLoadingHandle] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch handle only when expanded to save bandwidth
  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      // Only fetch if expanded, no handle yet, and not already loading
      if (expanded && handle === null && !isLoadingHandle) {
        setIsLoadingHandle(true);
        console.log(`[MobileCard] Fetching handle for ${entry.product_id}...`);
        
        const fetchedHandle = await fetchShopifyHandle(entry.product_id);
        
        if (isMounted) {
          console.log(`[MobileCard] Success. Handle: ${fetchedHandle}`);
          setHandle(fetchedHandle || '');
          setIsLoadingHandle(false);
        } else {
          console.log(`[MobileCard] Component unmounted, ignoring result.`);
        }
      }
    };

    fetchData();

    return () => { isMounted = false; };
  }, [expanded, entry.product_id]); 

  // --- Email Logic ---
  const subject = `Regarding: ${decodeHTMLEntities(entry.product_title)}`;
  const body = `Hi ${entry.customer_name || 'there'},\n\nWe have an update regarding your request for ${decodeHTMLEntities(entry.product_title)}.\n\n`;
  const mailtoLink = `mailto:${entry.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(entry.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm bg-white dark:bg-gray-800 overflow-hidden">
      {/* Card Header (Always Visible) */}
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-tight">
              {decodeHTMLEntities(entry.product_title)}
            </h3>
            
            {/* Email Action Row */}
            <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
              <a 
                href={mailtoLink}
                className="text-xs text-blue-600 dark:text-blue-400 underline truncate hover:text-blue-800 dark:hover:text-blue-300"
              >
                {entry.email}
              </a>
              <button 
                onClick={handleCopyEmail}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                title="Copy email to clipboard"
              >
                {copied ? (
                  <span className="text-[10px] text-green-600 font-bold">Copied</span>
                ) : (
                  <svg className="w-3 h-3 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          
          {/* Status Badge */}
          <span className={`
            shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide
            ${entry.status === 'Complete' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 
              entry.status === 'New' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}
          `}>
            {entry.status || 'New'}
          </span>
        </div>
        
        <div className="flex justify-between items-center mt-3 border-t border-gray-100 dark:border-gray-700/50 pt-2">
           <span className="text-[10px] text-gray-400 font-mono">
              {entry.cr_id || entry.id.slice(0,8)}
           </span>
           <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
             {expanded ? 'Hide Details' : 'Show Details'}
           </span>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
          <div className="space-y-4 pt-4">
            
            {/* Data Grid */}
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
              <div>
                <span className="block text-gray-500 font-semibold uppercase">Customer</span>
                <span className="text-gray-900 dark:text-white">{entry.customer_name || '—'}</span>
              </div>
              <div>
                <span className="block text-gray-500 font-semibold uppercase">Submitted</span>
                <span className="text-gray-900 dark:text-white">{new Date(entry.created_at).toLocaleDateString()}</span>
              </div>
              <div className="col-span-2">
                <span className="block text-gray-500 font-semibold uppercase">ISBN</span>
                <span className="text-gray-900 dark:text-white font-mono select-all">{entry.isbn || '—'}</span>
              </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* Actions Section */}
            <div className="space-y-3">
              {/* Status Changer */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Update Status</label>
                <select
                  value={entry.status || "New"}
                  onChange={(e) => onRequestStatusChange(entry.id, e.target.value as StatusPhase)}
                  className="w-full text-sm border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white p-2"
                >
                  {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Links */}
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={`${SHOPIFY_ADMIN_PREFIX}${entry.product_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center p-2 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-center hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Shopify Admin</span>
                </a>
                
                {/* Public Page Link - Strictly Handle Based */}
                <a
                  href={handle ? `${ONLINE_STORE_PREFIX}${handle}` : '#'}
                  target={handle ? "_blank" : undefined}
                  rel="noreferrer"
                  onClick={(e) => { if (!handle) e.preventDefault(); }}
                  className={`flex flex-col items-center justify-center p-2 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-center 
                    ${handle ? 'hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer' : 'opacity-60 cursor-default'}`}
                >
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {isLoadingHandle 
                      ? 'Fetching Link...' 
                      : handle 
                        ? 'Public Page' 
                        : 'Link Unavailable'}
                  </span>
                </a>
              </div>

              {/* Archive */}
              <button
                onClick={() => onArchiveClick(entry.id)}
                className="w-full py-2 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/30"
              >
                Archive Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

const RequestService = () => {
  const [data, setData] = useState<InterestEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: keyof InterestEntry; direction: 'asc' | 'desc' } | null>(() => {
    try {
      const saved = localStorage.getItem("sortConfig");
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  useEffect(() => {
    try {
      if (sortConfig) localStorage.setItem("sortConfig", JSON.stringify(sortConfig));
      else localStorage.removeItem("sortConfig");
    } catch {}
  }, [sortConfig]);
  const [selectedFilter, setSelectedFilter] = useState(() => {
    try {
      return localStorage.getItem("selectedFilter") || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("selectedFilter", selectedFilter);
    } catch {}
  }, [selectedFilter]);
  
  const ALL_STATUSES: StatusPhase[] = ["New", "Request Filed", "In Progress", "Complete"];
  const [selectedStatuses, setSelectedStatuses] = useState<StatusPhase[]>(() => {
    try {
      const saved = localStorage.getItem("selectedStatuses");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return ALL_STATUSES;
  });
  useEffect(() => {
    try {
      localStorage.setItem("selectedStatuses", JSON.stringify(selectedStatuses));
    } catch {}
  }, [selectedStatuses]);

  const handleStatusToggle = (status: StatusPhase) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
    setPage(1);
  };

  const clearStatusFilter = () => {
    setSelectedStatuses([]);
    setPage(1);
  };

  const selectAllStatusFilter = () => {
    setSelectedStatuses(ALL_STATUSES); 
    setPage(1);
  };
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleRowSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleHeaderToggle = (checked: boolean, visibleIds: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        visibleIds.forEach(id => next.add(id));
      } else {
        visibleIds.forEach(id => next.delete(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    id: string;
    newStatus: StatusPhase;
    prevStatus: StatusPhase;
  } | null>(null);

  const requestStatusChange = (requestId: string, newStatus: StatusPhase) => {
    const current = (data.find(d => d.id === requestId)?.status as StatusPhase) ?? "New";
    setPendingChange({ id: requestId, newStatus, prevStatus: current });
    setConfirmOpen(true);
  };

  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<StatusPhase | null>(null);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'op' | 'notop'>(() => {
    try {
      const saved = localStorage.getItem('collectionFilter');
      if (saved === 'all' || saved === 'op' || saved === 'notop') return saved;
    } catch {
      // no-op if localStorage is unavailable
    }
    return 'all';
  });

  const [page, setPage] = useState(() => {
    try {
      const saved = localStorage.getItem("page");
      return saved ? parseInt(saved, 10) : 1;
    } catch { return 1; }
  });
  const [limit, setLimit] = useState(() => {
    try {
      const saved = localStorage.getItem("limit");
      return saved ? parseInt(saved, 10) : 50;
    } catch { return 50; }
  });
  useEffect(() => {
    try {
      localStorage.setItem("page", String(page));
      localStorage.setItem("limit", String(limit));
    } catch {}
  }, [page, limit]);
  const [total, setTotal] = useState<number | null>(null);

  const showUndo = (message: string, onUndo: () => void) => {
    setUndoToast({ message, onUndo });
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFilter(e.target.value);
  };

  const handleSort = (key: keyof InterestEntry) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') {
          return { key, direction: 'desc' };
        } else if (prev.direction === 'desc') {
          return null;
        }
      }
      return { key, direction: 'asc' };
    });
    setPage(1);
  };

  const renderSortIcon = (key: keyof InterestEntry) => {
    if (!sortConfig || sortConfig.key !== key) return '⇅';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const handleStatusChange = async (
    requestId: string,
    newStatus: StatusPhase,
    opts?: { skipUndo?: boolean }
  ) => {
    const prevStatus = ((data.find(d => d.id === requestId)?.status) as StatusPhase) ?? "New";

    try {
      setData(prev => {
        const updated = prev.map(item =>
          item.id === requestId ? { ...item, status: newStatus } : item
        );
        if (sortConfig) {
          return [...updated].sort((a, b) => {
            const { key, direction } = sortConfig;
            if (key === 'status') {
              const aIndex = getStatusIndex(a.status);
              const bIndex = getStatusIndex(b.status);
              return (aIndex - bIndex) * (direction === 'asc' ? 1 : -1);
            }
            return 0;
          });
        }
        return updated;
      });

      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/update_status?token=${import.meta.env.VITE_ADMIN_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          new_status: newStatus,
          changed_by: "admin"
        })
      });

      if (!res.ok) throw new Error("Failed to update status");

      if (!opts?.skipUndo) {
        showUndo(`Status changed to "${newStatus}". Undo?`, () => {
          handleStatusChange(requestId, prevStatus, { skipUndo: true });
        });
      }

    } catch (err) {
      console.error("Error updating status:", err);
      setData(prev => prev.map(item =>
        item.id === requestId ? { ...item, status: prevStatus } : item
      ));
    }
  };

  
useEffect(() => {
  const fetchData = async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/interest?token=${import.meta.env.VITE_ADMIN_TOKEN}&collection_filter=${collectionFilter}&page=${page}&limit=${limit}&search=${encodeURIComponent(selectedFilter)}&statuses=${encodeURIComponent(selectedStatuses.join(","))}&sort_field=${sortConfig?.key || ''}&sort_order=${sortConfig?.direction || ''}&_ts=${Date.now()}`
      );
      let json: any;
      try {
        json = await res.clone().json();
      } catch (e) {
        const errorText = await res.text();
        console.error("Failed to parse JSON:", errorText);
        throw new Error("Malformed JSON");
      }
      if (!res.ok || !json?.data || !Array.isArray(json.data)) {
        throw new Error("Invalid data response");
      }
      setData(json.data);
      const totalHeaderRaw = res.headers.get('x-total-count') || res.headers.get('X-Total-Count');
      const totalFromHeader = totalHeaderRaw ? parseInt(totalHeaderRaw, 10) : null;
      const totalFromMeta = (typeof json.meta?.total === 'number') ? json.meta.total : null;
      setTotal(Number.isFinite(totalFromHeader as number) ? (totalFromHeader as number) : totalFromMeta);
      setLoading(false);
    } catch (err: any) {
      setData([]);
      setError(err.message);
      setLoading(false);
    }
  };

  fetchData();
}, [collectionFilter, page, limit, selectedFilter, sortConfig]);

  useEffect(() => {
    try {
      localStorage.setItem('collectionFilter', collectionFilter);
    } catch {
    }
  }, [collectionFilter]);

  useEffect(() => {
    setPage(1);
    clearSelection();
  }, [collectionFilter]);

  useEffect(() => {
    setPage(1);
    clearSelection();
  }, [selectedFilter]);

  const onChangeLimit = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = parseInt(e.target.value, 10);
    setLimit(next);
    setPage(1);
  };

  const onPrevPage = () => setPage(p => Math.max(1, p - 1));
  const onNextPage = () => setPage(p => p + 1);

  const startIndex = data.length > 0 ? (page - 1) * limit + 1 : 0;
  const endIndex = (page - 1) * limit + data.length;
  const isLastPage = total != null ? endIndex >= total : data.length < limit;

  const totalPages = total != null ? Math.ceil(total / limit) : null;
  const pageSummary = totalPages ? `Page ${page} / ${totalPages}` : `Page ${page}`;
  const rangeSummary = total != null
    ? `${startIndex}–${endIndex} of ${total} entries`
    : `${startIndex}–${endIndex} entries`;

  // === UPDATED: Client-Side filtering for Search + Status ===
  const sortedData = data.filter(entry => {
    // 1. Filter by Status (Client-side mirror of checkbox state)
    const effectiveStatus = (entry.status as StatusPhase) || 'New';
    if (!selectedStatuses.includes(effectiveStatus)) return false;

    // 2. Filter by Search (Client-side text match)
    if (!selectedFilter) return true;
    
    const lowerFilter = selectedFilter.toLowerCase();
    
    // Check all relevant fields for the search string
    // Added explicit checks for cr_id, id, and isbn
    return (
      (entry.product_title && entry.product_title.toLowerCase().includes(lowerFilter)) ||
      (entry.email && entry.email.toLowerCase().includes(lowerFilter)) ||
      (entry.customer_name && entry.customer_name.toLowerCase().includes(lowerFilter)) ||
      (entry.id && entry.id.toLowerCase().includes(lowerFilter)) || // Internal ID
      (entry.cr_id && String(entry.cr_id).toLowerCase().includes(lowerFilter)) || // Custom Request ID (Safely stringified)
      // ISBN: Remove dashes for flexible search (e.g. "978-1" finds "9781")
      (entry.isbn && String(entry.isbn).toLowerCase().replace(/-/g, '').includes(lowerFilter.replace(/-/g, ''))) 
    );
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Request Service</h1>
      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-red-600 text-sm">Error: {error}</p>}
      
      {/* Bulk actions bar - HIDDEN on Mobile */}
      <div className="flex justify-end mb-2">
        <BulkActionsBar
          selectionCount={selectedIds.size}
          onBulkStatus={(s) => {
            if (selectedIds.size === 0) return;
            setBulkTargetStatus(s);
            setBulkConfirmOpen(true);
          }}
          onBulkArchive={() => {
            if (selectedIds.size === 0) return;
            setArchiveConfirmOpen(true);
          }}
        />
      </div>

      {/* Main Controls Bar - STICKY ON MOBILE */}
      <div className="sticky top-0 z-30 flex flex-col lg:flex-row items-center gap-3 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm print-hidden">
        
        {/* Left: Filters */}
        <div className="flex flex-col md:flex-row gap-3 flex-1 w-full lg:w-auto">
          <FilterControls
            selectedFilter={selectedFilter}
            handleFilterChange={handleFilterChange}
            selectedStatuses={selectedStatuses}
            onStatusToggle={handleStatusToggle}
            clearStatusFilter={clearStatusFilter}
            selectAllStatusFilter={selectAllStatusFilter}
          />
          
          <select
            value={collectionFilter}
            onChange={(e) => setCollectionFilter(e.target.value as 'all' | 'op' | 'notop')}
            className="border rounded px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-auto min-w-[140px]"
          >
            <option value="all">All Collections</option>
            <option value="op">Out-of-Print</option>
            <option value="notop">Active Catalog</option>
          </select>
        </div>

        {/* Right: Pagination & Exports */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 pt-3 lg:pt-0 border-gray-200 dark:border-gray-700">
           
           {/* Pagination */}
           <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">Rows:</span>
              <select
                value={limit}
                onChange={onChangeLimit}
                className="border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              
              <div className="flex items-center gap-1 ml-2">
                <button onClick={onPrevPage} disabled={page === 1} className="px-2 py-1 border rounded text-xs bg-white dark:bg-gray-800 dark:text-white disabled:opacity-50 hover:bg-gray-50">Prev</button>
                <span className="text-xs text-gray-600 dark:text-gray-300 min-w-[3rem] text-center">{pageSummary}</span>
                <button onClick={onNextPage} disabled={isLastPage} className="px-2 py-1 border rounded text-xs bg-white dark:bg-gray-800 dark:text-white disabled:opacity-50 hover:bg-gray-50">Next</button>
              </div>
           </div>
           
           <div className="hidden sm:block h-5 w-px bg-gray-300 dark:bg-gray-600"></div>
           
           {/* Export Buttons - HIDDEN on Mobile */}
           <div className="hidden sm:block flex-shrink-0">
             <ExportButtons filteredData={sortedData} decodeHTMLEntities={decodeHTMLEntities} />
           </div>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block">
        <RequestTable
          filteredData={sortedData}
          handleSort={handleSort}
          renderSortIcon={renderSortIcon}
          sortConfig={sortConfig}
          decodeHTMLEntities={decodeHTMLEntities}
          onStatusChange={requestStatusChange}
          selectedIds={selectedIds}
          onRowSelect={handleRowSelect}
          onHeaderToggle={handleHeaderToggle}
          selectedStatuses={selectedStatuses}
        />
      </div>

      {/* Footer Summary */}
      <div className="hidden sm:flex justify-end items-center gap-3 mt-2 print-hidden">
        <span className="text-xs text-gray-500 dark:text-gray-400">{pageSummary}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{rangeSummary}</span>
      </div>

      {/* Mobile Cards - Defined externally to prevent state loss */}
      <div className="block sm:hidden space-y-4">
        {sortedData.map((entry, index) => (
          <MobileRequestCard 
            key={entry.id || index}
            entry={entry} 
            onRequestStatusChange={requestStatusChange}
            onArchiveClick={(id) => {
              setSelectedIds(new Set([id]));
              setArchiveConfirmOpen(true);
            }}
          />
        ))}
      </div>

      {/* Mobile Footer Summary */}
      <div className="flex sm:hidden justify-between items-center mt-4 px-1 print-hidden text-xs text-gray-500">
        <span>{pageSummary}</span>
        <span>{rangeSummary}</span>
      </div>

      {/* Modals */}
      {pendingChange && (
        <ConfirmModal
          open={confirmOpen}
          onCancel={() => { setConfirmOpen(false); setPendingChange(null); }}
          onConfirm={async () => {
            if (!pendingChange) return;
            setConfirmBusy(true);
            try { await handleStatusChange(pendingChange.id, pendingChange.newStatus); } 
            finally { setConfirmBusy(false); setConfirmOpen(false); setPendingChange(null); }
          }}
          busy={confirmBusy}
          title="Change status?"
          description={`Change from "${pendingChange.prevStatus}" to "${pendingChange.newStatus}"?`}
          confirmLabel="Change"
          cancelLabel="Cancel"
          variant="primary"
        />
      )}

      {bulkTargetStatus && (
        <ConfirmModal
          open={bulkConfirmOpen}
          onCancel={() => { setBulkConfirmOpen(false); setBulkTargetStatus(null); }}
          onConfirm={async () => {
            const ids = Array.from(selectedIds);
            if (ids.length === 0 || !bulkTargetStatus) return;
            setBulkBusy(true);
            try {
              const prevMap: Record<string, StatusPhase> = {};
              ids.forEach(id => { prevMap[id] = (data.find(d => d.id === id)?.status as StatusPhase) ?? 'New'; });
              await Promise.all(ids.map(id => handleStatusChange(id, bulkTargetStatus, { skipUndo: true })));
              showUndo(`Changed ${ids.length} items to "${bulkTargetStatus}". Undo?`, () => {
                Promise.all(ids.map(id => handleStatusChange(id, prevMap[id], { skipUndo: true })));
              });
              clearSelection();
            } finally { setBulkBusy(false); setBulkConfirmOpen(false); setBulkTargetStatus(null); }
          }}
          busy={bulkBusy}
          title={`Update ${selectedIds.size} items?`}
          description={`Set status to "${bulkTargetStatus}" for ${selectedIds.size} selected items?`}
          confirmLabel="Change All"
          cancelLabel="Cancel"
          variant="primary"
        />
      )}

      <ConfirmModal
        open={archiveConfirmOpen}
        onCancel={() => setArchiveConfirmOpen(false)}
        onConfirm={async () => {
          const ids = Array.from(selectedIds);
          if (ids.length === 0) { setArchiveConfirmOpen(false); return; }
          setArchiveBusy(true);
          try {
            const res = await fetch(
              `${import.meta.env.VITE_API_BASE_URL}/api/archive/bulk?token=${import.meta.env.VITE_ADMIN_TOKEN}`,
              { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }
            );
            if (!res.ok) throw new Error('Failed to archive selected');
            setData(prev => prev.filter(item => !ids.includes(item.id)));
            clearSelection();
          } catch (e) { console.error(e); } 
          finally { setArchiveBusy(false); setArchiveConfirmOpen(false); }
        }}
        busy={archiveBusy}
        title={`Archive ${selectedIds.size} items?`}
        description="These items will be moved to the archive."
        confirmLabel="Archive"
        cancelLabel="Cancel"
        variant="danger"
      />

      {undoToast && (
        <UndoToast
          message={undoToast.message}
          duration={10000}
          onUndo={() => { undoToast.onUndo(); setUndoToast(null); }}
          onClose={() => setUndoToast(null)}
        />
      )}
    </div>
  )
}

export default RequestService