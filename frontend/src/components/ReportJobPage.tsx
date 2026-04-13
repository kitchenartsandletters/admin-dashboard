import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getReportById } from '../reports/registry';

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped';

interface ProductRow {
  title:       string;
  author:      string;
  vendor:      string;
  isbn:        string;
  price:       string;
  collections: string[];
  available:   number | null;
  incoming:    number;
  ol_sold:     number;
  pos_sold:    number;
  attributes:  string;
}

interface Sections {
  main:        ProductRow[];
  backorders:  ProductRow[];
  out_of_stock: ProductRow[];
  preorders:   ProductRow[];
  op_sales:    ProductRow[];
}

interface RowCounts {
  main:        number;
  backorders:  number;
  out_of_stock: number;
  preorders:   number;
  op_sales:    number;
}

interface JobResult {
  report_id:       string;
  window_start:    string;
  window_end:      string;
  csv_filename:    string | null;
  pdf_filename:    string | null;
  email_sent:      boolean;
  delivery_method: string;
  formats:         string[];
  row_counts:      RowCounts;
  sections?:       Sections;
  // skipped run
  skipped?:        boolean;
  reason?:         string;
}

interface ReportJob {
  id:           string;
  report_id:    string;
  status:       JobStatus;
  parameters:   Record<string, any> | null;
  result:       JobResult | null;
  error:        string | null;
  requested_by: string | null;
  created_at:   string;
  started_at:   string | null;
  completed_at: string | null;
}
// ─── Article-agnostic sort ────────────────────────────────────────────────────
// Mirrors sort_title_key() from daily_sales_report.py.
// Strips leading articles in English, French, and Spanish before comparing.

const ARTICLES = [
  // English
  'the ', 'a ', 'an ',
  // French
  'les ', 'la ', 'le ', "l'", 'des ', 'du ', 'de la ', 'de ',
  // Spanish
  'los ', 'las ', 'el ', 'la ', 'un ', 'una ', 'unos ', 'unas ',
  'a la ', 'al ',
];

function sortTitleKey(title: string): string {
  const lower = title.trim().toLowerCase();
  for (const article of ARTICLES) {
    if (lower.startsWith(article)) {
      return lower.slice(article.length).trimStart();
    }
  }
  return lower;
}



// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS        = 200; // 10 min ceiling

const SECTION_META: Record<keyof Sections, { label: string; emptyMsg: string }> = {
  main:        { label: 'Sales',         emptyMsg: 'No sales in this window.' },
  backorders:  { label: 'Backorders',    emptyMsg: 'No backorders.' },
  out_of_stock:{ label: 'Out of stock',  emptyMsg: 'No out-of-stock products.' },
  preorders:   { label: 'Preorders',     emptyMsg: 'No preorders.' },
  op_sales:    { label: 'Out of Print',  emptyMsg: 'No out-of-print sales.' },
};

const SECTION_ORDER: (keyof Sections)[] = ['main', 'backorders', 'out_of_stock', 'preorders', 'op_sales'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

function fmtWindow(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZoneName: 'short',
    });
  return `${fmt(start)} → ${fmt(end)}`;
}

