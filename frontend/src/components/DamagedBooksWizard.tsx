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
  canonical: {
    product_id: number;
    title: string;
    handle: string;
  };
  damaged_product: {
    handle: string;
    title: string;
    variants: {
      condition: 'light' | 'moderate' | 'heavy';
      price_modifier: number;
      inventory: number;
    }[];
  };
};

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

  /* -----------------------------
   * Helpers
   * ----------------------------- */

  function normalizeInputs(): WizardInput[] {
    return rawInput
      .split(/[\s,]+/)
      .map(v => v.trim())
      .filter(Boolean)
      .map(value => ({
        type: /^\d+$/.test(value) ? 'product_id' : 'isbn',
        value,
      }));
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

    try {
      /**
       * 🔒 CONTRACT:
       * POST /api/damaged/bulk-create/confirm
       *
       * Body:
       * {
       *   confirmed: true,
       *   items: [{
       *     canonical_product_id,
       *     inventory
       *   }]
       * }
       *
       * ⛔️ Stubbed for now
       */
      console.warn('Confirm request not yet wired', preview);

      setPreview(null);
      setRawInput('');
    } catch (err) {
      console.error(err);
      setError('Creation failed.');
    } finally {
      setBusy(false);
    }
  }

  /* -----------------------------
   * Render
   * ----------------------------- */

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">Bulk Create Damaged Books</h2>

      <textarea
        value={rawInput}
        onChange={e => setRawInput(e.target.value)}
        placeholder="Enter ISBNs or Product IDs (space or comma separated)"
        className="w-full min-h-[80px] border rounded p-2 text-sm"
      />

      <div className="grid grid-cols-3 gap-3">
        {(['light', 'moderate', 'heavy'] as const).map(level => (
          <div key={level}>
            <label className="block text-xs uppercase mb-1">
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
              className="w-full border rounded px-2 py-1"
            />
          </div>
        ))}
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="flex justify-end gap-2">
        <button
          onClick={handlePreview}
          disabled={busy}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Preview'}
        </button>
      </div>

      {/* -----------------------------
          Preview / Confirm Modal
         ----------------------------- */}
      {preview && (
        <ConfirmModal
          open={true}
          title={`Preview ${preview.length} Damaged Product${preview.length !== 1 ? 's' : ''}`}
          confirmLabel="Create Products"
          cancelLabel="Cancel"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setPreview(null)}
        >
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {preview.length === 0 && (
              <p className="text-sm text-gray-500">
                (Preview stub — backend not yet wired)
              </p>
            )}
            {preview.map(item => (
              <div
                key={item.canonical.product_id}
                className="border rounded p-2 bg-gray-50"
              >
                <p><strong>{item.canonical.title}</strong></p>
                <p className="text-xs text-gray-600">
                  Canonical ID: {item.canonical.product_id}
                </p>
                <ul className="mt-1 text-xs">
                  {item.damaged_product.variants.map(v => (
                    <li key={v.condition}>
                      {v.condition}: {v.inventory} @ {v.price_modifier}%
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ConfirmModal>
      )}
    </div>
  );
}