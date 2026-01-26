import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { InterestEntry } from "../types";

export interface ExportButtonsProps {
  filteredData: InterestEntry[];
  decodeHTMLEntities: (str: string) => string;
}

const decodeHTMLEntities = (str: string): string => {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
};

export default function ExportButtons({ filteredData }: ExportButtonsProps) {
  const handleExportCSV = () => {
    const headers = ["ID", "Product Title", "ISBN", "Email", "Submitted"];
    const rows = filteredData.map((entry) => [
      entry.cr_id || "CRN/A",
      decodeHTMLEntities(entry.product_title),
      entry.isbn || "—",
      entry.email,
      new Date(entry.created_at).toLocaleDateString(),
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

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const tableColumn = ["ID", "Product Title", "ISBN", "Email", "Submitted"];
    const tableRows = filteredData.map((entry) => [
      entry.cr_id || "CRN/A",
      decodeHTMLEntities(entry.product_title),
      entry.isbn || "—",
      entry.email,
      new Date(entry.created_at).toLocaleDateString(),
    ]);
    doc.text("Out of Stock Request List", 14, 15);
    doc.text("Printed on: " + new Date().toLocaleDateString(), 14, 20);
    autoTable(doc, {
      startY: 20,
      head: [tableColumn],
      body: tableRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 128, 96] },
    });
    doc.save("customer_requests.pdf");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-nowrap justify-end w-full mb-[10px] gap-[0.2rem] print-hidden">
      <button onClick={handleExportCSV} className="px-2 py-1 border rounded text-xs bg-white dark:bg-gray-800 dark:text-white disabled:opacity-50 hover:bg-gray-50">
        Export CSV
      </button>
      <button onClick={handleExportPDF} className="px-2 py-1 border rounded text-xs bg-white dark:bg-gray-800 dark:text-white disabled:opacity-50 hover:bg-gray-50">
        Export PDF
      </button>
      <button onClick={handlePrint} className="px-2 py-1 border rounded text-xs bg-white dark:bg-gray-800 dark:text-white disabled:opacity-50 hover:bg-gray-50">
        🖨️
      </button>
    </div>
  );
}
