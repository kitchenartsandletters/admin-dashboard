// src/reports/returns/ReturnsWorksheet.tsx
// One publisher's returns worksheet. The suggested return (on_hand - 12mo sales)
// is the editable DEFAULT per line; staff override every line by judgment. Live
// totals reflect the current selection. CSV export produces the working return
// list. (Persisting the return -> packing list is the next, write-side step.)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchReturnsWorksheet,
  ReturnsWorksheetRow,
  ReturnsPublisherTile,
} from '../../api/returnsApi';

type SortKey =
  | 'title' | 'isbn' | 'author' | 'on_hand' | 'sales_12mo' | 'sales_24mo'
  | 'last_sold_at' | 'months_since_last_sold' | 'keep_qty' | 'suggested_return'
  | 'suggested_return_value' | 'price';

const money = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const num = (v: number | null | undefined) => (v == null ? '—' : String(v));
const day = (v: string | null) => (v ? v.slice(0, 10) : '—');
const clampInt = (v: number, max: number) => Math.max(0, Math.min(Math.round(v || 0), max));

export default function ReturnsWorksheet() {
  const { publisherId = '' } = useParams();

  const [rows, setRows] = useState<ReturnsWorksheetRow[]>([]);
  const [publisher, setPublisher] = useState<ReturnsPublisherTile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-line return quantity overrides, keyed by inventory_item_id.
  const [qty, setQty] = useState<Record<string, number>>({});

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [excessOnly, setExcessOnly] = useState(true);
  const [sort, setSort] = useState<SortKey>('suggested_return');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!publisherId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchReturnsWorksheet(publisherId, {
        sort, order, excessOnly, search: debouncedSearch || undefined, limit: 1000,
      });
      setRows(resp.rows);
      setPublisher(resp.publisher);
      // Seed overrides for any rows not yet touched, defaulting to the suggestion.
      setQty(prev => {
        const next = { ...prev };
        for (const r of resp.rows) {
          if (!(r.inventory_item_id in next)) next[r.inventory_item_id] = r.suggested_return;
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load worksheet');
    } finally {
      setLoading(false);
    }
  }, [publisherId, sort, order, excessOnly, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const effectiveQty = (r: ReturnsWorksheetRow) =>
    r.inventory_item_id in qty ? qty[r.inventory_item_id] : r.suggested_return;

  const setLine = (r: ReturnsWorksheetRow, v: number) =>
    setQty(prev => ({ ...prev, [r.inventory_item_id]: clampInt(v, r.on_hand) }));

  const onSort = (key: SortKey) => {
    if (sort === key) setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder('desc'); }
  };
  const arrow = (key: SortKey) => (sort === key ? (order === 'asc' ? ' ▲' : ' ▼') : '');

  // Live selection totals across the loaded rows.
  const totals = useMemo(() => {
    let units = 0, value = 0, lines = 0;
    for (const r of rows) {
      const q = effectiveQty(r);
      if (q > 0) { lines++; units += q; value += q * (r.price ?? 0); }
    }
    return { units, value, lines };
  }, [rows, qty]);

  const resetAllToSuggested = () =>
    setQty(prev => {
      const next = { ...prev };
      for (const r of rows) next[r.inventory_item_id] = r.suggested_return;
      return next;
    });

  const exportCsv = () => {
    const header = ['ISBN', 'Title', 'Author', 'On hand', '12mo sales', 'Return qty', 'Unit price', 'Return value'];
    const esc = (s: unknown) => {
      const str = s == null ? '' : String(s);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = rows
      .map(r => ({ r, q: effectiveQty(r) }))
      .filter(x => x.q > 0)
      .map(({ r, q }) => [r.isbn, r.title, r.author, r.on_hand, r.sales_12mo, q, r.price ?? '', (q * (r.price ?? 0)).toFixed(2)].map(esc).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (publisher?.publisher_name ?? 'publisher').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.href = url;
    a.download = `kal-return-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const th = (key: SortKey, label: string, right?: boolean) => (
    <th
      className={`px-3 py-2 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap cursor-pointer ${right ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(key)}
    >
      {label}{arrow(key)}
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="text-sm">
        <Link to="/reports/returns" className="text-blue-600 hover:underline">← All publishers</Link>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{publisher?.publisher_name ?? 'Returns worksheet'}</h2>
          <span className="text-sm opacity-70">
            {publisher ? `${publisher.titles_with_excess} of ${publisher.titles} titles with excess · suggested ${publisher.return_units?.toLocaleString()} units / ${money(publisher.return_value_list)}` : ''}
          </span>
        </div>
        <div className="flex gap-2">
          <button className="border px-3 py-1 rounded text-sm" onClick={resetAllToSuggested}>Reset to suggested</button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50" disabled={totals.lines === 0} onClick={exportCsv}>Export return list</button>
        </div>
      </div>

      {/* Return logistics header */}
      {(publisher?.default_return_address || publisher?.publisher_notes) && (
        <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 text-sm grid sm:grid-cols-2 gap-3">
          <div>
            <div className="text-xs uppercase opacity-60 mb-1">Return to</div>
            {publisher?.default_return_address ? (
              <div className="whitespace-pre-line">{publisher.default_return_recipient ? publisher.default_return_recipient + '\n' : ''}{publisher.default_return_address}</div>
            ) : <div className="opacity-60">No default return address set in Supply Chain.</div>}
          </div>
          {publisher?.publisher_notes && (
            <div>
              <div className="text-xs uppercase opacity-60 mb-1">Notes (RA / window)</div>
              <div className="whitespace-pre-line">{publisher.publisher_notes}</div>
            </div>
          )}
        </div>
      )}

      <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 text-amber-800 dark:text-amber-300 px-3 py-2 text-xs">
        Suggested quantities are a starting point — adjust each line. This produces a working return list (Export);
        saving it as a formal return with a packing list is the next step.
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search title / ISBN / author…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white"
        />
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={excessOnly} onChange={e => setExcessOnly(e.target.checked)} />
          Excess only
        </label>
        <div className="ml-auto text-sm font-medium">
          Selected: {totals.lines} titles · {totals.units.toLocaleString()} units · {money(totals.value)}
        </div>
      </div>

      {error && (
        <div className="text-sm rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2">{error}</div>
      )}

      <div className="overflow-auto border rounded-md">
        <table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {th('title', 'Title')}
              {th('isbn', 'ISBN')}
              {th('on_hand', 'On hand', true)}
              {th('sales_12mo', '12mo', true)}
              {th('keep_qty', 'Keep', true)}
              {th('suggested_return', 'Suggested', true)}
              <th className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right whitespace-nowrap">Return qty</th>
              {th('suggested_return_value', 'Value', true)}
              {th('months_since_last_sold', 'Last sold')}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-6 text-center opacity-70" colSpan={9}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-3 py-6 text-center opacity-70" colSpan={9}>No titles.</td></tr>
            ) : rows.map(r => {
              const q = effectiveQty(r);
              return (
                <tr key={r.inventory_item_id} className="even:bg-gray-50 dark:even:bg-gray-700 align-top">
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">
                    {r.title ?? '—'}
                    {r.never_sold_ever && <span className="ml-1 text-[10px] uppercase text-amber-600 dark:text-amber-400">never sold</span>}
                  </td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">{r.isbn ?? '—'}</td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{num(r.on_hand)}</td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{r.sales_12mo}</td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{r.keep_qty}</td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right opacity-70">{r.suggested_return}</td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right whitespace-nowrap">
                    <input
                      type="number"
                      min={0}
                      max={r.on_hand}
                      value={q}
                      onChange={e => setLine(r, Number(e.target.value))}
                      className={`w-16 px-2 py-1 border rounded text-right dark:bg-gray-800 dark:text-white ${q !== r.suggested_return ? 'border-blue-400 font-semibold' : ''}`}
                    />
                    <div className="mt-1 flex gap-1 justify-end">
                      <button className="text-[11px] px-1 border rounded" title="Return all on hand" onClick={() => setLine(r, r.on_hand)}>all</button>
                      <button className="text-[11px] px-1 border rounded" title="Keep — return none" onClick={() => setLine(r, 0)}>keep</button>
                    </div>
                  </td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-right">{money(q * (r.price ?? 0))}</td>
                  <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    {r.never_sold_ever ? '—' : (r.months_since_last_sold != null ? `${r.months_since_last_sold} mo` : day(r.last_sold_at))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
