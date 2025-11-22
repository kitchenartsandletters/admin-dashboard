import { useEffect, useState } from 'react'
import FilterControls, { FilterControlsProps } from './FilterControls';
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import DashboardHeader from './DashboardHeader';
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

// Inline bulk actions toolbar (scaffold). Replace with a dedicated file later if desired.
const BulkActionsBar: React.FC<{
  selectionCount: number;
  onBulkStatus: (status: StatusPhase) => void;
  onBulkArchive: () => void;
}> = ({ selectionCount, onBulkStatus, onBulkArchive }) => {
  const disabled = selectionCount === 0;
  return (
    <div className="print-hidden flex items-center gap-2 text-sm">
      <span className="text-xs text-gray-600 dark:text-gray-300">
        {selectionCount > 0 ? `${selectionCount} selected` : 'No rows selected'}
      </span>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600 dark:text-gray-300" htmlFor="bulk-status">Bulk:</label>
        <select
          id="bulk-status"
          className="border rounded px-2 py-1 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
          disabled={disabled}
          onChange={(e) => {
            const val = e.target.value as StatusPhase | '';
            if (val) {
              onBulkStatus(val);
              // reset back to placeholder after firing
              e.currentTarget.selectedIndex = 0;
            }
          }}
          value=""
        >
          <option value="" disabled>Change status…</option>
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled}
          className="px-3 py-1 rounded border bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 disabled:opacity-50"
          onClick={onBulkArchive}
        >
          Archive selected
        </button>
      </div>
    </div>
  );
};

const RequestService = () => {
  const [data, setData] = useState<InterestEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: keyof InterestEntry; direction: 'asc' | 'desc' } | null>(null)
  const [selectedFilter, setSelectedFilter] = useState('');
  // Selection model for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Toggle a single row
  const handleRowSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  // Header checkbox toggles all visible row IDs (current page)
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

  // Helper to clear selection (e.g., after bulk action)
  const clearSelection = () => setSelectedIds(new Set());
    // Undo toast state
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null);
  // Confirm modal state for status changes
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    id: string;
    newStatus: StatusPhase;
    prevStatus: StatusPhase;
  } | null>(null);
  // Called when a row requests a status change; opens confirm dialog
  const requestStatusChange = (requestId: string, newStatus: StatusPhase) => {
    const current = (data.find(d => d.id === requestId)?.status as StatusPhase) ?? "New";
    setPendingChange({ id: requestId, newStatus, prevStatus: current });
    setConfirmOpen(true);
  };
  // Bulk status change modal state
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<StatusPhase | null>(null);
  // Bulk archive modal state
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

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50); // options: 20, 50, 100
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
      // Capture previous status BEFORE optimistic update for undo/revert
      const prevStatus = ((data.find(d => d.id === requestId)?.status) as StatusPhase) ?? "New";

      try {
        // Optimistic UI update
        setData(prev => {
          const updated = prev.map(item =>
            item.id === requestId ? { ...item, status: newStatus } : item
          );

          // If we're currently sorting, re-sort immediately after update
          if (sortConfig) {
            return [...updated].sort((a, b) => {
              const { key, direction } = sortConfig;
              if (key === 'status') {
                const aIndex = getStatusIndex(a.status);
                const bIndex = getStatusIndex(b.status);
                return (aIndex - bIndex) * (direction === 'asc' ? 1 : -1);
              }
              return 0; // Other sorts fall back to default sorter in sortedData
            });
          }

          return updated;
        });

        // Backend update
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/update_status?token=${import.meta.env.VITE_ADMIN_TOKEN}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId,
            new_status: newStatus,
            changed_by: "admin" // Replace with real admin identity if available
          })
        });

        if (!res.ok) throw new Error("Failed to update status");

        const json = await res.json();
        console.log("Status updated:", json);

        // Show Undo toast only for direct user actions (not when we are reverting via undo)
        if (!opts?.skipUndo) {
          showUndo(`Status changed to "${newStatus}". Undo?`, () => {
            // Call again but skip showing another Undo toast to prevent loops
            handleStatusChange(requestId, prevStatus, { skipUndo: true });
          });
        }

      } catch (err) {
        console.error("Error updating status (reverting optimistic change):", err);
        // Revert optimistic change on failure
        setData(prev => prev.map(item =>
          item.id === requestId ? { ...item, status: prevStatus } : item
        ));
      }
    };

  
