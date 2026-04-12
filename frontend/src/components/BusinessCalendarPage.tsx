import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

type DateString = string; // 'YYYY-MM-DD'
type DayKind = 'open' | 'closed' | 'holiday' | 'special-open';
type OverrideType = 'holiday_closure' | 'special_open_sunday';

interface CalendarOverride {
  id:            string;
  date:          DateString;
  override_type: OverrideType;
  label:         string | null;
}

interface DayInfo {
  dStr:    DateString;
  kind:    DayKind;
  isToday: boolean;
}

// ─── Hardcoded baseline (mirrors business_calendar.py) ───────────────────────
// DB overrides always win when a row exists for a given date.

const BASELINE_SPECIAL_OPEN_SUNDAYS: Record<number, Set<DateString>> = {
  2025: new Set(['2025-12-07', '2025-12-14', '2025-12-21']),
  2026: new Set(['2026-12-06', '2026-12-13', '2026-12-20']),
};

const BASELINE_HOLIDAY_CLOSURES: Record<number, Set<DateString>> = {
  2025: new Set(['2025-05-24','2025-05-26','2025-07-04','2025-09-01','2025-11-28','2025-12-25','2025-12-26']),
  2026: new Set(['2026-01-01','2026-05-23','2026-05-24','2026-07-04','2026-09-07','2026-11-26','2026-12-25','2026-12-26']),
};

const BASELINE_HOLIDAY_NAMES: Record<DateString, string> = {
  '2025-05-24':'Sat before Memorial Day','2025-05-26':'Memorial Day',
  '2025-07-04':'Independence Day','2025-09-01':'Labor Day',
  '2025-11-28':'Thanksgiving','2025-12-25':'Christmas','2025-12-26':'Boxing Day',
  '2026-01-01':"New Year's Day",'2026-05-23':'Sat before Memorial Day',
  '2026-05-24':'Memorial Day (Sun)','2026-07-04':'Independence Day',
  '2026-09-07':'Labor Day','2026-11-26':'Thanksgiving',
  '2026-12-25':'Christmas','2026-12-26':'Boxing Day',
};

// ─── Calendar logic ───────────────────────────────────────────────────────────

