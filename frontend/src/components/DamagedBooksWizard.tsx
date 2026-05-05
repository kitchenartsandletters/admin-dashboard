import React, { useState, useCallback } from 'react';
import ConfirmModal from './ConfirmModal';
import DamagedBooksService from './DamagedBooksService';
import ScannerModal from './damaged/ScannerModal';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type InputType = 'isbn' | 'product_id';

type InventorySeed = {
  light: number;
  moderate: number;
  heavy: number;
};

/** One book row in the wizard form */
type BookRow = {
  id: string;           // stable React key — never sent to the backend
  isbn: string;         // raw user input: ISBN-10, ISBN-13, or Shopify product ID
  inventory: InventorySeed;
};

/**
 * Preview shape returned by /admin/bulk-create/preview.
 * Note: `title` is the CONDITION label ("Light Damage" etc), not the book title.
 * The book title is derived from canonical_handle for display purposes.
 */
type PreviewItem = {
  canonical_product_id: string;
  canonical_handle: string;
  condition: 'light' | 'moderate' | 'heavy';
  title: string;
  price: string;
  discount_pct: number;   // decimal — 0.15 = 15%
  inventory_seed: number;
  sku: string;
  barcode: string;
};

/** Per-book result returned by /admin/bulk-create */
type BookResult = {
  status: 'created' | 'updated' | 'error' | 'dry-run';
  damaged_product_id?: string | null;
  damaged_handle?: string | null;
  messages?: string[];
};

/** Per-book error that blocked processing entirely */
type BookError = {
  canonical_handle: string;
  error: string;
};

/** Full response shape from /admin/bulk-create */
type ConfirmResponse = {
  ok: boolean;
  results?: BookResult[];
  errors?: BookError[];
  meta?: {
    processed: number;
    succeeded: number;
    failed: number;
  };
  // Legacy / fallback
  message?: string;
  error?: string;
};

type WizardPhase = 'idle' | 'preview' | 'confirming' | 'result';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const CONDITIONS = ['light', 'moderate', 'heavy'] as const;
type Condition = (typeof CONDITIONS)[number];

const CONDITION_META: Record<Condition, { label: string; color: string; bgColor: string }> = {
  light: {
    label: 'Light',
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
  },
  moderate: {
    label: 'Moderate',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
  },
  heavy: {
    label: 'Heavy',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
  },
};

function emptyRow(): BookRow {
  return {
    id: crypto.randomUUID(),
    isbn: '',
    inventory: { light: 0, moderate: 0, heavy: 0 },
  };
}

function detectInputType(value: string): InputType {
  // ISBN-10 or ISBN-13 (digits only, 10 or 13 chars)
  return /^\d{10}(\d{3})?$/.test(value.trim()) ? 'isbn' : 'product_id';
}

