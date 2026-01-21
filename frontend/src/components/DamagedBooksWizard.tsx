import React, { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import DamagedBooksService from './DamagedBooksService';

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
 * Keep this aligned with DBS response
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

  /* -----------------------------
   * Helpers
   * ----------------------------- */

  function normalizeInputs(): WizardInput[] {
    return rawInput
        .split(/[\s,]+/)
        .map(v => v.trim())
        .filter(Boolean)
        .map(value => {
        // ISBNs are typically 10 or 13 digits
        if (/^\d{10}(\d{3})?$/.test(value)) {
            return { type: 'isbn', value };
        }

        // Everything else is treated as an explicit product_id
        return { type: 'product_id', value };
        });
    }

  /* -----------------------------
   * Flat Mapper for Confirm Payload
   * ----------------------------- */
  function deriveConfirmPayload(preview: PreviewItem[]) {
    return {
      items: preview.map(item => ({
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

      console.log(
        '[CONFIRM PAYLOAD]',
        JSON.stringify(payload, null, 2)
      );

      const response = await DamagedBooksService.confirmBulkCreate(payload);

      console.log('[CONFIRM] raw response →', response);
      console.log('[CONFIRM] response.ok →', response?.ok);

      if (!response.ok) {
        setError(response.error || 'Creation failed.');
        setPhase('preview');
        return;
      }

      console.log('[CONFIRM] success — setting result + phase=result');
      setResult(response);
      setPhase('result');
      setInventory({
        light: 0,
        moderate: 0,
        heavy: 0,
      });

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

  // Group preview items by canonical_handle for presentational grouping
  const groupedPreview = preview
    ? preview.reduce<Record<string, PreviewItem[]>>((acc, item) => {
        if (!acc[item.canonical_handle]) {
          acc[item.canonical_handle] = [];
        }
        acc[item.canonical_handle].push(item);
        return acc;
      }, {})
    : {};

  return (
    <div className="p-6 space-y-4 text-gray-900 dark:text-gray-100">
      <h2 className="text-xl font-semibold">Bulk Create Damaged Books</h2>

      <textarea
        value={rawInput}
        onChange={e => setRawInput(e.target.value)}
        placeholder="Enter ISBNs or Product IDs (space or comma separated)"
        className="w-full min-h-[80px] border rounded p-2 text-sm
          bg-white border-gray-300 placeholder-gray-400
          dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
        disabled={phase !== 'idle'}
      />

      <div className="grid grid-cols-3 gap-3">
        {(['light', 'moderate', 'heavy'] as const).map(level => (
          <div key={level}>
            <label className="block text-xs uppercase mb-1 opacity-80">
              {level} inventory
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
              className="w-full border rounded px-2 py-1
                bg-white border-gray-300
                dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              disabled={phase !== 'idle'}
            />
          </div>
        ))}
      </div>

      {error && <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>}

      <div className="flex justify-end gap-2">
        <button
          onClick={handlePreview}
          disabled={busy || phase !== 'idle'}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {busy && phase === 'idle' ? 'Working…' : 'Preview'}
        </button>
      </div>

      {/* -----------------------------
          Preview / Confirm Modal
         ----------------------------- */}
      {phase === 'preview' && preview && (
        <ConfirmModal
          open={true}
          title={`Preview ${preview.length} Damaged Product${preview.length !== 1 ? 's' : ''}`}
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
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
             {/* -----------------------------
            {preview.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                (Preview stub — backend not yet wired)
              </p>
            )}
              ----------------------------- */}
            {Object.entries(groupedPreview).map(([canonical_handle, items]) => (
              <div key={canonical_handle} className="mb-4">
                <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">{canonical_handle}</h3>
                {items.map(item => (
                  <div
                    key={item.condition}
                    className="border rounded p-2 bg-gray-50 border-gray-200 
                      dark:bg-gray-800 dark:border-gray-700 mb-2"
                  >
                    <p className="text-gray-900 dark:text-gray-100">
                      <strong>{item.title}</strong>
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Condition: {item.condition}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Inventory Seed: {item.inventory_seed}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Discount: {item.discount_pct}%
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ConfirmModal>
      )}

      {phase === 'result' && result && (
        <ConfirmModal
          open={true}
          title="Success"
          confirmLabel=""
          cancelLabel=""
          busy={false}
          confirmDisabled={true}
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
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            <p className="text-green-600 dark:text-green-400 text-sm">
              {result.message || 'Damaged books have been successfully created.'}
            </p>
          </div>
        </ConfirmModal>
      )}
    </div>
  );
}