function toISO(d: Date): DateString {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function parseLocal(s: DateString): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function resolveCalendar(year: number, overrides: CalendarOverride[]) {
  // Start from baseline
  const holidays  = new Set(BASELINE_HOLIDAY_CLOSURES[year] ?? []);
  const specials  = new Set(BASELINE_SPECIAL_OPEN_SUNDAYS[year] ?? []);
  const labels: Record<DateString, string> = { ...BASELINE_HOLIDAY_NAMES };

  // DB overrides always win
  for (const ov of overrides) {
    const d = new Date(ov.date + 'T12:00:00');
    if (d.getFullYear() !== year) continue;
    if (ov.override_type === 'holiday_closure') {
      holidays.add(ov.date);
      specials.delete(ov.date);
      if (ov.label) labels[ov.date] = ov.label;
    } else {
      specials.add(ov.date);
      holidays.delete(ov.date);
    }
  }

  return { holidays, specials, labels };
}

function isBusinessDay(dStr: DateString, holidays: Set<DateString>, specials: Set<DateString>): boolean {
  if (holidays.has(dStr)) return false;
  const dow = parseLocal(dStr).getDay();
  if (dow === 0) return specials.has(dStr);
  return dow >= 1 && dow <= 6;
}

function findLastOpen(dStr: DateString, holidays: Set<DateString>, specials: Set<DateString>): DateString {
  const d = parseLocal(dStr);
  d.setDate(d.getDate() - 1);
  while (!isBusinessDay(toISO(d), holidays, specials)) d.setDate(d.getDate() - 1);
  return toISO(d);
}

function getReportingWindow(dStr: DateString, holidays: Set<DateString>, specials: Set<DateString>) {
  const d = parseLocal(dStr);
  const yesterday = new Date(d); yesterday.setDate(d.getDate() - 1);
  return { start: findLastOpen(dStr, holidays, specials), end: toISO(yesterday) };
}

function dayKind(
  dStr: DateString,
  holidays: Set<DateString>,
  specials: Set<DateString>
): DayKind {
  if (holidays.has(dStr)) return 'holiday';
  const dow = parseLocal(dStr).getDay();
  if (dow === 0) return specials.has(dStr) ? 'special-open' : 'closed';
  if (dow >= 1 && dow <= 6) return 'open';
  return 'closed';
}

function fmtDisplay(dStr: DateString): string {
  return parseLocal(dStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Month grid ───────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const DOW_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

const KIND_CLASSES: Record<DayKind, string> = {
  'open':         'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
  'closed':       'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
  'holiday':      'bg-orange-50 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  'special-open': 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
};

function MonthGrid({
  year, month, today, holidays, specials, selected, onDayClick,
}: {
  year: number; month: number; today: DateString;
  holidays: Set<DateString>; specials: Set<DateString>;
  selected: DateString | null;
  onDayClick: (info: DayInfo) => void;
}) {
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center mb-2">
        {MONTH_NAMES[month]}
      </p>
      <div className="grid grid-cols-7 gap-px mb-1">
        {DOW_LABELS.map(l => (
          <div key={l} className="text-center text-[10px] text-gray-400 dark:text-gray-500">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day  = i + 1;
          const dStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const kind = dayKind(dStr, holidays, specials);
          const isToday    = dStr === today;
          const isSelected = dStr === selected;
          return (
            <button
              key={dStr}
              onClick={() => onDayClick({ dStr, kind, isToday })}
              className={`
                text-center text-[11px] rounded py-0.5 leading-5 transition-all
                ${KIND_CLASSES[kind]}
                ${isToday    ? 'ring-2 ring-violet-500 ring-offset-1 font-semibold' : ''}
                ${isSelected ? 'ring-2 ring-gray-900 dark:ring-gray-100 ring-offset-1' : ''}
                hover:brightness-90 dark:hover:brightness-125
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Edit panel ───────────────────────────────────────────────────────────────

function EditPanel({
  dayInfo, holidays, specials, labels, overrides, isAdmin,
  apiBase, token,
  onOverrideAdded, onOverrideRemoved,
}: {
  dayInfo: DayInfo;
  holidays: Set<DateString>; specials: Set<DateString>;
  labels: Record<DateString, string>;
  overrides: CalendarOverride[];
  isAdmin: boolean;
  apiBase: string; token: string;
  onOverrideAdded:   (ov: CalendarOverride) => void;
  onOverrideRemoved: (date: DateString, type: OverrideType) => void;
}) {
  const { dStr, kind } = dayInfo;
  const d       = parseLocal(dStr);
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
  const isSunday = d.getDay() === 0;

  const [label, setLabel]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);

  const existingOverride = overrides.find(
    ov => ov.date === dStr && (
      ov.override_type === 'holiday_closure' ||
      ov.override_type === 'special_open_sunday'
    )
  ) ?? null;

  const { start, end } = getReportingWindow(
    (() => { const next = new Date(d); next.setDate(d.getDate() + 1); return toISO(next); })(),
    holidays, specials
  );

  const kindBadge: Record<DayKind, string> = {
    'open':         'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    'closed':       'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    'holiday':      'bg-orange-50 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
    'special-open': 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  };
  const kindLabel: Record<DayKind, string> = {
    'open': 'Open', 'closed': 'Closed',
    'holiday': 'Holiday closure', 'special-open': 'Special open Sunday',
  };

  async function applyOverride(type: OverrideType, lbl: string | null) {
    setSaving(true); setMsg(null);
    // Optimistic update handled by parent via onOverrideAdded
    try {
      const res = await fetch(`${apiBase}/api/reports/calendar-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: dStr, override_type: type, label: lbl || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved: CalendarOverride = await res.json();
      onOverrideAdded(saved);
      setMsg('Saved.');
    } catch (e: any) {
      setMsg(e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function removeOverride(type: OverrideType) {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(
        `${apiBase}/api/reports/calendar-overrides?date=${dStr}&override_type=${type}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(await res.text());
      onOverrideRemoved(dStr, type);
      setMsg('Removed.');
    } catch (e: any) {
      setMsg(e?.message || 'Failed to remove.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {dayName}, {fmtDisplay(dStr)}
        </p>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${kindBadge[kind]}`}>
          {labels[dStr] ?? kindLabel[kind]}
        </span>
      </div>

      {/* Reporting window preview */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p className="text-gray-400 dark:text-gray-500">
          {isBusinessDay(dStr, holidays, specials)
            ? 'If today were this date, the next report would cover:'
            : 'Store closed — next report after this day would cover:'}
        </p>
        <span className="inline-block px-3 py-1 rounded border border-gray-200 dark:border-gray-600
          bg-white dark:bg-gray-900 text-xs text-gray-800 dark:text-gray-200 font-medium">
          {start === end ? fmtDisplay(start) : `${fmtDisplay(start)} → ${fmtDisplay(end)}`}
        </span>
      </div>

      {/* Admin edit controls */}
      {isAdmin && (
        <div className="pt-1 space-y-2 border-t border-gray-200 dark:border-gray-700">
          {isSunday ? (
            // Sunday: toggle special open
            kind === 'special-open' ? (
              <button
                disabled={saving}
                onClick={() => removeOverride('special_open_sunday')}
                className="text-xs px-3 py-1.5 rounded border border-red-200 dark:border-red-800
                  text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30
                  disabled:opacity-40"
              >
                Remove special open Sunday
              </button>
            ) : (
              <button
                disabled={saving}
                onClick={() => applyOverride('special_open_sunday', null)}
                className="text-xs px-3 py-1.5 rounded border border-blue-200 dark:border-blue-800
                  text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30
                  disabled:opacity-40"
              >
                Mark as special open Sunday
              </button>
            )
          ) : kind === 'holiday' ? (
            // Holiday: remove closure
            <button
              disabled={saving}
              onClick={() => removeOverride('holiday_closure')}
              className="text-xs px-3 py-1.5 rounded border border-emerald-200 dark:border-emerald-800
                text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30
                disabled:opacity-40"
            >
              Remove closure — restore as open
            </button>
          ) : kind === 'open' ? (
            // Open day: mark as closure with optional label
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Closure label (optional) — e.g. Clean Out Sale"
                value={label}
                onChange={e => setLabel(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-xs
                  bg-white text-gray-900 border-gray-300
                  dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
                  focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              <button
                disabled={saving}
                onClick={() => applyOverride('holiday_closure', label)}
                className="text-xs px-3 py-1.5 rounded border border-orange-200 dark:border-orange-800
                  text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30
                  disabled:opacity-40"
              >
                Mark as closure
              </button>
            </div>
          ) : null}

          {msg && <p className="text-xs text-gray-500 dark:text-gray-400">{msg}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TODAY        = toISO(new Date());
const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028];

export default function BusinessCalendarPage() {
  const { role } = useAuth();
  const isAdmin  = role === 'admin' || role === 'editor';

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  const token   = import.meta.env.VITE_ADMIN_TOKEN;

  const [year, setYear]           = useState(CURRENT_YEAR);
  const [selected, setSelected]   = useState<DayInfo | null>(null);
  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
  const [loading, setLoading]     = useState(false);

  const fetchOverrides = useCallback(async (y: number) => {
    if (!apiBase || !token) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/api/reports/calendar-overrides?year=${y}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setOverrides(await res.json());
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    fetchOverrides(year);
    setSelected(null);
  }, [year, fetchOverrides]);

  // Optimistic update handlers
  function handleOverrideAdded(ov: CalendarOverride) {
    setOverrides(prev => {
      const filtered = prev.filter(
        o => !(o.date === ov.date && o.override_type === ov.override_type)
      );
      return [...filtered, ov];
    });
    // Recompute selected day kind with new overrides
    if (selected?.dStr === ov.date) {
      const { holidays, specials } = resolveCalendar(year, [...overrides.filter(
        o => !(o.date === ov.date && o.override_type === ov.override_type)
      ), ov]);
      setSelected(prev => prev ? { ...prev, kind: dayKind(prev.dStr, holidays, specials) } : null);
    }
  }

  function handleOverrideRemoved(date: DateString, type: OverrideType) {
    const next = overrides.filter(o => !(o.date === date && o.override_type === type));
    setOverrides(next);
    if (selected?.dStr === date) {
      const { holidays, specials } = resolveCalendar(year, next);
      setSelected(prev => prev ? { ...prev, kind: dayKind(prev.dStr, holidays, specials) } : null);
    }
  }

  const { holidays, specials, labels } = resolveCalendar(year, overrides);
  const hasDefinedData = BASELINE_HOLIDAY_CLOSURES[year] !== undefined || overrides.some(
    o => new Date(o.date + 'T12:00:00').getFullYear() === year
  );

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Business calendar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Store open/close schedule. Click any day to preview its reporting window
            {isAdmin && ' or edit closures'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(y => Math.max(AVAILABLE_YEARS[0], y - 1))}
            className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600
              text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >←</button>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5
              text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => setYear(y => Math.min(AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1], y + 1))}
            className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600
              text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >→</button>
        </div>
      </header>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        {[
          { label: 'Open',               cls: 'bg-emerald-100 dark:bg-emerald-900' },
          { label: 'Closed',             cls: 'bg-gray-200 dark:bg-gray-700' },
          { label: 'Holiday closure',    cls: 'bg-orange-100 dark:bg-orange-900' },
          { label: 'Special open Sunday',cls: 'bg-blue-100 dark:bg-blue-900' },
        ].map(({ label, cls }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${cls}`} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm ring-2 ring-violet-500" />
          Today
        </span>
      </div>

      {/* Undefined year notice */}
      {!hasDefinedData && (
        <div className="rounded-md border border-amber-200 dark:border-amber-700
          bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm
          text-amber-800 dark:text-amber-300">
          Holiday closures and special open Sundays have not been defined for {year}.
          Showing base schedule (Mon–Sat open, Sun closed).
          {isAdmin && ' Click any day to add closures or special open Sundays.'}
        </div>
      )}

      {loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500">Loading overrides…</p>
      )}

      {/* Selected day detail + edit panel */}
      {selected && (
        <EditPanel
          dayInfo={selected}
          holidays={holidays}
          specials={specials}
          labels={labels}
          overrides={overrides}
          isAdmin={isAdmin}
          apiBase={apiBase}
          token={token}
          onOverrideAdded={handleOverrideAdded}
          onOverrideRemoved={handleOverrideRemoved}
        />
      )}

      {/* 12-month grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, m) => (
          <MonthGrid
            key={m}
            year={year}
            month={m}
            today={TODAY}
            holidays={holidays}
            specials={specials}
            selected={selected?.dStr ?? null}
            onDayClick={setSelected}
          />
        ))}
      </div>
    </div>
  );
}