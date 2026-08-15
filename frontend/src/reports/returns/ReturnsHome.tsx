// src/reports/returns/ReturnsHome.tsx
// Publisher Returns — landing tiles. One tile per returnable publisher with
// excess stock; click through to that publisher's worksheet.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchReturnsPublishers, ReturnsPublisherTile } from '../../api/returnsApi';

const money = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export default function ReturnsHome() {
  const navigate = useNavigate();
  const [tiles, setTiles] = useState<ReturnsPublisherTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchReturnsPublishers()
      .then(setTiles)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load returns'))
      .finally(() => setLoading(false));
  }, []);

  const totalUnits = tiles.reduce((s, t) => s + (t.return_units || 0), 0);
  const totalValue = tiles.reduce((s, t) => s + (t.return_value_list || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Publisher Returns</h2>
          <span className="text-sm opacity-70">
            {tiles.length} returnable {tiles.length === 1 ? 'publisher' : 'publishers'} · {totalUnits.toLocaleString()} suggested units · {money(totalValue)} list
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-3xl">
        Suggested returns keep the last 12 months of sales in stock and flag the excess. They're a
        starting point — you adjust every line inside a publisher's worksheet. Only publishers marked
        returnable in Supply Chain appear here.
      </p>

      {error && (
        <div className="text-sm rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-700 text-red-700 dark:text-red-300 px-3 py-2">{error}</div>
      )}

      {loading ? (
        <div className="opacity-70 text-sm py-8 text-center">Loading…</div>
      ) : tiles.length === 0 ? (
        <div className="opacity-70 text-sm py-8 text-center">No returnable publishers with excess stock.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tiles.map(t => (
            <button
              key={t.publisher_party_id}
              onClick={() => navigate(`/reports/returns/${t.publisher_party_id}`)}
              className="text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:shadow-md hover:border-blue-400 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-tight">{t.publisher_name ?? '—'}</h3>
                {t.default_return_address ? null : (
                  <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 whitespace-nowrap">no return addr</span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                <div>
                  <div className="text-2xl font-bold">{(t.return_units || 0).toLocaleString()}</div>
                  <div className="text-xs opacity-60">units to return</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{money(t.return_value_list)}</div>
                  <div className="text-xs opacity-60">list value</div>
                </div>
              </div>
              <div className="mt-3 text-xs opacity-70 flex flex-wrap gap-x-3 gap-y-1">
                <span>{t.titles_with_excess} of {t.titles} titles w/ excess</span>
                {t.never_sold_titles > 0 && <span>· {t.never_sold_titles} never sold</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
