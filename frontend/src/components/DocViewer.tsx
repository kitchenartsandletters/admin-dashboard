// src/components/DocViewer.tsx
import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type DocViewerProps = {
  filePath: string;
  components?: {
    [key: string]: React.ElementType;
  };
};

export default function DocViewer({ filePath, components }: DocViewerProps) {
  const [markdown, setMarkdown] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch(filePath)
      .then(res => res.text())
      .then(text => {
        setMarkdown(text);
        setLoading(false);
      })
      .catch(err => {
        setMarkdown('Failed to load documentation.');
        setLoading(false);
      });
  }, [filePath]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-6 overflow-auto">
      <div className="bg-white dark:bg-gray-900 p-6 rounded shadow-lg max-w-3xl w-full relative">
        <div className="prose dark:prose-invert max-w-none">
          {loading ? (
            <p>Loading documentation...</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {markdown}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}