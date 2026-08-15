// src/supply-chain/returns/ReturnDraft.tsx
// A saved return's draft worksheet. Keep and Return are linked through the live
// on-hand (return = on_hand - keep), so Matt can think in either. Lines seed
// from the suggestion; he overrides, adds titles he's written off, or drops
// lines. Save persists quantity_requested; delete removes the draft. Picking +
// manifest (and inventory write-back) come in the next phase.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  fetchReturn, fetchReturnsWorksheet, saveReturn, deleteReturn,
  ReturnIndexRow, ReturnsWorksheetRow, ReturnReason,
} from '../../api/returnsApi';

interface EditLine {
  inventory_item_id: string;
  variant_id: string | null;
  isbn: string | null;
  title: string | null;
  list_price: number | null;
  on_hand: number;
  sales_12mo: number;
  return_qty: number;
}

const money = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const clampInt = (v: number, max: number) => Math.max(0, Math.min(Math.round(v || 0), max));

export default function ReturnDraft() {
  const { returnId = '' } = useParams();
  const navigate = useNavigate();

  const [header, setHeader] = useState<ReturnIndexRow | null>(null);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [worksheet, setWorksheet] = useState<ReturnsWorksheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  const isDraft = header?.status === 'draft';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await fetchReturn(returnId);
      const ws = await fetchReturnsWorksheet(detail.return.supplier_party_id, { limit: 1000 });
      const byId = new Map(ws.rows.map(r => [r.inventory_item_id, r]));
      setWorksheet(ws.rows);
      setHeader(detail.return);
      setLines(detail.lines.map(l => {
        const w = byId.get(l.inventory_item_id);
        return {
          inventory_item_id: l.inventory_item_id,
          variant_id: l.variant_id,
          isbn: l.isbn,
          title: l.title,
          list_price: l.list_price ?? w?.price ?? null,
          on_hand: w?.on_hand ?? 0,
          sales_12mo: w?.sales_12mo ?? 0,
          return_qty: l.quantity_requested ?? 0,
        };
      }));
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load return');
    } finally {
      setLoading(false);
    }
  }, [returnId]);

  useEffect(() => { load(); }, [load]);

  const patchHeader = (p: Partial<ReturnIndexRow>) => { setHeader(h => (h ? { ...h, ...p } : h)); setDirty(true); };

  const maxFor = (l: EditLine) => (l.on_hand > 0 ? l.on_hand : Math.max(l.return_qty, 0) || 9999);
  const setReturn = (id: string, v: number) => {
    setLines(ls => ls.map(l => l.inventory_item_id === id ? { ...l, return_qty: clampInt(v, maxFor(l)) } : l));
    setDirty(true);
  };
  const setKeep = (id: string, keep: number) => {
    setLines(ls => ls.map(l => {
      if (l.inventory_item_id !== id) return l;
      const k = clampInt(keep, l.on_hand > 0 ? l.on_hand : keep);
      return { ...l, return_qty: Math.max((l.on_hand || (k + l.return_qty)) - k, 0) };
    }));
    setDirty(true);
  };
  const removeLine = (id: string) => { setLines(ls => ls.filter(l => l.inventory_item_id !== id)); setDirty(true); };
  const addLine = (w: ReturnsWorksheetRow) => {
    setLines(ls => [...ls, {
      inventory_item_id: w.inventory_item_id, variant_id: w.variant_id, isbn: w.isbn, title: w.title,
      list_price: w.price, on_hand: w.on_hand, sales_12mo: w.sales_12mo, return_qty: w.suggested_return,
    }]);
    setAddSearch('');
    setDirty(true);
  };

  const totals = useMemo(() => {
    let units = 0, value = 0, lineCount = 0;
    for (const l of lines) if (l.return_qty > 0) { lineCount++; units += l.return_qty; value += l.return_qty * (l.list_price ?? 0); }
    return { units, value, lineCount };
  }, [lines]);

  const inDraft = useMemo(() => new Set(lines.map(l => l.inventory_item_id)), [lines]);
  const addable = useMemo(() => {
    const term = addSearch.trim().toLowerCase();
    if (!term) return [];
    return worksheet
      .filter(w => !inDraft.has(w.inventory_item_id))
      .filter(w => (w.title ?? '').toLowerCase().includes(term) || (w.isbn ?? '').toLowerCase().includes(term))
      .slice(0, 8);
  }, [addSearch, worksheet, inDraft]);

  const save = async () => {
    if (!header) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await saveReturn(returnId, {
        reason: (header.return_type as ReturnReason) || undefined,
        account_number: header.account_number,
        notes: header.notes,
        ship_to_name: header.ship_to_name,
        ship_to_address: header.ship_to_address,
        lines: lines.filter(l => l.return_qty > 0).map(l => ({
          inventory_item_id: l.inventory_item_id, variant_id: l.variant_id, isbn: l.isbn,
          title: l.title, list_price: l.list_price, quantity_requested: l.return_qty,
        })),
      });
      setHeader(updated.return);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this draft return? This cannot be undone.')) return;
    try { await deleteReturn(returnId); navigate('/supply-chain/returns'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete'); }
  };

  if (loading) return <div className="opacity-70 text-sm py-8 text-center">Loading…</div>;
  if (!header) return <div className="text-sm text-red-600 px-3 py-2">{error ?? 'Return not found'}</div>;

  return (
    <div className="space-y-4">
      <div className="text-sm"><Link to="/supply-chain/returns" className="text-blue-600 hover:underline">← All returns</Link></div>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{header.publisher_name ?? 'Return'}</h2>
          <span className="text-sm opacity-70">
            <span className="font-mono">{header.return_number}</span> · <span className="uppercase">{header.status}</span>
          </span>
        </div>
        <div className="flex gap-2 items-center">
          {dirty && <span className="text-xs text-amber-600">unsaved changes</span>}
          {isDraft && <button onClick={remove} className="border border-red-300 text-red-600 px-3 py-1 rounded text-sm hover:bg-red-50">Delete</button>}
          {isDraft && <button onClick={save} disabled={saving || !dirty} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded text-sm disabled:opacity-50">{saving ? 'Saving…' : 'Save draft'}</button>}
        </div>
      </div>

      {error && <div className="text-sm rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2">{error}</div>}
      {!isDraft && <div className="text-sm rounded border border-gray-300 bg-gray-50 dark:bg-gray-800 px-3 py-2">This return is <b>{header.status}</b> and is read-only here.</div>}

      {/* Meta / logistics */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase opacity-60">Reason</span>
          <select disabled={!isDraft} value={header.return_type ?? 'overstock'} onChange={e => patchHeader({ return_type: e.target.value })}
            className="px-2 py-1 border rounded dark:bg-gray-800 disabled:opacity-60">
            <option value="overstock">Overstock</option>
            <option value="overstock_author_event">Overstock – author event</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase opacity-60">Account #</span>
          <input disabled={!isDraft} value={header.account_number ?? ''} onChange={e => patchHeader({ account_number: e.target.value })}
            className="px-2 py-1 border rounded dark:bg-gray-800 disabled:opacity-60" placeholder="—" />
        </label>
        <div className="flex flex-col gap-1 lg:col-span-2">
          <span className="text-xs uppercase opacity-60">Return to</span>
          <div className="text-xs whitespace-pre-line opacity-80">{header.ship_to_name ? header.ship_to_name + '\n' : ''}{header.ship_to_address ?? 'No default return address set in Supply Chain.'}</div>
        </div>
      </div>

      {/* Add title */}
      {isDraft && (
        <div className="relative max-w-md">
          <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Add a title (search this publisher's stock)…"
            className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-800" />
          {addable.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border rounded shadow-lg max-h-64 overflow-auto">
              {addable.map(w => (
                <button key={w.inventory_item_id} onClick={() => addLine(w)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700">
                  {w.title} <span className="opacity-60">· {w.isbn} · {w.on_hand} on hand · {w.sales_12mo} sold 12mo</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-sm font-medium">Returning: {totals.lineCount} titles · {totals.units.toLocaleString()} units · {money(totals.value)}</div>

      <div className="overflow-auto border rounded-md">
        <table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700">Title</th>
              <th className="px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700">ISBN</th>
              <th className="px-3 py-2 text-right border-r border-gray-200 dark:border-gray-700">On hand</th>
              <th className="px-3 py-2 text-right border-r border-gray-200 dark:border-gray-700">12mo</th>
              <th className="px-3 py-2 text-right border-r border-gray-200 dark:border-gray-700">Keep</th>
              <th className="px-3 py-2 text-right border-r border-gray-200 dark:border-gray-700">Return</th>
              <th className="px-3 py-2 text-right border-r border-gray-200 dark:border-gray-700">Value</th>
              {isDraft && <th className="px-2 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td className="px-3 py-6 text-center opacity-70" colSpan={8}>No titles on this return yet.</td></tr>
            ) : lines.map(l => {
              const keep = Math.max((l.on_hand || l.return_qty) - l.return_qty, 0);
              return (
                <tr key={l.inventory_item_id} className="even:bg-gray-50 dark:even:bg-gray-700">
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{l.title ?? '—'}</td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{l.isbn ?? '—'}</td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{l.on_hand || '—'}</td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{l.sales_12mo}</td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">
                    <input type="number" min={0} max={l.on_hand || undefined} value={keep} disabled={!isDraft}
                      onChange={e => setKeep(l.inventory_item_id, Number(e.target.value))}
                      className="w-16 px-2 py-1 border rounded text-right dark:bg-gray-800 disabled:opacity-60" />
                  </td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">
                    <input type="number" min={0} max={maxFor(l)} value={l.return_qty} disabled={!isDraft}
                      onChange={e => setReturn(l.inventory_item_id, Number(e.target.value))}
                      className="w-16 px-2 py-1 border rounded text-right font-semibold dark:bg-gray-800 disabled:opacity-60" />
                    {isDraft && (
                      <div className="mt-1 flex gap-1 justify-end">
                        <button className="text-[11px] px-1 border rounded" title="Return all on hand" onClick={() => setReturn(l.inventory_item_id, l.on_hand)}>all</button>
                        <button className="text-[11px] px-1 border rounded" title="Keep all — return none" onClick={() => setReturn(l.inventory_item_id, 0)}>keep</button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{money(l.return_qty * (l.list_price ?? 0))}</td>
                  {isDraft && <td className="px-2 py-2 text-center"><button onClick={() => removeLine(l.inventory_item_id)} title="Remove" className="text-gray-400 hover:text-red-500">✕</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
