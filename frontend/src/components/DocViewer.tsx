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

export default function DocViewer({
  filePath,
  components = {},
}: DocViewerProps) {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(filePath)
      .then((res) => res.text())
      .then((text) => setMarkdown(text))
      .catch(() => setMarkdown('Error loading document.'))
      .finally(() => setLoading(false));
  }, [filePath]);

  return (
    <div className="prose dark:prose-invert max-w-none w-full">
      {loading ? (
        <p>Loading documentation...</p>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {markdown}
        </ReactMarkdown>
      )}
    </div>
  );
}