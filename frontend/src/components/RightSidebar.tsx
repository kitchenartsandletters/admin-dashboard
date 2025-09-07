// src/components/RightSidebar.tsx
import React, { useEffect, useRef, useState } from 'react';
import DocViewer from './DocViewer';

type Props = {
  title?: string;
  onClose: () => void;
  row?: any;
  renderRowContent?: () => React.ReactNode;
  docsFilePath?: string;
  logsUrl?: string;
};

export default function RightSidebar({ title, onClose, row, renderRowContent, docsFilePath }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, isVisible]);

  useEffect(() => {
    const handleOpenSidebar = (e: CustomEvent) => {
      if (e.detail?.docsFilePath) {
        setShouldRender(true);
        setIsVisible(true);
      }
    };

    window.addEventListener('open-right-sidebar', handleOpenSidebar as EventListener);
    return () => {
      window.removeEventListener('open-right-sidebar', handleOpenSidebar as EventListener);
    };
  }, []);

  useEffect(() => {
    const isOpen = !!row || !!docsFilePath;
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsVisible(true), 10);
      contentRef.current?.scrollTo(0, 0);
    } else {
      setIsVisible(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [row, docsFilePath]);

  if (!shouldRender) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[28rem] bg-white dark:bg-gray-900 border-l shadow-xl z-50 relative transition-transform duration-300 transform ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-3 border-b dark:border-gray-700">
          <h3 className="font-semibold text-lg">{title ?? 'Details'}</h3>
          <button onClick={onClose} className="text-sm underline">Close</button>
        </div>

        <div
          ref={contentRef}
          className="p-3 text-sm space-y-3 overflow-y-auto h-[calc(100%-3.25rem)] isolate"
        >
          {row && renderRowContent ? (
            renderRowContent()
          ) : docsFilePath ? (
            <div className="prose dark:prose-invert max-w-none">
              <DocViewer filePath={docsFilePath} />
            </div>
          ) : (
            <div className="opacity-70">No content available</div>
          )}
        </div>
      </div>
    </>
  );
}