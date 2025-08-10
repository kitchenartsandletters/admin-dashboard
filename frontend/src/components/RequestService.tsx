import { useEffect, useState } from 'react'
import FilterControls, { FilterControlsProps } from './FilterControls';
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import DashboardHeader from './DashboardHeader';
import ExportButtons from "./ExportButtons";
import RequestTable from './RequestTable';
import { InterestEntry } from '../types';

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

const RequestService = () => {
  const [data, setData] = useState<InterestEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: keyof InterestEntry; direction: 'asc' | 'desc' } | null>(null)
  const [selectedFilter, setSelectedFilter] = useState('');

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
  };

  const renderSortIcon = (key: keyof InterestEntry) => {
    if (!sortConfig || sortConfig.key !== key) return '⇅';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

    const handleStatusChange = async (requestId: string, newStatus: string) => {
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
                const statusOrder = [
                  "New",
                  "In Review",
                  "Contacted",
                  "Waiting on Customer",
                  "Approved",
                  "Closed"
                ];
                const aIndex = statusOrder.indexOf(a.status || "New");
                const bIndex = statusOrder.indexOf(b.status || "New");
                return (aIndex - bIndex) * (direction === 'asc' ? 1 : -1);
              }
              return 0; // Other sorts fall back to default sorter in sortedData
            });
          }

          return updated;
        });

        // Backend update
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/update_status?token${import.meta.env.VITE_ADMIN_TOKEN}`, {
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

      } catch (err) {
        console.error("Error updating status:", err);
      }
    };

  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/interest?token${import.meta.env.VITE_ADMIN_TOKEN}`)
        let json: any
        try {
          json = await res.clone().json()
        } catch (e) {
          const errorText = await res.text()
          console.error("Failed to parse JSON:", errorText)
          throw new Error("Malformed JSON")
        }
        if (!res.ok || !json?.data || !Array.isArray(json.data)) {
          throw new Error("Invalid data response")
        }
        setData(json.data)
        setLoading(false)
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
        ])
        setError(err.message)
        setLoading(false)
      }
    }

    fetchData()
  }, [])
  console.log("Row IDs from backend:", data.map(d => d.id));
  console.log("Admin dashboard data:", data)

  // Sort helper
  const statusOrder = [
    "New",
    "In Review",
    "Contacted",
    "Waiting on Customer",
    "Approved",
    "Closed"
  ];

  const sortedData = [...data].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const aVal = a[key];
    const bVal = b[key];

    if (aVal == null || bVal == null) return 0;

    // Special case for status sorting
    if (key === 'status') {
      const aIndex = statusOrder.indexOf(aVal as string);
      const bIndex = statusOrder.indexOf(bVal as string);
      return (aIndex - bIndex) * (direction === 'asc' ? 1 : -1);
    }

    if (key === 'cr_id') {
      return aVal.toString().localeCompare(bVal.toString()) * (direction === 'asc' ? 1 : -1);
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      const stripLeadingArticle = (str: string) =>
        str.replace(/^\s*(a |an |the )/i, '').trim();
      return stripLeadingArticle(aVal).localeCompare(stripLeadingArticle(bVal)) * (direction === 'asc' ? 1 : -1);
    }

    if (key === 'created_at') {
      const aDate = Date.parse(aVal as string);
      const bDate = Date.parse(bVal as string);
      return (aDate - bDate) * (direction === 'asc' ? 1 : -1);
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * (direction === 'asc' ? 1 : -1);
    }

    return aVal.toString().localeCompare(bVal.toString()) * (direction === 'asc' ? 1 : -1);
  });


  const filteredData = sortedData.filter((entry) =>
    Object.values(entry)
      .join(" ")
      .toLowerCase()
      .includes(selectedFilter.toLowerCase())
  )

  const filteredItems = data.filter(item =>
    item.product_title.toLowerCase().includes(selectedFilter.toLowerCase()) ||
    item.email.toLowerCase().includes(selectedFilter.toLowerCase()) ||
    item.cr_id?.toLowerCase().includes(selectedFilter.toLowerCase())
  );
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
      {/* Filter and export controls */}
      <div className="print-hidden">
        <ExportButtons
          filteredData={filteredData}
          decodeHTMLEntities={decodeHTMLEntities}
        />
      </div>
      {/* FilterControls and Table */}
      <div className="print-hidden">
        <FilterControls
          selectedFilter={selectedFilter}
          handleFilterChange={handleFilterChange}
        />
      </div>
      {/* Desktop Table */}
      <div className="hidden sm:block">
        <RequestTable
          filteredData={filteredData}
          handleSort={handleSort}
          renderSortIcon={renderSortIcon}
          sortConfig={sortConfig}
          decodeHTMLEntities={decodeHTMLEntities}
          onStatusChange={handleStatusChange}
        />
      </div>
      {/* Mobile Cards */}
      <div className="block sm:hidden space-y-4">
        {filteredData.map((entry, index) => (
          <MobileRequestCard key={index} entry={entry} />
        ))}
      </div>
    </div>
  )
}


export default RequestService