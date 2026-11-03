// src/components/RightSidebar.tsx
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom'; // 1. Import createPortal
import DocViewer from './DocViewer';
import { useModalLevel } from './ModalShell';
import { MODAL_LAYERS, MAX_MODAL_LEVEL } from '../lib/zIndex';

type Props = {
  title?: string;
  onClose: () => void;
  row?: any;
  renderRowContent?: () => React.ReactNode;
  docsFilePath?: string;
  logsUrl?: string;
};

// Stacking. On a page this is the sidebar layer (z-40/50, lib/zIndex.ts). Opened
// from inside a ModalShell — e.g. a help guide from the receiving wizard — it
// takes the next modal layer instead, so it appears above that modal rather
// than behind it.
const PAGE_LAYER = { backdrop: 'z-40', panel: 'z-50' } as const;

export default function RightSidebar({ title, onClose, row, renderRowContent, docsFilePath }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const modalLevel = useModalLevel();
  const layer = modalLevel >= 0
    ? MODAL_LAYERS[Math.min(modalLevel + 1, MAX_MODAL_LEVEL)]
    : PAGE_LAYER;

  // Capture phase + preventDefault: this panel takes Escape first, and a
  // ModalShell underneath ignores an already-handled key, so one press closes
  // the sidebar without also closing the modal it was opened from.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        e.preventDefault();
        setIsVisible(false);
        setTimeout(onClose, 300);
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
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
      setTimeout(() => {
        setIsVisible(true);
        contentRef.current?.scrollTo(0, 0);
      }, 10);
    } else {
      setIsVisible(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [row, docsFilePath]);

  if (!shouldRender) return null;

  // 2. Use createPortal to target document.body
  return createPortal(
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm ${layer.backdrop}`}
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
      />
      {/* Sidebar Container — h-svh, not h-screen: 100vh runs under a phone's
          address bar and hides the bottom of the guide. */}
      <div
        className={`fixed top-0 right-0 h-svh w-full sm:w-[28rem] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl ${layer.panel} transition-transform duration-300 transform ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/*
          A caller-supplied `title` now wins. The path checks below are the legacy
          fallback for screens that never passed one — dropping them would regress
          the Blacklist and Reports panels to the generic "Help Docs" heading.

          This matters beyond cosmetics: the panel is now used for both reference
          guides and SOPs, and a procedure opening under a heading that reads
          "Help Docs" undercuts the distinction the two document types exist to make.
        */}
        <div className="flex items-center justify-between p-3 border-b dark:border-gray-700">
          <h3 className="font-semibold text-lg">
            {title
            ?? (docsFilePath
            ? docsFilePath.includes('blacklist') ? 'Blacklist Manager Guide'
            : docsFilePath.includes('reports')   ? 'Reports Help'
            : 'Help Docs'
            : 'Damaged Details')}
          </h3>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 300);
            }}
            className="text-sm underline"
          >
            Close
          </button>
        </div>

        <div
          ref={contentRef}
          className="p-3 pb-12 text-sm space-y-3 overflow-y-auto h-[calc(100%-3.25rem)] relative"
        >
          {row && renderRowContent ? (
            renderRowContent()
          ) : docsFilePath ? (
            <DocViewer
              filePath={docsFilePath}
              components={{
                img: ({ node, ...props }) => (
                  <div className="border border-gray-300 dark:border-gray-700 rounded p-2 my-6 bg-white dark:bg-gray-900 shadow-md max-w-xs mx-auto">
                    <img {...props} className="w-full h-auto rounded" />
                  </div>
                ),
              }}
            />
          ) : (
            <div className="opacity-70">No content available</div>
          )}
        </div>
      </div>
    </>,
    document.body // Appends directly to the <body> tag
  );
}