useEffect(() => {
  const fetchData = async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/interest?token=${import.meta.env.VITE_ADMIN_TOKEN}&collection_filter=${collectionFilter}&page=${page}&limit=${limit}&search=${encodeURIComponent(selectedFilter)}&sort_field=${sortConfig?.key || ''}&sort_order=${sortConfig?.direction || ''}&_ts=${Date.now()}`
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
      // Prefer X-Total-Count header from API if present; otherwise fall back to json.meta.total
      const totalHeaderRaw = res.headers.get('x-total-count') || res.headers.get('X-Total-Count');
      const totalFromHeader = totalHeaderRaw ? parseInt(totalHeaderRaw, 10) : null;
      const totalFromMeta = (typeof json.meta?.total === 'number') ? json.meta.total : null;
      setTotal(Number.isFinite(totalFromHeader as number) ? (totalFromHeader as number) : totalFromMeta);
      setLoading(false);
    } catch (err: any) {
      // fallback to mock data
      setData([
        {
          id: 'mock-uuid-1',
          email: 'test@example.com',
          product_id: 12345,
          product_title: 'The Book of Ferments',
          created_at: new Date().toISOString(),
        },
        {
          id: 'mock-uuid-2',
          email: 'reader@example.com',
          product_id: 98765,
          product_title: 'Cooking in the Shadows',
          created_at: new Date().toISOString(),
        },
      ]);
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
      // ignore write errors (e.g., privacy mode)
    }
  }, [collectionFilter]);

  // When switching views, always reset to page 1 to avoid empty pages
  useEffect(() => {
    setPage(1);
    clearSelection();
  }, [collectionFilter]);

  // When search changes, always reset to page 1 to avoid empty pages
  useEffect(() => {
    setPage(1);
    clearSelection();
  }, [selectedFilter]);

  const onChangeLimit = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = parseInt(e.target.value, 10);
    setLimit(next);
    setPage(1); // reset to first page when page size changes
  };

  const onPrevPage = () => setPage(p => Math.max(1, p - 1));
  const onNextPage = () => setPage(p => p + 1);

  // Range display and pagination end detection
  const startIndex = data.length > 0 ? (page - 1) * limit + 1 : 0;
  const endIndex = (page - 1) * limit + data.length;
  // Disable Next when we know total and have reached it; otherwise fallback to length heuristic
  const isLastPage = total != null ? endIndex >= total : data.length < limit;

  const totalPages = total != null ? Math.ceil(total / limit) : null;
  const pageSummary = totalPages ? `Page ${page} / ${totalPages}` : `Page ${page}`;
  const rangeSummary = total != null
    ? `${startIndex}–${endIndex} of ${total} entries`
    : `${startIndex}–${endIndex} entries`;

  console.log("Row IDs from backend:", data.map(d => d.id));
  console.log("Admin dashboard data:", data)

  // Client-side filtering (reintroduced)
  const filteredData = data.filter((entry) => {
    const q = selectedFilter.toLowerCase();
    if (!q) return true;

    return (
      entry.email?.toLowerCase().includes(q) ||
      entry.product_title?.toLowerCase().includes(q) ||
      entry.customer_name?.toLowerCase().includes(q) ||
      entry.isbn?.toLowerCase().includes(q)
    );
  });

  const sortedData = filteredData;


/*
  // Export CSV
  const handleExportCSV = () => {
    const headers = ["ID", "Product Title", "ISBN", "Email", "Submitted"];
    const rows = filteredData.map((entry: InterestEntry) => [
      entry.cr_id || "CRN/A",
      decodeHTMLEntities(entry.product_title),
      entry.isbn || "—",
      entry.email,
      new Date(entry.created_at).toLocaleString(),
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...rows].map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "customer_requests.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    const tableColumn = ["ID", "Product Title", "ISBN", "Email", "Submitted"];
    const tableRows = filteredData.map((entry: InterestEntry) => [
      entry.cr_id || "CRN/A",
      decodeHTMLEntities(entry.product_title),
      entry.isbn || "—",
      entry.email,
      new Date(entry.created_at).toLocaleString(),
    ]);
    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 128, 96] },
    });
    doc.save("customer_requests.pdf");
  };

  const handlePrint = () => {
    window.print();
  };*/

  // MobileRequestCard component for mobile cards
  const MobileRequestCard = ({ entry }: { entry: InterestEntry }) => {
    const [expanded, setExpanded] = useState(false);

    return (
      <div className="border p-4 rounded shadow-sm bg-white dark:bg-gray-800">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm font-medium">{decodeHTMLEntities(entry.product_title)}</p>
            <p className="text-xs text-gray-600 dark:text-gray-300">{entry.email}</p>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-600 dark:text-blue-400"
          >
            {expanded ? '⌃' : '⌄'}
          </button>
        </div>
        {expanded && (
          <div className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-200">
            {entry.cr_id && <p><strong>ID:</strong> {entry.cr_id}</p>}
            {entry.isbn && <p><strong>ISBN:</strong> {entry.isbn}</p>}
            <p><strong>Submitted:</strong> {new Date(entry.created_at).toLocaleDateString()}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold mb-4">Request Service</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-600 text-sm">Error: {error}</p>}
      
      {/* Bulk actions bar */}
      <div className="flex justify-end mb-2">
        <BulkActionsBar
          selectionCount={selectedIds.size}
          onBulkStatus={(s) => {
            // open ConfirmModal to bulk-apply status `s` to selectedIds
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

      {/* Flexbox container for controls */}
      <div className="flex justify-between items-center print-hidden">
        {/* FilterControls on the left */}
        <FilterControls
          selectedFilter={selectedFilter}
          handleFilterChange={handleFilterChange}
        />
        <select
          value={collectionFilter}
          onChange={(e) => setCollectionFilter(e.target.value as 'all' | 'op' | 'notop')}
          className="ml-3 text-sm text-left border rounded px-2 py-1 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
          aria-label="Filter by collection"
          title="Filter by collection"
        >
          <option value="all">All</option>
          <option value="op">Out-of-Print</option>
          <option value="notop">Not OP</option>
        </select>
        
        {/* Pagination controls */}
        <div className="flex items-center gap-3 ml-4">
          <label className="text-xs text-gray-700 dark:text-gray-300" htmlFor="rows-per-page">Rows:</label>
          <select
            id="rows-per-page"
            value={limit}
            onChange={onChangeLimit}
            className="border rounded px-2 py-1 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
            aria-label="Rows per page"
            title="Rows per page"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevPage}
              disabled={page === 1}
              className="px-2 py-1 border rounded disabled:opacity-50 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
            >
              Prev
            </button>
            <span className="text-xs md:text-sm text-gray-700 dark:text-gray-300">{pageSummary}</span>
            <button
              type="button"
              onClick={onNextPage}
              disabled={isLastPage}
              className="px-2 py-1 border rounded disabled:opacity-50 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
            >
              Next
            </button>
          </div>
          {/* Range display */}
          <span className="text-xs md:text-sm text-gray-700 dark:text-gray-300 ml-2">
            {rangeSummary}
          </span>
        </div>

        {/* ExportButtons on the right */}
        <ExportButtons
          filteredData={sortedData}
          decodeHTMLEntities={decodeHTMLEntities}
        />
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
        />
      </div>
      {/* Footer Summary (duplicates above) */}
      <div className="hidden sm:flex justify-end items-center gap-3 mt-2 print-hidden">
        <span className="text-[0.5rem] md:text-sm text-gray-700 dark:text-gray-300">{pageSummary}</span>
        <span className="text-[0.5rem] md:text-sm text-gray-700 dark:text-gray-300">{rangeSummary}</span>
      </div>
      {/* Mobile Cards */}
      <div className="block sm:hidden space-y-4">
        {sortedData.map((entry, index) => (
          <MobileRequestCard key={index} entry={entry} />
        ))}
      </div>
      {/* Mobile footer summary */}
      <div className="flex sm:hidden justify-between items-center mt-2 px-1 print-hidden">
        <span className="text-[0.5rem] text-gray-700 dark:text-gray-300">{pageSummary}</span>
        <span className="text-[0.5rem] text-gray-700 dark:text-gray-300">{rangeSummary}</span>
      </div>
      {/* Confirm modal for status change */}
      {pendingChange && (
        <ConfirmModal
          open={confirmOpen}
          onCancel={() => {
            setConfirmOpen(false);
            setPendingChange(null);
          }}
          onConfirm={async () => {
            if (!pendingChange) return;
            setConfirmBusy(true);
            try {
              await handleStatusChange(pendingChange.id, pendingChange.newStatus);
            } finally {
              setConfirmBusy(false);
              setConfirmOpen(false);
              setPendingChange(null);
            }
          }}
          busy={confirmBusy}
          title="Change status?"
          description={`Change from "${pendingChange.prevStatus}" to "${pendingChange.newStatus}"?`}
          confirmLabel="Change"
          cancelLabel="Cancel"
          variant="primary"
        />
      )}
      {/* Confirm modal for BULK status change */}
      {bulkTargetStatus && (
        <ConfirmModal
          open={bulkConfirmOpen}
          onCancel={() => {
            setBulkConfirmOpen(false);
            setBulkTargetStatus(null);
          }}
          onConfirm={async () => {
            const ids = Array.from(selectedIds);
            if (ids.length === 0 || !bulkTargetStatus) return;
            setBulkBusy(true);
            try {
              // Capture previous statuses for a single undo action
              const prevMap: Record<string, StatusPhase> = {};
              ids.forEach(id => {
                const prevStatus = (data.find(d => d.id === id)?.status as StatusPhase) ?? 'New';
                prevMap[id] = prevStatus;
              });

              await Promise.all(
                ids.map(id => handleStatusChange(id, bulkTargetStatus, { skipUndo: true }))
              );

              showUndo(`Changed ${ids.length} ${ids.length === 1 ? 'item' : 'items'} to "${bulkTargetStatus}". Undo?`, () => {
                Promise.all(ids.map(id => handleStatusChange(id, prevMap[id], { skipUndo: true })));
              });

              clearSelection();
            } finally {
              setBulkBusy(false);
              setBulkConfirmOpen(false);
              setBulkTargetStatus(null);
            }
          }}
          busy={bulkBusy}
          title={`Change status for ${selectedIds.size} selected?`}
          description={`Set status to "${bulkTargetStatus}" for ${selectedIds.size} selected ${selectedIds.size === 1 ? 'item' : 'items'}?`}
          confirmLabel="Change"
          cancelLabel="Cancel"
          variant="primary"
        />
      )}
      {/* Undo toast (10s) */}
      {undoToast && (
        <UndoToast
          message={undoToast.message}
          duration={10000}
          onUndo={() => {
            try {
              undoToast.onUndo();
            } finally {
              setUndoToast(null);
            }
          }}
          onClose={() => setUndoToast(null)}
        />
      )}
      {/* Confirm modal for BULK archive */}
      <ConfirmModal
        open={archiveConfirmOpen}
        onCancel={() => setArchiveConfirmOpen(false)}
        onConfirm={async () => {
          const ids = Array.from(selectedIds);
          if (ids.length === 0) {
            setArchiveConfirmOpen(false);
            return;
          }
          setArchiveBusy(true);
          try {
            const res = await fetch(
              `${import.meta.env.VITE_API_BASE_URL}/api/archive/bulk?token=${import.meta.env.VITE_ADMIN_TOKEN}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
              }
            );
            if (!res.ok) throw new Error('Failed to archive selected');
            // Optimistic UI: remove archived rows from current view
            setData(prev => prev.filter(item => !ids.includes(item.id)));
            clearSelection();
          } catch (e) {
            console.error('Bulk archive failed', e);
          } finally {
            setArchiveBusy(false);
            setArchiveConfirmOpen(false);
          }
        }}
        busy={archiveBusy}
        title={`Archive ${selectedIds.size} selected?`}
        description={`Move ${selectedIds.size} selected ${selectedIds.size === 1 ? 'item' : 'items'} to archive.`}
        confirmLabel="Archive"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  )
}


export default RequestService