function elapsed(from: string): string {
  const secs = Math.floor((Date.now() - new Date(from).getTime()) / 1000);
  if (secs < 60)  return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function statusStyles(status: JobStatus): string {
  switch (status) {
    case 'success':   return 'bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-300';
    case 'failed':    return 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300';
    case 'running':   return 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300';
    case 'queued':    return 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300';
    case 'skipped':   return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    case 'cancelled': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    default:          return 'bg-gray-100 text-gray-600';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-36 shrink-0 text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

function SectionTable({ rows, sectionKey }: { rows: ProductRow[]; sectionKey: keyof Sections }) {
  const [sortCol, setSortCol]   = useState<keyof ProductRow>('title');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');
  const [search, setSearch]     = useState('');
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('report_table_font_size');
    return saved ? Number(saved) : 12;
  });

  function handleFontSize(v: number) {
    setFontSize(v);
    localStorage.setItem('report_table_font_size', String(v));
  }
  const meta = SECTION_META[sectionKey];

  function toggleSort(col: keyof ProductRow) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const filtered = rows.filter(r =>
    !search ||
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.author.toLowerCase().includes(search.toLowerCase()) ||
    r.isbn.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const av = sortCol === 'title' ? sortTitleKey(String(a[sortCol] ?? '')) : (a[sortCol] ?? '');
    const bv = sortCol === 'title' ? sortTitleKey(String(b[sortCol] ?? '')) : (b[sortCol] ?? '');
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortIcon = ({ col }: { col: keyof ProductRow }) => {
    if (col !== sortCol) return <span className="ml-1 text-gray-300 dark:text-gray-600">↕</span>;
    return <span className="ml-1 text-gray-600 dark:text-gray-300">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const Th = ({ col, label, right }: { col: keyof ProductRow; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400
        bg-gray-50 dark:bg-gray-800/60 cursor-pointer select-none whitespace-nowrap
        hover:text-gray-800 dark:hover:text-gray-200 border-b border-gray-200 dark:border-gray-700
        ${right ? 'text-right' : 'text-left'}`}
    >
      {label}<SortIcon col={col} />
    </th>
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 py-4">{meta.emptyMsg}</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 dark:text-gray-500">{sorted.length} of {rows.length} items</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">A</span>
            <input
              type="range"
              min={9}
              max={14}
              step={1}
              value={fontSize}
              onChange={e => handleFontSize(Number(e.target.value))}
              className="w-16 h-1 accent-gray-500"
              title={`Font size: ${fontSize}px`}
            />
            <span className="text-xs text-gray-600 dark:text-gray-300" style={{ fontSize: '14px' }}>A</span>
          </div>
        </div>
        <input
          type="text"
          placeholder="Filter by title, author, ISBN…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs
            bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 w-56
            focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
        <table className="w-full border-collapse min-w-[700px]" style={{ fontSize: `${fontSize}px` }}>
          <thead>
            <tr>
              <Th col="title"      label="Title" />
              <Th col="author"     label="Author" />
              <Th col="isbn"       label="ISBN" />
              <Th col="price"      label="Price"      right />
              <Th col="available"  label="On hand"    right />
              <Th col="incoming"   label="Incoming"   right />
              <Th col="ol_sold"    label="Online"     right />
              <Th col="pos_sold"   label="POS"        right />
              <Th col="attributes" label="Attributes" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={`${row.isbn}-${i}`}
                className="border-b border-gray-100 dark:border-gray-800
                  hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
              >
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-[220px]">
                  <span className="block truncate" title={row.title}>{row.title}</span>
                  {row.vendor && (
                    <span className="text-gray-400 dark:text-gray-500 text-[10px]">{row.vendor}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.author || '—'}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">{row.isbn}</td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.price || '—'}</td>
                <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
                  row.available !== null && row.available < 0
                    ? 'text-red-600 dark:text-red-400'
                    : row.available === 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {row.available ?? '—'}
                </td>
                <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{row.incoming}</td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap">{row.ol_sold}</td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap">{row.pos_sold}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{row.attributes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ─── Download helpers ─────────────────────────────────────────────────────────

function downloadCSV(sections: Sections, windowStart: string, windowEnd: string, jobId: string) {
  const rows: string[] = [];
  const fmt = (v: any) => String(v ?? '').includes(',') ? `"${v}"` : String(v ?? '');
  const header = ['Product','Author','Vendor','ISBN','Price','Collection','On Hand','Incoming','Online','POS','Attributes'];

  rows.push(`Report window: ${fmtWindow(windowStart, windowEnd)}`);
  rows.push('');

  const writeSection = (label: string, data: ProductRow[]) => {
    if (!data.length) return;
    rows.push(label);
    rows.push('');
    rows.push(header.join(','));
    const sorted = [...data].sort((a, b) =>
      sortTitleKey(a.title).localeCompare(sortTitleKey(b.title), undefined, { sensitivity: 'base' })
    );
    sorted.forEach(r => rows.push([
      r.title, r.author, r.vendor, r.isbn, r.price,
      r.collections.join(' | '),
      r.available ?? '', r.incoming, r.ol_sold, r.pos_sold, r.attributes,
    ].map(fmt).join(',')));
    rows.push('');
  };

  writeSection('SALES', sections.main);
  writeSection('BACKORDERS', sections.backorders);
  writeSection('OUT OF STOCK', sections.out_of_stock);
  writeSection('PREORDER SALES', sections.preorders);
  writeSection('OUT OF PRINT', sections.op_sales);

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `daily_sales_report_${jobId.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPDF(sections: Sections, windowStart: string, windowEnd: string, jobId: string) {
  const loadScript = (src: string) => new Promise<void>((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve();
    document.head.appendChild(s);
  });

  loadScript('https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js')
    .then(() => loadScript('https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'))
    .then(() => {
      const { jsPDF } = (window as any).jspdf;

      // Letter portrait — matching ReportLab: 0.8in margins = 57.6pt
      const doc     = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      const ML      = 57.6;
      const MR      = 57.6;
      const pageW   = 612;
      const pageH   = 792;
      const HEADER_H = 68;   // space consumed by page header
      const contentW = pageW - ML - MR;  // 496.8pt

      // Column widths matching daily_sales_pdf.py (inches * 72):
      // 2.4, 1.6, 0.8, 0.8, 2.0 inches
      const colWidths = [172.8, 115.2, 57.6, 57.6, 93.6];
      // Note: sum = 496.8 = contentW

      const fmtWindowLocal = (ws: string, we: string) => {
        const fmt = (iso: string) => {
          const d = new Date(iso);
          return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
            timeZoneName: 'short',
          }).replace(/→/g, '->');
        };
        return `${fmt(ws)} -> ${fmt(we)}`;
      };

      const reportTitle  = 'Daily Sales Report';
      const windowLabel  = fmtWindowLocal(windowStart, windowEnd);

      const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(reportTitle, ML, 40);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(windowLabel, ML, 55);
      };

      drawHeader();

      const SECTION_ORDER_PDF: [keyof Sections, string][] = [
        ['main',         'Main Sales'],
        ['backorders',   'Backorders'],
        ['out_of_stock', 'Out of Stock'],
        ['preorders',    'Preorders'],
        ['op_sales',     'Out of Print'],
      ];

      let cursorY = HEADER_H;

      SECTION_ORDER_PDF.forEach(([key, label]) => {
        const rows = sections[key];
        if (!rows?.length) return;

        const sorted = [...rows].sort((a, b) =>
          sortTitleKey(a.title).localeCompare(sortTitleKey(b.title), undefined, { sensitivity: 'base' })
        );

        // Build body: 2 rows per product
        const body: string[][] = [];
        const metaRows: number[] = [];

        sorted.forEach(r => {
          const priceRaw = r.price ? parseFloat(String(r.price)) : null;
          const priceStr = priceRaw != null && !isNaN(priceRaw) ? `$${priceRaw.toFixed(2)}` : '--';
          const isbnStr  = r.isbn && r.isbn !== 'NO BARCODE' ? `ISBN: ${r.isbn}` : 'ISBN: --';
          const vendorStr = r.vendor ? `Vendor: ${r.vendor}` : 'Vendor: --';

          body.push([
            r.title      || '',
            r.author     || '',
            r.available != null ? String(r.available) : '',
            String(r.incoming ?? 0),
            r.attributes || '',
          ]);
          body.push(['', isbnStr, priceStr, '', vendorStr]);
          metaRows.push(body.length - 1);
        });

        // Section label — check if we need a new page (label + at least ~30pt for first row)
        if (cursorY + 30 > pageH - 40) {
          doc.addPage();
          drawHeader();
          cursorY = HEADER_H;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(label.toUpperCase(), ML, cursorY + 12);
        cursorY += 20;

        (doc as any).autoTable({
          head: [['Title', 'Author', 'On Hand', 'Incoming', 'Attributes']],
          body,
          startY: cursorY,
          margin: { left: ML, right: MR, top: HEADER_H, bottom: 40 },
          tableWidth: contentW,
          columnStyles: {
            0: { cellWidth: colWidths[0] },
            1: { cellWidth: colWidths[1] },
            2: { cellWidth: colWidths[2], halign: 'right' },
            3: { cellWidth: colWidths[3], halign: 'right' },
            4: { cellWidth: colWidths[4] },
          },
          headStyles: {
            fillColor: [160, 160, 160],
            textColor: [0, 0, 0],
            fontStyle: 'normal',
            fontSize: 8,
            cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
          },
          styles: {
            fontSize: 7,
            cellPadding: { top: 2, right: 4, bottom: 2, left: 4 },
            lineColor: [236, 236, 237],
            lineWidth: 0.25,
            overflow: 'linebreak',
            textColor: [0, 0, 0],
          },
          bodyStyles: {
            fillColor: [255, 255, 255],
          },
          didParseCell: (data: any) => {
            if (data.section === 'body' && metaRows.includes(data.row.index)) {
              data.cell.styles.fillColor   = [240, 240, 240];
              data.cell.styles.fontSize    = 7;
              data.cell.styles.cellPadding = {
                top: 1, bottom: 1,
                left: data.column.index === 0 ? 4 : 12,
                right: 4,
              };
            }
          },
          didDrawPage: (hookData: any) => {
            // Redraw header on every new page autotable creates
            if (hookData.pageNumber > 1 || hookData.cursor?.y !== cursorY) {
              drawHeader();
            }
          },
        });

        cursorY = (doc as any).lastAutoTable.finalY + 16;
      });

      doc.save(`daily_sales_report_${jobId.slice(0, 8)}.pdf`);
    });
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReportJobPage() {
  const { jobId }  = useParams<{ jobId: string }>();
  const navigate   = useNavigate();

  const [job, setJob]           = useState<ReportJob | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<keyof Sections>('main');
  const [tick, setTick]         = useState(0); // for elapsed timer re-renders

  const pollCount   = useRef(0);
  const pollTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer   = useRef<ReturnType<typeof setInterval> | null>(null);

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  const token   = import.meta.env.VITE_ADMIN_TOKEN;

  const isTerminal = (status: JobStatus) =>
    ['success', 'failed', 'cancelled', 'skipped'].includes(status);

  async function fetchJob() {
    try {
      const res = await fetch(`${apiBase}/api/reports/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data: ReportJob = await res.json();
      setJob(data);
      setLoading(false);

      if (isTerminal(data.status)) {
        // Stop polling
        if (pollTimer.current) clearTimeout(pollTimer.current);
        if (tickTimer.current) clearInterval(tickTimer.current);
        return;
      }

      // Continue polling if under ceiling
      pollCount.current += 1;
      if (pollCount.current < MAX_POLLS) {
        pollTimer.current = setTimeout(fetchJob, POLL_INTERVAL_MS);
      } else {
        setError('Timed out waiting for job to complete. Refresh to check again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load job.');
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    fetchJob();
    // Tick every second so elapsed time updates live
    tickTimer.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (tickTimer.current) clearInterval(tickTimer.current);
    };
  }, [jobId]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const reportDef = job ? getReportById(job.report_id as any) : null;
  const result    = job?.result ?? null;
  const sections  = result?.sections ?? null;
  const isTableDelivery = result?.delivery_method === 'table';

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <span className="animate-spin text-base">⟳</span>
        Loading job…
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <Link to="/reports" className="text-sm text-gray-500 hover:underline">← Back to reports</Link>
      </div>
    );
  }

  if (!job) return null;

  const inProgress = !isTerminal(job.status);

  return (
    <div className="p-6 space-y-6 max-w-6xl">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
        <Link to="/reports" className="hover:text-gray-700 dark:hover:text-gray-300">Reports</Link>
        <span>/</span>
        <span className="text-gray-700 dark:text-gray-200">
          {reportDef?.title ?? job.report_id}
        </span>
        <span>/</span>
        <span className="font-mono text-xs">{job.id.slice(0, 8)}…</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {reportDef?.title ?? job.report_id}
            </h1>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusStyles(job.status)}`}>
              {job.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Queued {fmtDatetime(job.created_at)}
          </p>
        </div>

        {/* Live elapsed / refresh */}
        {inProgress && (
          <div className="text-sm text-gray-400 dark:text-gray-500 flex items-center gap-2">
            <span className="animate-spin">⟳</span>
            <span>Running — {elapsed(job.created_at)}</span>
          </div>
        )}
        {!inProgress && (
          <button
            onClick={() => navigate('/reports')}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700
              text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            ← Back to reports
          </button>
        )}
      </div>

      {/* Job metadata card */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-2.5">
        <MetaRow label="Job ID"    value={<span className="font-mono text-xs">{job.id}</span>} />
        <MetaRow label="Report"    value={reportDef?.title ?? job.report_id} />
        <MetaRow label="Status"    value={
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusStyles(job.status)}`}>
            {job.status}
          </span>
        } />
        {job.started_at && (
          <MetaRow label="Started"   value={fmtDatetime(job.started_at)} />
        )}
        {job.completed_at && (
          <MetaRow label="Completed" value={fmtDatetime(job.completed_at)} />
        )}
        {job.started_at && job.completed_at && (
          <MetaRow label="Duration"  value={
            `${((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000).toFixed(1)}s`
          } />
        )}
        {result?.window_start && result?.window_end && (
          <MetaRow label="Window"    value={fmtWindow(result.window_start, result.window_end)} />
        )}
        {result?.delivery_method && (
          <MetaRow label="Delivery"  value={result.delivery_method === 'email' ? 'Email' : 'Dashboard table'} />
        )}
        {result?.formats && result.formats.length > 0 && (
          <MetaRow label="Formats"   value={result.formats.map(f => f.toUpperCase()).join(', ')} />
        )}
      </div>

      {/* ── In-progress state ── */}
      {inProgress && (
        <div className="rounded-lg border border-blue-100 dark:border-blue-900/50
          bg-blue-50 dark:bg-blue-950/30 p-6 text-center space-y-2">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            {job.status === 'queued' ? 'Waiting for worker…' : 'Report is generating…'}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            This page refreshes automatically every {POLL_INTERVAL_MS / 1000} seconds.
          </p>
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>
          )}
        </div>
      )}

      {/* ── Failed state ── */}
      {job.status === 'failed' && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 space-y-2">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Job failed</p>
          {job.error && (
            <pre className="text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap font-mono bg-red-100 dark:bg-red-950/50 rounded p-3 overflow-x-auto">
              {job.error}
            </pre>
          )}
        </div>
      )}

      {/* ── Skipped state ── */}
      {job.status === 'skipped' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {result?.reason === 'non_business_day'
              ? 'This report was skipped because the run date is not a business day. Automated reports only run on open store days.'
              : `Skipped: ${result?.reason ?? 'unknown reason'}`}
          </p>
        </div>
      )}

      {/* ── Success: email delivery ── */}
      {job.status === 'success' && !isTableDelivery && result && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4 space-y-3">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            Report delivered successfully
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(result.row_counts ?? {}).map(([key, count]) => (
              <div key={key} className="bg-white dark:bg-gray-900 rounded border border-green-100 dark:border-green-900 p-3 text-center">
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{count}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{SECTION_META[key as keyof Sections]?.label ?? key}</p>
              </div>
            ))}
          </div>
          {result.email_sent && (
            <p className="text-xs text-green-700 dark:text-green-400">
              Email sent to configured recipients.
            </p>
          )}
          {result.csv_filename && (
            <p className="text-xs text-gray-500 dark:text-gray-400">File: {result.csv_filename}</p>
          )}
        </div>
      )}

      {/* ── Success: table delivery ── */}
      {job.status === 'success' && isTableDelivery && result && (
        <div className="space-y-4">

          {/* Summary row counts */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {SECTION_ORDER.map(key => {
              const count = result.row_counts?.[key] ?? 0;
              const isActive = activeSection === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveSection(key)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    isActive
                      ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  <p className={`text-lg font-semibold ${
                    isActive ? 'text-white dark:text-gray-900' : 'text-gray-900 dark:text-gray-100'
                  }`}>{count}</p>
                  <p className={`text-xs ${
                    isActive ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'
                  }`}>{SECTION_META[key].label}</p>
                </button>
              );
            })}
          </div>

          {/* Download buttons */}
          {sections && (
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => downloadCSV(sections, result.window_start!, result.window_end!, job.id)}
                className="text-xs px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700
                  text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800
                  flex items-center gap-1.5"
              >
                <span>↓</span> CSV
              </button>
              <button
                onClick={() => downloadPDF(sections, result.window_start!, result.window_end!, job.id)}
                className="text-xs px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700
                  text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800
                  flex items-center gap-1.5"
              >
                <span>↓</span> PDF
              </button>
            </div>
          )}

          {/* Section table */}
          {sections ? (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {SECTION_META[activeSection].label}
                </h2>
                {result.window_start && result.window_end && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {fmtWindow(result.window_start, result.window_end)}
                  </span>
                )}
              </div>
              <SectionTable
                rows={sections[activeSection]}
                sectionKey={activeSection}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Row data is not available for this job. This can happen for jobs that ran before
                table delivery was supported.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}