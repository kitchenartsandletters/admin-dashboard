import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

// ─── Calendar data ────────────────────────────────────────────────────────────
// Mirrors business_calendar.py exactly. Phase 2 will hydrate from Supabase
// overrides instead of these hardcoded sets.

type DateString = string; // 'YYYY-MM-DD'

const SPECIAL_OPEN_SUNDAYS: Record<number, Set<DateString>> = {
  2025: new Set(['2025-12-07', '2025-12-14', '2025-12-21']),
  2026: new Set(['2026-12-06', '2026-12-13', '2026-12-20']),
};

const HOLIDAY_CLOSURES: Record<number, Set<DateString>> = {
  2025: new Set([
    '2025-05-24', '2025-05-26', '2025-07-04',
    '2025-09-01', '2025-11-28', '2025-12-25', '2025-12-26',
  ]),
  2026: new Set([
    '2026-01-01', '2026-05-23', '2026-05-24', '2026-07-04',
    '2026-09-07', '2026-11-26', '2026-12-25', '2026-12-26',
  ]),
};

const HOLIDAY_NAMES: Record<DateString, string> = {
  '2025-05-24': 'Sat before Memorial Day',
  '2025-05-26': 'Memorial Day',
  '2025-07-04': 'Independence Day',
  '2025-09-01': 'Labor Day',
  '2025-11-28': 'Thanksgiving',
  '2025-12-25': 'Christmas',
  '2025-12-26': 'Boxing Day',
  '2026-01-01': "New Year's Day",
  '2026-05-23': 'Sat before Memorial Day',
  '2026-05-24': 'Memorial Day (Sun)',
  '2026-07-04': 'Independence Day',
  '2026-09-07': 'Labor Day',
  '2026-11-26': 'Thanksgiving',
  '2026-12-25': 'Christmas',
  '2026-12-26': 'Boxing Day',
};

// ─── Calendar logic ───────────────────────────────────────────────────────────

