// src/components/RightSidebar.tsx
import React, { useEffect, useState } from 'react';
import { DamagedBooksService, DamagedRow } from '../components/DamagedBooksService';
import DocViewer from './DocViewer';

type Props = { row: DamagedRow | null; onClose: () => void; docsFilePath?: string };

export default function RightSidebar({ row, onClose, docsFilePath }: Props) {
  const [tab, setTab] = useState<'info' | 'docs' | 'logs'>('info');
  const [docs, setDocs] = useState<{ title: string; url: string }[]>([]);
  const [logsUrl, setLogsUrl] = useState<string>('');
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (!row) return;
    (async () => {
      const [links, logUrl] = await Promise.all([
        DamagedBooksService.getDocs(),
        DamagedBooksService.getLogsLink()
      ]);
      setDocs(links);
      setLogsUrl(logUrl);
    })();
  }, [row, docsFilePath]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    const handleOpenSidebar = (e: CustomEvent) => {
      if (e.detail?.docsFilePath) {
        setTab('docs');
        setShouldRender(true);
        setIsVisible(true);
        setDocs([
          {
            title: 'Help Documentation',
            url: e.detail.docsFilePath
          }
        ]);
      }
    };

    window.addEventListener('open-right-sidebar', handleOpenSidebar as EventListener);
    return () => {
      window.removeEventListener('open-right-sidebar', handleOpenSidebar as EventListener);
    };
  }, []);

  // Slide-in animation visibility and render control
  useEffect(() => {
    if (row) {
      setShouldRender(true);
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
      setTimeout(() => setShouldRender(false), 300); // match transition duration
    }
  }, [row]);

  if (!shouldRender) return null;

  const searchHandle = encodeURIComponent(row?.handle ?? '');
  const logsDeepLink = logsUrl ? `${logsUrl}?q=${searchHandle}` : '';

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[28rem] bg-white dark:bg-gray-900 border-l shadow-xl z-50 transition-transform duration-300 transform ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-3 border-b dark:border-gray-700">
          <h3 className="font-semibold text-lg">Damaged Details</h3>
          <button onClick={onClose} className="text-sm underline">Close</button>
        </div>

        <div className="flex gap-3 p-3 border-b text-sm">
          <button className={tab === 'info' ? 'font-semibold' : ''} onClick={() => setTab('info')}>Info</button>
          <button className={tab === 'docs' ? 'font-semibold' : ''} onClick={() => setTab('docs')}>Docs</button>
          <button className={tab === 'logs' ? 'font-semibold' : ''} onClick={() => setTab('logs')}>Logs</button>
        </div>

        <div className="p-3 text-sm space-y-3 overflow-auto h-[calc(100%-6rem)]">
          {tab === 'info' && (
            <div className="space-y-2">
              <div><span className="opacity-70">Title:</span> {row?.title ?? row?.handle ?? '—'}</div>
              <div><span className="opacity-70">Handle:</span> {row?.handle ?? '—'}</div>
              <div><span className="opacity-70">Condition:</span> {row?.condition ?? '—'}</div>
              <div><span className="opacity-70">Available:</span> {row?.available ?? '—'}</div>
              <div><span className="opacity-70">SKU:</span> {row?.sku ?? '—'}</div>
              <div><span className="opacity-70">Barcode:</span> {row?.barcode ?? '—'}</div>
              <div><span className="opacity-70">Stock:</span> {row?.stock_status ?? '—'}</div>
              <div><span className="opacity-70">Last webhook:</span> {row?.last_webhook_at ?? '—'}</div>
              <div><span className="opacity-70">Last reconcile:</span> {row?.last_shopify_sync_at ?? '—'}</div>
            </div>
          )}

          {tab === 'docs' && (
            docsFilePath ? (
              <div className="prose dark:prose-invert max-w-none">
                <DocViewer filePath={docsFilePath} />
              </div>
            ) : (
              row?.handle === 'blacklist-manager' ? (
                <div className="prose dark:prose-invert max-w-none">
                  <DocViewer filePath="/docs/blacklist-manager.md" />
                </div>
              ) : (
                <ul className="list-disc ml-5 space-y-1">
                  {docs.map(d => (
                    <li key={d.url}>
                      <a className="underline" href={d.url} target="_blank" rel="noreferrer">{d.title}</a>
                    </li>
                  ))}
                  {docs.length === 0 && <li className="opacity-70">No docs</li>}
                </ul>
              )
            )
          )}

          {tab === 'logs' && (
            logsDeepLink
              ? <a className="underline" href={logsDeepLink} target="_blank" rel="noreferrer">Open Gateway logs for this handle</a>
              : <div className="opacity-70">Logs link not configured</div>
          )}
        </div>
      </div>
    </>
  );
}