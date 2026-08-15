// src/supply-chain/returns/ReturnsWorkspace.tsx
// Publisher Returns home. Create a return, see open drafts and completed
// returns, and start from the suggestion tiles (where excess is building up).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchReturnsList, fetchReturnsPublishers, createReturn,
  ReturnIndexRow, ReturnsPublisherTile, ReturnStatus,
} from '../../api/returnsApi';

const money = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString() : '—');

const STATUS_STYLE: Record<ReturnStatus, string> = {
  draft: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  picking: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  shipped: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
};

const OPEN: ReturnStatus[] = ['draft', 'picking'];
const DONE: ReturnStatus[] = ['confirmed', 'shipped'];

export default function ReturnsWorkspace() {
  const navigate = useNavigate();
  const [returns, setReturns] = useState<ReturnIndexRow[]>([]);
  const [tiles, setTiles] = useState<ReturnsPublisherTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetchReturnsList(), fetchReturnsPublishers()])
      .then(([r, t]) => { setReturns(r); setTiles(t); })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load returns'))
      .finally(() => setLoading(false));
  }, []);

  const open = returns.filter(r => OPEN.includes(r.status));
  const completed = returns.filter(r => DONE.includes(r.status));

  const start = async (publisherId: string) => {
    if (creatingId) return;
    setCreatingId(publisherId);
    setError(null);
    try {
      const detail = await createReturn({ publisher_id: publisherId });
      navigate(`/supply-chain/returns/${detail.return.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create return');
      setCreatingId(null);
    }
  };

  const ReturnRow = ({ r }: { r: ReturnIndexRow }) => (
    <button
      onClick={() => navigate(`/supply-chain/returns/${r.id}`)}
      className="w-full text-left grid grid-cols-12 gap-2 items-center px-3 py-2 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
    >
      <span className="col-span-3 font-medium truncate">{r.publisher_name ?? '—'}</span>
      <span className="col-span-2 font-mono text-xs opacity-70">{r.return_number ?? '—'}</span>
      <span className="col-span-2">
        <span className={`text-[11px] uppercase px-2 py-0.5 rounded ${STATUS_STYLE[r.status]}`}>{r.status}</span>
      </span>
      <span className="col-span-2 text-right tabular-nums">{r.line_count} titles</span>
      <span className="col-span-2 text-right tabular-nums">
        {DONE.includes(r.status) ? `${r.confirmed_units} / ${money(r.confirmed_value)}` : `${r.requested_units} / ${money(r.requested_value)}`}
      </span>
      <span className="col-span-1 text-right text-xs opacity-60">{day(r.updated_at)}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Publisher Returns</h2>
        <button
          onClick={() => setPickerOpen(o => !o)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium"
        >
          + Create return
        </button>
      </div>

      {error && (
        <div className="text-sm rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2">{error}</div>
      )}

      {pickerOpen && (
        <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <div className="text-sm font-medium mb-2">Start a return for…</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto">
            {tiles.map(t => (
              <button
                key={t.publisher_party_id}
                disabled={!!creatingId}
                onClick={() => start(t.publisher_party_id)}
                className="text-left px-3 py-2 border rounded text-sm hover:border-blue-400 disabled:opacity-50"
              >
                {t.publisher_name}
                <span className="block text-xs opacity-60">{t.return_units} suggested · {money(t.return_value_list)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="opacity-70 text-sm py-8 text-center">Loading…</div>
      ) : (
        <>
          {/* Open returns */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-2">Open ({open.length})</h3>
            {open.length === 0 ? (
              <div className="text-sm opacity-60 px-3 py-4 border rounded border-dashed">No open returns. Create one from a suggestion below.</div>
            ) : (
              <div className="border rounded-md overflow-hidden">{open.map(r => <ReturnRow key={r.id} r={r} />)}</div>
            )}
          </section>

          {/* Completed returns */}
          {completed.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-2">Completed ({completed.length})</h3>
              <div className="border rounded-md overflow-hidden">{completed.map(r => <ReturnRow key={r.id} r={r} />)}</div>
            </section>
          )}

          {/* Suggested next returns */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-2">Suggested next returns</h3>
            <p className="text-xs opacity-60 mb-3 max-w-3xl">Where excess is building up against the last 12 months of sales. Click one to open a draft — you adjust every line inside.</p>
            {tiles.length === 0 ? (
              <div className="text-sm opacity-60">No returnable publishers with excess stock.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {tiles.map(t => (
                  <button
                    key={t.publisher_party_id}
                    disabled={!!creatingId}
                    onClick={() => start(t.publisher_party_id)}
                    className="text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:shadow-md hover:border-blue-400 transition-all disabled:opacity-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold leading-tight">{t.publisher_name ?? '—'}</h4>
                      {creatingId === t.publisher_party_id && <span className="text-xs opacity-60">creating…</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                      <div><div className="text-2xl font-bold">{(t.return_units || 0).toLocaleString()}</div><div className="text-xs opacity-60">units</div></div>
                      <div><div className="text-2xl font-bold">{money(t.return_value_list)}</div><div className="text-xs opacity-60">list value</div></div>
                    </div>
                    <div className="mt-3 text-xs opacity-70">{t.titles_with_excess} of {t.titles} titles w/ excess{t.never_sold_titles > 0 ? ` · ${t.never_sold_titles} never sold` : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
