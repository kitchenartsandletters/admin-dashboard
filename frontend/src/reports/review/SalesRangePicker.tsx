// src/reports/review/SalesRangePicker.tsx
// Date-range control for the Review report's sales window.
//
// The 7d / 30d / 12mo columns are fixed buckets that rarely line up with how
// buying actually works. The question is usually "what has moved since I last
// ordered from these people" — so the presets include "Since last PO", which
// anchors to the real ordered_at date of the most recent purchase order for the
// supplier currently filtered. With no supplier selected there's no PO to
// anchor to, so that preset is disabled rather than silently using an
// unrelated order's date.
import { useMemo, useState } from 'react';

export interface SalesRange { from: string; to: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

interface Props {
  value: SalesRange | null;
  onChange: (r: SalesRange | null) => void;
  /** ordered_at of the latest PO for the current supplier/imprint filter. */
  lastPoDate?: string | null;
  /** Label of whoever that PO belongs to, for the button tooltip. */
  lastPoLabel?: string | null;
  soldOnly: boolean;
  onSoldOnlyChange: (v: boolean) => void;
}

export default function SalesRangePicker({
  value, onChange, lastPoDate, lastPoLabel, soldOnly, onSoldOnlyChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => iso(new Date()), []);

  const apply = (from: string, to: string) => { onChange({ from, to }); setOpen(false); };

  const presets: { label: string; hint?: string; disabled?: boolean; run: () => void }[] = [
    { label: 'Last 30 days', run: () => apply(daysAgo(30), today) },
    { label: 'Last 60 days', run: () => apply(daysAgo(60), today) },
    { label: 'Last 90 days', run: () => apply(daysAgo(90), today) },
    {
      label: 'Since last PO',
      hint: lastPoDate
        ? `${lastPoLabel ?? 'This supplier'} — last ordered ${lastPoDate}`
        : 'Select a supplier or imprint first',
      disabled: !lastPoDate,
      run: () => lastPoDate && apply(lastPoDate, today),
    },
    {
      label: 'Year to date',
      run: () => apply(`${new Date().getFullYear()}-01-01`, today),
    },
  ];

  const summary = value
    ? `${value.from} → ${value.to}`
    : 'Sales date range';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`border px-3 py-2 rounded text-sm ${value ? 'border-blue-500 text-blue-700 dark:text-blue-300' : ''}`}
        title="Show units sold between two dates"
      >
        {summary} ▾
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded border bg-white dark:bg-gray-800 dark:border-gray-700 shadow-lg p-3 text-sm space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={p.run}
                disabled={p.disabled}
                title={p.hint}
                className="border rounded px-2 py-1 text-xs text-left hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="border-t pt-3 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <label className="flex-1">
                <span className="block text-[11px] uppercase opacity-60">From</span>
                <input
                  type="date"
                  max={value?.to || today}
                  value={value?.from ?? ''}
                  onChange={e => onChange({ from: e.target.value, to: value?.to || today })}
                  className="w-full px-2 py-1 border rounded dark:bg-gray-900"
                />
              </label>
              <label className="flex-1">
                <span className="block text-[11px] uppercase opacity-60">To</span>
                <input
                  type="date"
                  min={value?.from || undefined}
                  max={today}
                  value={value?.to ?? ''}
                  onChange={e => onChange({ from: value?.from || daysAgo(30), to: e.target.value })}
                  className="w-full px-2 py-1 border rounded dark:bg-gray-900"
                />
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={soldOnly} onChange={e => onSoldOnlyChange(e.target.checked)} />
            Only titles that sold in this range
          </label>

          <div className="flex justify-between pt-1">
            <button
              className="text-xs text-gray-500 hover:underline disabled:opacity-40"
              disabled={!value}
              onClick={() => { onChange(null); onSoldOnlyChange(false); setOpen(false); }}
            >
              Clear range
            </button>
            <button className="text-xs text-blue-600 hover:underline" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
