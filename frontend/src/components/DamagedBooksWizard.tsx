import React, { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import DamagedBooksService from './DamagedBooksService';
import ScannerModal from './damaged/ScannerModal';

/**
 * Input types supported by the wizard
 */
type InputType = 'isbn' | 'product_id';

type WizardInput = {
  type: InputType;
  value: string;
};

type InventorySeed = {
  light: number;
  moderate: number;
  heavy: number;
};

/**
 * Preview shape — mirrors bulk-create-wizard.md
 */
type PreviewItem = {
  canonical_product_id: string;
  canonical_handle: string;
  condition: 'light' | 'moderate' | 'heavy';
  title: string;
  price: string;
  discount_pct: number;
  inventory_seed: number;
  sku: string;
  barcode: string;
};

type ConfirmResponse = {
  ok: boolean;
  message?: string;
  error?: string;
};

type WizardPhase = 'idle' | 'preview' | 'confirming' | 'result';

export default function DamagedBooksWizard() {
  /* -----------------------------
   * Core wizard state
   * ----------------------------- */

  const [rawInput, setRawInput] = useState('');
  const [inputs, setInputs] = useState<WizardInput[]>([]);
  const [inventory, setInventory] = useState<InventorySeed>({
    light: 0,
    moderate: 0,
    heavy: 0,
  });

  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<WizardPhase>('idle');
  const [result, setResult] = useState<ConfirmResponse | null>(null);

  // Scanner state
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  /* -----------------------------
   * Helpers
   * ----------------------------- */

  function normalizeInputs(): WizardInput[] {
    return rawInput
      .split(/[\s,]+/)
      .map(v => v.trim())
      .filter(Boolean)
      .map(value => {
        if (/^\d{10}(\d{3})?$/.test(value)) {
          return { type: 'isbn', value };
        }
        return { type: 'product_id', value };
      });
  }

  // Handler to append scanned values
  const handleScan = (isbn: string) => {
  
  // 1. Haptic Feedback (Vibration)
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(100); 
    }

    // 2. Audio Feedback (Beep)
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/766/766-preview.mp3'); 
    audio.play().catch(e => console.log("Audio play blocked by browser"));

    // 3. Update State
    setRawInput(prev => {
      const clean = prev.trim();
      const separator = clean.endsWith(',') || clean === '' ? '' : ', ';
      return `${clean}${separator}${isbn}`;
    });
  };

  /* -----------------------------
   * Flat Mapper for Confirm Payload
   * ----------------------------- */
  function deriveConfirmPayload(previewRows: PreviewItem[]) {
    return {
      items: previewRows.map(item => ({
        canonical_product_id: item.canonical_product_id,
        canonical_handle: item.canonical_handle,
        condition_key: item.condition,
        inventory: item.inventory_seed ?? 0,
      })),
    };
  }

  /* -----------------------------
   * Phase 1: Preview
   * ----------------------------- */

  async function handlePreview() {
    setError(null);

    const normalized = normalizeInputs();
    if (normalized.length === 0) {
      setError('Please enter at least one ISBN or Product ID.');
      return;
    }

    setInputs(normalized);
    setBusy(true);

    try {
      const response = await DamagedBooksService.previewBulkCreate({
        inputs: normalized,
        inventory,
      });

      if (!response.ok) {
        setError(
          response.errors
            .map(e => `${e.input}: ${e.reason}`)
            .join(', ')
        );
        return;
      }

      setPreview(response.preview);
      setPhase('preview');
    } catch (err) {
      console.error(err);
      setError('Failed to generate preview.');
    } finally {
      setBusy(false);
    }
  }

  /* -----------------------------
   * Phase 2: Confirm + Create
   * ----------------------------- */

  async function handleConfirm() {
    if (!preview) return;

    setBusy(true);
    setError(null);
    setPhase('confirming');

    try {
      const payload = deriveConfirmPayload(preview);
      console.log('[CONFIRM PAYLOAD]', JSON.stringify(payload, null, 2));

      const response = await DamagedBooksService.confirmBulkCreate(payload);

      if (!response.ok) {
        setError(response.error || 'Creation failed.');
        setPhase('preview');
        return;
      }

      setResult(response);
      setPhase('result');
      
      // Zero out inventory only on success
      setInventory({ light: 0, moderate: 0, heavy: 0 });

    } catch (err) {
      console.error('[CONFIRM] exception thrown', err);
      setError('Creation failed.');
      setPhase('preview');
    } finally {
      setBusy(false);
    }
  }

  /* -----------------------------
   * Render
   * ----------------------------- */

  const confirmItemsCount = preview ? deriveConfirmPayload(preview).items.length : 0;
  const confirmDisabled = busy || confirmItemsCount === 0;

  return (
    <div className="space-y-4 w-full text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold dark:text-white">Bulk Create Damaged Books</h2>
        <span className="text-sm opacity-70 dark:text-gray-400">Step 1: Enter details</span>
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-gray-900 p-4 border rounded-md dark:border-gray-700 shadow-sm space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
            Source Products
          </label>
          {/* 4. Add Scan Button */}
          <button 
            onClick={() => setIsScannerOpen(true)}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
            type="button"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Scan via Camera
          </button>
          <textarea
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            placeholder="Enter ISBNs or Product IDs (space or comma separated)"
            className="w-full min-h-[100px] px-3 py-2 border rounded text-sm 
              dark:bg-gray-800 dark:text-white dark:border-gray-700 
              focus:ring-2 focus:ring-blue-500 outline-none shadow-sm placeholder-gray-400"
            disabled={phase !== 'idle'}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['light', 'moderate', 'heavy'] as const).map(level => (
            <div key={level}>
              <label className="block text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
                {level} Quantity
              </label>
              <input
                type="number"
                min={0}
                value={inventory[level]}
                onChange={e =>
                  setInventory({
                    ...inventory,
                    [level]: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border rounded text-sm 
                  dark:bg-gray-800 dark:text-white dark:border-gray-700 
                  focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                disabled={phase !== 'idle'}
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={handlePreview}
            disabled={busy || phase !== 'idle'}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
          >
            {busy && phase === 'idle' ? 'Generating Preview…' : 'Generate Preview'}
          </button>
        </div>
      </div>

      {/* Scanner Modal */}
      <ScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={handleScan} 
      />

      {/* -----------------------------
          Preview / Confirm Modal
         ----------------------------- */}
      {phase === 'preview' && preview && (
        <ConfirmModal
          open={true}
          title={`Confirm Creation (${preview.length} items)`}
          confirmLabel="Create Products"
          cancelLabel="Cancel"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => {
            setPreview(null);
            setInputs([]);
            setPhase('idle');
            setError(null);
          }}
          confirmDisabled={confirmDisabled}
        >
          {/* Table Container matching DamagedBooksTable style */}
          <div className="overflow-x-auto border rounded-md dark:border-gray-700 max-h-[60vh]">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 text-left font-medium border-b dark:border-gray-700">Title</th>
                  <th className="px-3 py-3 text-left font-medium border-b dark:border-gray-700">Condition</th>
                  <th className="px-3 py-3 text-center font-medium border-b dark:border-gray-700">Qty</th>
                  <th className="px-3 py-3 text-right font-medium border-b dark:border-gray-700">Discount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                {preview.map((item, idx) => (
                  <tr 
                    key={`${item.canonical_handle}-${item.condition}-${idx}`} 
                    className="even:bg-gray-50 dark:even:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">
                      {item.title}
                      <div className="text-xs text-gray-500 font-normal mt-0.5">{item.canonical_handle}</div>
                    </td>
                    <td className="px-3 py-3 capitalize text-gray-600 dark:text-gray-300">
                      {item.condition}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-900 dark:text-white">
                      {item.inventory_seed}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-300">
                      -{item.discount_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ConfirmModal>
      )}

      {/* -----------------------------
          Success Modal
         ----------------------------- */}
      {phase === 'result' && result && (
        <ConfirmModal
          open={true}
          title="Success"
          confirmLabel="Close"
          cancelLabel=""
          busy={false}
          confirmDisabled={false}
          onConfirm={() => {
            setPreview(null);
            setInputs([]);
            setRawInput('');
            setResult(null);
            setPhase('idle');
            setError(null);
          }}
          onCancel={() => {
            setPreview(null);
            setInputs([]);
            setRawInput('');
            setResult(null);
            setPhase('idle');
            setError(null);
          }}
        >
          <div className="text-center py-6">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 mb-4">
              <svg className="h-6 w-6 text-green-600 dark:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
              Processing Complete
            </h3>
            <div className="mt-2 px-7 py-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {result.message || 'Damaged books have been successfully queued for creation.'}
              </p>
            </div>
          </div>
        </ConfirmModal>
      )}
    </div>
  );
}