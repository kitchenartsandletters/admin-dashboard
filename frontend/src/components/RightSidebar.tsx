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
      if (e.key === 'Escape' && isVisible) {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }
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

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[28rem] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl z-50 transition-transform duration-300 transform ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-3 border-b dark:border-gray-700">
          <h3 className="font-semibold text-lg">
            {docsFilePath
            ? docsFilePath.includes('blacklist') ? 'Blacklist Manager Guide'
            : docsFilePath.includes('reports')   ? 'Reports Help'
            : 'Help Docs'
            : 'Damaged Details'}
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
    </>
  );
}