/** Turn a Shopify handle into a readable display title for the preview table */
function displayTitleFromHandle(handle: string): string {
  return handle
    .replace(/-damaged$/, '')
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Build a Shopify Admin URL for a product.
 * Requires VITE_SHOPIFY_STORE_HANDLE env var (e.g. "kitchenartsandletters").
 * Returns null if the store handle isn't configured.
 */
const SHOPIFY_STORE_HANDLE = (import.meta as any).env?.VITE_SHOPIFY_STORE_HANDLE ?? '';

function shopifyAdminProductUrl(productId: string | null | undefined): string | null {
  if (!SHOPIFY_STORE_HANDLE || !productId) return null;
  const rawId = String(productId).split('/').pop() ?? productId;
  return `https://admin.shopify.com/store/${SHOPIFY_STORE_HANDLE}/products/${rawId}`;
}

/** Group preview items by canonical_handle, preserving insertion order */
function groupByBook(items: PreviewItem[]): [string, PreviewItem[]][] {
  const map = new Map<string, PreviewItem[]>();
  for (const item of items) {
    if (!map.has(item.canonical_handle)) map.set(item.canonical_handle, []);
    map.get(item.canonical_handle)!.push(item);
  }
  return Array.from(map.entries());
}

// ─────────────────────────────────────────────────────────────────────────────
// BookRowInput — single book entry (ISBN field + 3 qty inputs)
// ─────────────────────────────────────────────────────────────────────────────

type BookRowInputProps = {
  row: BookRow;
  index: number;
  canRemove: boolean;
  disabled: boolean;
  onUpdate: (updates: Partial<BookRow>) => void;
  onRemove: () => void;
  onScanRequest: () => void;
};

function BookRowInput({
  row,
  index,
  canRemove,
  disabled,
  onUpdate,
  onRemove,
  onScanRequest,
}: BookRowInputProps) {
  const updateInventory = (cond: Condition, raw: string) => {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    onUpdate({ inventory: { ...row.inventory, [cond]: n } });
  };

  const totalQty = CONDITIONS.reduce((s, c) => s + row.inventory[c], 0);

  return (
    <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-sm overflow-hidden transition-shadow hover:shadow-md">

      {/* ── Row header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold">
            {index + 1}
          </span>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Book {index + 1}
          </span>
          {totalQty > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              · {totalQty} cop{totalQty === 1 ? 'y' : 'ies'}
            </span>
          )}
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            disabled={disabled}
            type="button"
            aria-label={`Remove book ${index + 1}`}
            className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* ── ISBN / Product ID ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            ISBN or Product ID
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={row.isbn}
              onChange={e => onUpdate({ isbn: e.target.value })}
              placeholder="e.g. 9780385340533"
              disabled={disabled}
              autoComplete="off"
              className="
                flex-1 px-3 py-2 border rounded-lg text-sm
                dark:bg-gray-800 dark:text-white dark:border-gray-700
                focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none
                shadow-sm placeholder-gray-400 dark:placeholder-gray-600
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-shadow
              "
            />
            <button
              onClick={onScanRequest}
              disabled={disabled}
              type="button"
              aria-label="Scan barcode"
              className="
                flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                border border-blue-200 dark:border-blue-800
                text-blue-600 dark:text-blue-400
                hover:bg-blue-50 dark:hover:bg-blue-900/20
                transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                whitespace-nowrap
              "
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Scan
            </button>
          </div>
        </div>

        {/* ── Qty per condition ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            Quantity by Condition
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CONDITIONS.map(cond => {
              const meta = CONDITION_META[cond];
              return (
                <div key={cond} className={`rounded-lg p-2.5 ${meta.bgColor} border border-transparent`}>
                  <label className={`block text-xs font-semibold mb-1.5 ${meta.color}`}>
                    {meta.label}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={row.inventory[cond] === 0 ? '' : row.inventory[cond]}
                    onChange={e => updateInventory(cond, e.target.value)}
                    onBlur={e => {
                      if (e.target.value === '') updateInventory(cond, '0');
                    }}
                    placeholder="0"
                    disabled={disabled}
                    className="
                      w-full px-2 py-1.5 rounded-md text-sm text-center font-medium
                      bg-white dark:bg-gray-800
                      border border-gray-200 dark:border-gray-600
                      focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-shadow
                    "
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main wizard component
// ─────────────────────────────────────────────────────────────────────────────

export default function DamagedBooksWizard() {
  const [rows, setRows] = useState<BookRow[]>([emptyRow()]);
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [phase, setPhase] = useState<WizardPhase>('idle');
  const [result, setResult] = useState<ConfirmResponse | null>(null);

  // Scanner state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activeScanRowIndex, setActiveScanRowIndex] = useState<number | null>(null);

  // ── Row operations ───────────────────────────────────────────────────────

  const addRow = () => setRows(prev => [...prev, emptyRow()]);

  const removeRow = useCallback((id: string) => {
    setRows(prev => (prev.length > 1 ? prev.filter(r => r.id !== id) : prev));
  }, []);

  const updateRow = useCallback((id: string, updates: Partial<BookRow>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)));
  }, []);

  // ── Scanner ──────────────────────────────────────────────────────────────

  const openScanner = (index: number) => {
    setActiveScanRowIndex(index);
    setIsScannerOpen(true);
  };

  const handleScan = useCallback((isbn: string, inventory: InventorySeed) => {
    // Fill the target row with isbn + per-condition quantities from the scanner,
    // then append a new empty row so the scanner can immediately continue to
    // the next book without the user needing to press "Add Another Book" manually.
    setRows(prev => {
      const updated = prev.map((r, i) =>
        i === activeScanRowIndex ? { ...r, isbn, inventory } : r
      );
      return [...updated, emptyRow()];
    });
    // Advance the scan target to the newly added empty row.
    // The scanner stays open — modal manages its own state back to 'scanning'.
    setActiveScanRowIndex(prev => (prev !== null ? prev + 1 : null));
  }, [activeScanRowIndex]);

  const closeScanner = () => {
    setIsScannerOpen(false);
    setActiveScanRowIndex(null);
  };

  // ── Phase 1: Preview ─────────────────────────────────────────────────────
  //
  // One preview API call per book row (parallel via Promise.allSettled).
  // Each call uses that row's own inventory seed — this is how per-book
  // quantities work without requiring a backend schema change.
  //
  // Zero-qty conditions are filtered out before the preview table is shown
  // and before the confirm payload is built.

  async function handlePreview() {
    setError(null);
    setWarnings([]);

    let validRows = rows.filter(r => r.isbn.trim() !== '');
    if (validRows.length === 0) {
      setError('Please enter at least one ISBN or Product ID.');
      return;
    }

    // ── Duplicate detection ────────────────────────────────────────────────
    // Find ISBNs that appear more than once. Warn and de-duplicate (keep first).
    const isbnCount = new Map<string, number>();
    validRows.forEach(r => {
      const key = r.isbn.trim().toLowerCase();
      isbnCount.set(key, (isbnCount.get(key) ?? 0) + 1);
    });
    const duplicateIsbns = [...isbnCount.entries()]
      .filter(([, count]) => count > 1)
      .map(([isbn]) => isbn);

    const earlyWarnings: string[] = [];
    if (duplicateIsbns.length > 0) {
      earlyWarnings.push(
        `Duplicate ISBN${duplicateIsbns.length > 1 ? 's' : ''} removed (kept first occurrence): ${duplicateIsbns.join(', ')}`
      );
      const seen = new Set<string>();
      validRows = validRows.filter(r => {
        const key = r.isbn.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    setBusy(true);

    try {
      // Fire all preview requests in parallel
      const settled = await Promise.allSettled(
        validRows.map(row =>
          DamagedBooksService.previewBulkCreate({
            inputs: [{ type: detectInputType(row.isbn.trim()), value: row.isbn.trim() }],
            inventory: row.inventory,
          })
        )
      );

      const allItems: PreviewItem[] = [];
      const newWarnings: string[] = [...earlyWarnings];

      settled.forEach((outcome, i) => {
        const isbn = validRows[i].isbn.trim();

        if (outcome.status === 'rejected') {
          newWarnings.push(`"${isbn}": Request failed — ${outcome.reason}`);
          return;
        }

        const response = outcome.value;

        if (!response.ok) {
          const reasons = (response.errors || [])
            .map((e: any) => e.reason || e.message || 'Unknown error')
            .join(', ');
          newWarnings.push(`"${isbn}": ${reasons || 'Could not resolve.'}`);
          return;
        }

        // Filter zero-qty conditions — no point previewing or confirming them
        const nonZero = (response.preview || []).filter(
          (item: PreviewItem) => item.inventory_seed > 0
        );

        if (nonZero.length === 0) {
          newWarnings.push(`"${isbn}": All quantities are zero — skipped.`);
          return;
        }

        allItems.push(...nonZero);
      });

      if (allItems.length === 0) {
        setError(
          'No items to create. Check that ISBNs are correct and at least one quantity is greater than zero.'
        );
        if (newWarnings.length > 0) setWarnings(newWarnings);
        return;
      }

      if (newWarnings.length > 0) setWarnings(newWarnings);
      setPreview(allItems);
      setPhase('preview');
    } catch (err) {
      setError('Preview generation failed unexpectedly.');
      console.error('[Preview]', err);
    } finally {
      setBusy(false);
    }
  }

  // ── Phase 2: Confirm ─────────────────────────────────────────────────────
  //
  // Derives a flat confirm payload from the preview items — one entry per
  // condition per book. The backend groups these by canonical_product_id,
  // routes to create-or-update, and returns per-book results.

  function deriveConfirmPayload(previewRows: PreviewItem[]) {
    return {
      items: previewRows.map(item => ({
        canonical_product_id: item.canonical_product_id,
        canonical_handle: item.canonical_handle,
        condition_key: item.condition,
        inventory: item.inventory_seed,
      })),
    };
  }

  async function handleConfirm() {
    if (!preview) return;

    setError(null);
    setBusy(true);
    setPhase('confirming');

    try {
      const payload = deriveConfirmPayload(preview);
      const response = await DamagedBooksService.confirmBulkCreate(payload);

      // Always advance to 'result' — even on partial failure — so the user
      // sees the per-book breakdown rather than a generic error message.
      setResult(response);
      setPhase('result');
    } catch (err) {
      console.error('[Confirm]', err);
      setError('Creation failed unexpectedly.');
      setPhase('preview');
    } finally {
      setBusy(false);
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  function handleReset() {
    setRows([emptyRow()]);
    setPreview(null);
    setResult(null);
    setPhase('idle');
    setError(null);
    setWarnings([]);
  }

  // ── Derived values ───────────────────────────────────────────────────────

  const confirmPayload = preview ? deriveConfirmPayload(preview) : null;
  const confirmCount = confirmPayload?.items.length ?? 0;
  const bookGroups = preview ? groupByBook(preview) : [];
  const bookCount = bookGroups.length;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 w-full text-gray-900 dark:text-gray-100">

      {/* ── Header ── */}
      <div>
        <h2 className="text-xl font-semibold dark:text-white">Bulk Create Damaged Books</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Add each book individually and set quantities per damage condition.
        </p>
      </div>

      {/* ── Idle: book rows + controls ── */}
      {phase === 'idle' && (
        <div className="space-y-3">

          {rows.map((row, index) => (
            <BookRowInput
              key={row.id}
              row={row}
              index={index}
              canRemove={rows.length > 1}
              disabled={busy}
              onUpdate={updates => updateRow(row.id, updates)}
              onRemove={() => removeRow(row.id)}
              onScanRequest={() => openScanner(index)}
            />
          ))}

          {/* Add row / Generate Preview */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={addRow}
              disabled={busy}
              type="button"
              className="
                flex items-center gap-1.5 text-sm font-medium
                text-blue-600 dark:text-blue-400
                hover:text-blue-700 dark:hover:text-blue-300
                disabled:opacity-40 transition-colors
              "
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Another Book
            </button>

            <button
              onClick={handlePreview}
              disabled={busy}
              className="
                bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                text-white px-5 py-2 rounded-lg text-sm font-medium
                shadow-sm transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Generating…
                </span>
              ) : (
                'Generate Preview →'
              )}
            </button>
          </div>

          {/* Errors */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Warnings (partial failures) */}
          {warnings.length > 0 && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm space-y-1">
              <p className="font-semibold text-yellow-800 dark:text-yellow-300">
                {warnings.length} book{warnings.length !== 1 ? 's' : ''} could not be resolved:
              </p>
              {warnings.map((w, i) => (
                <p key={i} className="text-yellow-700 dark:text-yellow-500 text-xs pl-2 border-l-2 border-yellow-300 dark:border-yellow-700">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Scanner modal ── */}
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={closeScanner}
        onScan={handleScan}
      />

      {/* ── Preview / Confirm modal ── */}
      {phase === 'preview' && preview && (
        <ConfirmModal
          open={true}
          title={`Confirm — ${confirmCount} variant${confirmCount !== 1 ? 's' : ''} across ${bookCount} book${bookCount !== 1 ? 's' : ''}`}
          confirmLabel="Create Products"
          cancelLabel="Back"
          busy={busy}
          confirmDisabled={busy || confirmCount === 0}
          onConfirm={handleConfirm}
          onCancel={handleReset}
        >
          <div className="space-y-3">

            {/* Partial-failure notice */}
            {warnings.length > 0 && (
              <div className="px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg text-xs text-yellow-700 dark:text-yellow-500">
                {warnings.length} book{warnings.length !== 1 ? 's' : ''} could not be resolved and will be skipped.
              </div>
            )}

            {/* Preview table — grouped by book */}
            <div className="overflow-x-auto border rounded-lg dark:border-gray-700 max-h-[55vh]">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold border-b dark:border-gray-700">Condition</th>
                    <th className="px-3 py-2.5 text-center font-semibold border-b dark:border-gray-700">Qty</th>
                    <th className="px-3 py-2.5 text-right font-semibold border-b dark:border-gray-700">Price</th>
                    <th className="px-3 py-2.5 text-right font-semibold border-b dark:border-gray-700">Off</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900">
                  {bookGroups.map(([handle, items]) => (
                    <React.Fragment key={handle}>
                      {/* Book group header */}
                      <tr className="bg-gray-50 dark:bg-gray-800/70 border-b border-t dark:border-gray-700">
                        <td colSpan={4} className="px-3 py-2">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-bold text-gray-800 dark:text-gray-100">
                              {displayTitleFromHandle(handle)}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                              {handle}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {/* Condition rows */}
                      {items.map(item => {
                        const meta = CONDITION_META[item.condition];
                        return (
                          <tr
                            key={`${handle}-${item.condition}`}
                            className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                          >
                            <td className="px-3 py-2.5 pl-6">
                              <span className={`text-xs font-semibold ${meta.color}`}>
                                {meta.label} Damage
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                {item.inventory_seed}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                              ${item.price}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                                −{Math.round(item.discount_pct * 100)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* In-modal error */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        </ConfirmModal>
      )}

      {/* ── Confirming spinner overlay ── */}
      {phase === 'confirming' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <svg className="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              Creating damaged products…
            </p>
          </div>
        </div>
      )}

      {/* ── Result modal — per-book breakdown ── */}
      {phase === 'result' && result && (() => {
        const bookResults = result.results ?? [];
        const bookErrors  = result.errors  ?? [];
        const nCreated  = bookResults.filter(r => r.status === 'created').length;
        const nUpdated  = bookResults.filter(r => r.status === 'updated').length;
        const nFailed   = bookErrors.length;
        const allOk     = nFailed === 0;

        return (
          <ConfirmModal
            open={true}
            title={allOk ? 'Done' : 'Completed with errors'}
            confirmLabel="Start Over"
            cancelLabel=""
            busy={false}
            confirmDisabled={false}
            onConfirm={handleReset}
            onCancel={handleReset}
          >
            <div className="space-y-4">

              {/* ── Summary pills ── */}
              <div className="flex flex-wrap gap-2 justify-center pt-2">
                {nCreated > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    {nCreated} created
                  </span>
                )}
                {nUpdated > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {nUpdated} updated
                  </span>
                )}
                {nFailed > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {nFailed} failed
                  </span>
                )}
              </div>

              {/* ── Per-book result rows ── */}
              {(bookResults.length > 0 || bookErrors.length > 0) && (
                <div className="border dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 max-h-[50vh] overflow-y-auto">

                  {/* Successes */}
                  {bookResults.map((r, i) => {
                    const isCreated = r.status === 'created';
                    const isUpdated = r.status === 'updated';
                    const adminUrl  = shopifyAdminProductUrl(r.damaged_product_id);
                    const handle    = r.damaged_handle ?? '—';

                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900">
                        {/* Status icon */}
                        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                          isCreated ? 'bg-green-100 dark:bg-green-900/40' :
                          isUpdated ? 'bg-blue-100 dark:bg-blue-900/40' :
                          'bg-gray-100 dark:bg-gray-800'
                        }`}>
                          {isCreated && (
                            <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {isUpdated && (
                            <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                        </div>

                        {/* Handle + badge */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                              {handle}
                            </span>
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                              isCreated ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                              isUpdated ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                              'bg-gray-100 dark:bg-gray-700 text-gray-500'
                            }`}>
                              {r.status}
                            </span>
                          </div>
                          {r.messages && r.messages.length > 0 && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                              {r.messages[0]}
                            </p>
                          )}
                        </div>

                        {/* Shopify Admin link */}
                        {adminUrl && (
                          <a
                            href={adminUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            aria-label="Open in Shopify Admin"
                            title="Open in Shopify Admin"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                      </div>
                    );
                  })}

                  {/* Failures */}
                  {bookErrors.map((e, i) => (
                    <div key={`err-${i}`} className="flex items-start gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/10">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mt-0.5">
                        <svg className="w-3.5 h-3.5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-red-700 dark:text-red-400 truncate">
                          {e.canonical_handle}
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-500 mt-0.5 break-words">
                          {e.error}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Fallback for legacy/unexpected response shapes */}
              {bookResults.length === 0 && bookErrors.length === 0 && (
                <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-4">
                  {result.message ?? (result.ok ? 'Operation complete.' : result.error ?? 'Unknown result.')}
                </p>
              )}
            </div>
          </ConfirmModal>
        );
      })()}
    </div>
  );
}