function toDateString(d: Date): DateString {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function parseLocal(s: DateString): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isBusinessDay(dStr: DateString, year: number): boolean {
  const holidays = HOLIDAY_CLOSURES[year];
  const specials  = SPECIAL_OPEN_SUNDAYS[year];
  if (holidays?.has(dStr)) return false;
  const dow = parseLocal(dStr).getDay();
  if (dow === 0) return specials?.has(dStr) ?? false;
  return dow >= 1 && dow <= 6;
}

function findLastOpen(dStr: DateString): DateString {
  const d = parseLocal(dStr);
  d.setDate(d.getDate() - 1);
  while (!isBusinessDay(toDateString(d), d.getFullYear())) {
    d.setDate(d.getDate() - 1);
  }
  return toDateString(d);
}

function getReportingWindow(dStr: DateString): { start: DateString; end: DateString } {
  const d = parseLocal(dStr);
  const yesterday = new Date(d);
  yesterday.setDate(d.getDate() - 1);
  return {
    start: findLastOpen(dStr),
    end:   toDateString(yesterday),
  };
}

type DayKind = 'open' | 'closed' | 'holiday' | 'special-open';

function dayKind(dStr: DateString, year: number): DayKind {
  const holidays = HOLIDAY_CLOSURES[year];
  const specials  = SPECIAL_OPEN_SUNDAYS[year];
  if (holidays?.has(dStr)) return 'holiday';
  const dow = parseLocal(dStr).getDay();
  if (dow === 0) return specials?.has(dStr) ? 'special-open' : 'closed';
  if (dow >= 1 && dow <= 6) return 'open';
  return 'closed';
}

function fmtDisplay(dStr: DateString): string {
  return parseLocal(dStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DOW_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

interface DayInfo {
  dStr: DateString;
  kind: DayKind;
  isToday: boolean;
}

interface MonthGridProps {
  year: number;
  month: number;       // 0-indexed
  today: DateString;
  onDayClick: (info: DayInfo) => void;
}

function MonthGrid({ year, month, today, onDayClick }: MonthGridProps) {
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const kindClasses: Record<DayKind, string> = {
    'open':         'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    'closed':       'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
    'holiday':      'bg-orange-50 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
    'special-open': 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center mb-2">
        {MONTH_NAMES[month]}
      </p>
      <div className="grid grid-cols-7 gap-px mb-1">
        {DOW_LABELS.map(l => (
          <div key={l} className="text-center text-[10px] text-gray-400 dark:text-gray-500">
            {l}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day  = i + 1;
          const dStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const kind = dayKind(dStr, year);
          const isToday = dStr === today;
          return (
            <button
              key={dStr}
              onClick={() => onDayClick({ dStr, kind, isToday })}
              className={`
                text-center text-[11px] rounded py-0.5 leading-5 transition-all
                ${kindClasses[kind]}
                ${isToday ? 'ring-2 ring-violet-500 ring-offset-1 font-semibold' : ''}
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

// ─── Main page ────────────────────────────────────────────────────────────────

const TODAY = toDateString(new Date());
const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028];

export default function BusinessCalendarPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [year, setYear]         = useState(CURRENT_YEAR);
  const [selected, setSelected] = useState<DayInfo | null>(null);

  const hasDefinedData = HOLIDAY_CLOSURES[year] !== undefined;

  const kindLabel: Record<DayKind, string> = {
    'open':         'Open',
    'closed':       'Closed',
    'holiday':      'Holiday closure',
    'special-open': 'Special open Sunday',
  };

  const kindBadge: Record<DayKind, string> = {
    'open':         'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    'closed':       'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    'holiday':      'bg-orange-50 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
    'special-open': 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  };

  function renderPreview() {
    if (!selected) return null;
    const { dStr, kind } = selected;
    const selYear = parseInt(dStr.slice(0, 4));
    const d = parseLocal(dStr);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });

    // Reporting window: "if today were this day, the report would cover..."
    const tomorrow = new Date(d);
    tomorrow.setDate(d.getDate() + 1);
    const tStr = toDateString(tomorrow);

    let windowInfo: { start: DateString; end: DateString } | null = null;

    if (isBusinessDay(dStr, selYear)) {
      windowInfo = getReportingWindow(tStr);
    } else {
      // Find next open day and compute its window
      const next = new Date(tomorrow);
      while (!isBusinessDay(toDateString(next), next.getFullYear())) {
        next.setDate(next.getDate() + 1);
      }
      const afterNext = new Date(next);
      afterNext.setDate(next.getDate() + 1);
      windowInfo = getReportingWindow(toDateString(afterNext));
    }

    const holidayName = HOLIDAY_NAMES[dStr];
    const isClosed    = kind === 'closed' || kind === 'holiday';

    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {dayName}, {fmtDisplay(dStr)}
          </p>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${kindBadge[kind]}`}>
            {holidayName ?? kindLabel[kind]}
          </span>
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          {isClosed ? (
            <p>Store closed — automated reports do not run on this day.</p>
          ) : (
            <p>Store open — automated reports run as scheduled.</p>
          )}

          {windowInfo && (
            <div className="pt-1">
              <p className="text-gray-400 dark:text-gray-500 mb-1">
                {isBusinessDay(dStr, selYear)
                  ? 'If today were this date, the daily report would cover:'
                  : `Next report after this closure would cover:`}
              </p>
              <span className="inline-block px-3 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs text-gray-800 dark:text-gray-200 font-medium">
                {windowInfo.start === windowInfo.end
                  ? fmtDisplay(windowInfo.start)
                  : `${fmtDisplay(windowInfo.start)} → ${fmtDisplay(windowInfo.end)}`}
              </span>
            </div>
          )}
        </div>

        {/* Admin-only edit affordance (Phase 2 — stub) */}
        {isAdmin && !hasDefinedData && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            No holiday or special Sunday data defined for {year}. Edits will be enabled in an upcoming release.
          </p>
        )}
        {isAdmin && hasDefinedData && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Admin editing of closures and special Sundays coming in the next release.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Business calendar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Store open/close schedule. Click any day to preview its reporting window.
          </p>
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setYear(y => Math.max(AVAILABLE_YEARS[0], y - 1)); setSelected(null); }}
            className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600
              text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            ←
          </button>
          <select
            value={year}
            onChange={e => { setYear(Number(e.target.value)); setSelected(null); }}
            className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5
              text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            {AVAILABLE_YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => { setYear(y => Math.min(AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1], y + 1)); setSelected(null); }}
            className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600
              text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            →
          </button>
        </div>
      </header>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        {[
          { label: 'Open',                 cls: 'bg-emerald-100 dark:bg-emerald-900' },
          { label: 'Closed',               cls: 'bg-gray-200 dark:bg-gray-700' },
          { label: 'Holiday closure',      cls: 'bg-orange-100 dark:bg-orange-900' },
          { label: 'Special open Sunday',  cls: 'bg-blue-100 dark:bg-blue-900' },
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

      {/* Undefined-year notice */}
      {!hasDefinedData && (
        <div className="rounded-md border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Holiday closures and special open Sundays have not been defined for {year}.
          The calendar shows the base schedule (Mon–Sat open, Sun closed).
          {isAdmin && ' Use the edit controls to build out this year\'s calendar.'}
        </div>
      )}

      {/* Day detail panel */}
      {selected && renderPreview()}

      {/* 12-month grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, m) => (
          <MonthGrid
            key={m}
            year={year}
            month={m}
            today={TODAY}
            onDayClick={setSelected}
          />
        ))}
      </div>
    </div>
  );
}