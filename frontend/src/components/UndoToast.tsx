// src/components/UndoToast.tsx
import React, { useEffect } from 'react';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onClose: () => void;
  duration?: number; // in ms, default 10000
}

const UndoToast: React.FC<UndoToastProps> = ({
  message,
  onUndo,
  onClose,
  duration = 10000,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className="
        fixed bottom-4 right-4 z-50 
        bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg
        flex items-center gap-4
        animate-fade-in-up
      "
    >
      <span className="text-sm">{message}</span>
      <button
        className="text-blue-400 font-semibold hover:underline text-sm"
        onClick={() => {
          onUndo();
          onClose();
        }}
      >
        Undo
      </button>
    </div>
  );
};

export default UndoToast;