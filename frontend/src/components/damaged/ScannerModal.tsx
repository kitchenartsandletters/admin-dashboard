import React, { useEffect, useRef, useState, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type InventorySeed = {
  light: number;
  moderate: number;
  heavy: number;
};

type ScannerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Called when the user confirms a scan with quantities.
   * Modal stays open and resumes scanning for the next book.
   */
  onScan: (isbn: string, inventory: InventorySeed) => void;
};

type ScanState =
  | 'scanning'    // live camera, continuous auto-detection running
  | 'detected'    // barcode found, qty inputs shown
  | 'added'       // confirmed — brief flash, then auto-resumes
  | 'manual'      // BarcodeDetector unavailable — manual ISBN entry
  | 'error';      // camera access denied

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CONDITIONS = ['light', 'moderate', 'heavy'] as const;
type Condition = (typeof CONDITIONS)[number];

const CONDITION_META: Record<Condition, { label: string; color: string; bgColor: string }> = {
  light:    { label: 'Light',    color: 'text-amber-700 dark:text-amber-400',  bgColor: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700'   },
  moderate: { label: 'Moderate', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700' },
  heavy:    { label: 'Heavy',    color: 'text-red-600 dark:text-red-400',      bgColor: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'             },
};

const ADDED_RESUME_DELAY = 1800; // ms before camera auto-resumes
const SCAN_INTERVAL_MS   =  400; // ms between detection attempts

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function detectOnFrame(canvas: HTMLCanvasElement): Promise<string | null> {
  if (!('BarcodeDetector' in window)) return null;
  try {
    // @ts-ignore
    const detector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'itf', 'upc_a', 'upc_e'],
    });
    const bitmap = await createImageBitmap(canvas);
    const results: { rawValue: string }[] = await detector.detect(bitmap);
    bitmap.close();
    return results.length > 0 ? results[0].rawValue : null;
  } catch {
    return null;
  }
}

function playBeep() {
  try {
    new Audio('https://assets.mixkit.co/active_storage/sfx/766/766-preview.mp3')
      .play().catch(() => {});
  } catch { /* non-critical */ }
}

function emptyInventory(): InventorySeed {
  return { light: 0, moderate: 0, heavy: 0 };
}

function inventorySummary(inv: InventorySeed): string {
  const parts = CONDITIONS.filter(c => inv[c] > 0).map(c => `${inv[c]} ${CONDITION_META[c].label}`);
  return parts.length > 0 ? parts.join(' · ') : 'No copies';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ScannerModal({ isOpen, onClose, onScan }: ScannerModalProps) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [scanState,     setScanState]     = useState<ScanState>('scanning');
  const [detectedCode,  setDetectedCode]  = useState<string | null>(null);
  const [scanInventory, setScanInventory] = useState<InventorySeed>(emptyInventory());
  const [addedSnapshot, setAddedSnapshot] = useState<{ isbn: string; inv: InventorySeed } | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [manualIsbn,    setManualIsbn]    = useState('');
  const [hasBarcodeDetector] = useState(() => 'BarcodeDetector' in window);

  // ── Camera lifecycle ──────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraReady(true);
        setScanState(hasBarcodeDetector ? 'scanning' : 'manual');
      }
    } catch {
      setScanState('error');
    }
  }, [hasBarcodeDetector]);

  // Open/close lifecycle
  useEffect(() => {
    if (isOpen) {
      setScanState('scanning');
      setDetectedCode(null);
      setScanInventory(emptyInventory());
      setAddedSnapshot(null);
      setManualIsbn('');
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  // ── Continuous scan loop ──────────────────────────────────────────────────
  // Runs while scanState === 'scanning' and camera is ready.
  // Each iteration: draw frame → run BarcodeDetector → if found, freeze and
  // transition to 'detected'. No manual trigger required.

  useEffect(() => {
    if (scanState !== 'scanning' || !isCameraReady || !hasBarcodeDetector) return;

    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        const video  = videoRef.current;
        const canvas = canvasRef.current;

        if (video && canvas && !video.paused && video.readyState >= 2) {
          canvas.width  = video.videoWidth  || 640;
          canvas.height = video.videoHeight || 480;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            const code = await detectOnFrame(canvas);
            if (code && !cancelled) {
              video.pause();
              setDetectedCode(code);
              setScanInventory(emptyInventory());
              setScanState('detected');
              return; // stop loop — scanner resumes from 'added' → 'scanning' transition
            }
          }
        }

        // Pause between attempts so we don't hammer the detector
        await new Promise<void>(r => setTimeout(r, SCAN_INTERVAL_MS));
      }
    };

    run();
    return () => { cancelled = true; };
  }, [scanState, isCameraReady, hasBarcodeDetector]);

  // Auto-resume after 'added' flash
  useEffect(() => {
    if (scanState !== 'added') return;
    const t = setTimeout(() => {
      setScanState(hasBarcodeDetector ? 'scanning' : 'manual');
      setDetectedCode(null);
      setScanInventory(emptyInventory());
      setAddedSnapshot(null);
      videoRef.current?.play();
    }, ADDED_RESUME_DELAY);
    return () => clearTimeout(t);
  }, [scanState, hasBarcodeDetector]);

  // ── Qty helper ────────────────────────────────────────────────────────────

  const updateQty = (cond: Condition, raw: string) => {
    setScanInventory(prev => ({ ...prev, [cond]: Math.max(0, parseInt(raw, 10) || 0) }));
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleAddBook = useCallback((isbn: string, inv: InventorySeed) => {
    if (navigator.vibrate) navigator.vibrate(100);
    playBeep();
    setAddedSnapshot({ isbn, inv: { ...inv } });
    onScan(isbn, { ...inv });
    setScanState('added');
  }, [onScan]);

  const handleManualAdd = useCallback(() => {
    const isbn = manualIsbn.trim();
    if (!isbn) return;
    setManualIsbn('');
    handleAddBook(isbn, scanInventory);
  }, [manualIsbn, scanInventory, handleAddBook]);

  const handleClose = useCallback(() => {
    stopCamera();
    setScanState('scanning');
    setDetectedCode(null);
    setScanInventory(emptyInventory());
    setAddedSnapshot(null);
    setManualIsbn('');
    onClose();
  }, [stopCamera, onClose]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const subtitleMap: Partial<Record<ScanState, string>> = {
    scanning: 'Align the barcode with the frame',
    detected: 'Set quantities, then add',
    added:    'Book added — resuming…',
    manual:   'BarcodeDetector unavailable — enter ISBN manually',
    error:    'Camera unavailable',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode scanner"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b dark:border-gray-700 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Scan Barcode / ISBN</h3>
            <p className={`text-xs mt-0.5 truncate ${scanState === 'added' ? 'text-green-500 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {subtitleMap[scanState] ?? ''}
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close scanner"
            className="ml-3 flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Camera viewport ── */}
        <div className="relative bg-black flex-shrink-0" style={{ aspectRatio: '4/3' }}>
          <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanning reticle with animated line */}
          {(scanState === 'scanning' || scanState === 'added') && isCameraReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-72 h-36">
                {[
                  'top-0 left-0 border-t-4 border-l-4 rounded-tl-md',
                  'top-0 right-0 border-t-4 border-r-4 rounded-tr-md',
                  'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-md',
                  'bottom-0 right-0 border-b-4 border-r-4 rounded-br-md',
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-7 h-7 border-blue-400 ${cls}`} />
                ))}
                {/* Scan line — only animate while actively scanning */}
                {scanState === 'scanning' && (
                  <div className="absolute inset-x-0 h-0.5 bg-blue-400/70 top-1/2 animate-pulse" />
                )}
              </div>
            </div>
          )}

          {/* 'added' green flash */}
          {scanState === 'added' && (
            <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center pointer-events-none">
              <span className="inline-flex items-center gap-2 bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-xl">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Added!
              </span>
            </div>
          )}

          {/* Manual entry overlay */}
          {scanState === 'manual' && isCameraReady && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 p-6">
              <p className="text-white text-xs text-center">
                Auto-detection unavailable. Enter the ISBN below.
              </p>
            </div>
          )}

          {/* Error overlay */}
          {scanState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 gap-3 p-6 text-center">
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <p className="text-white text-sm font-medium">Camera access denied</p>
              <p className="text-gray-400 text-xs leading-relaxed">
                Grant camera permission in your browser settings, then reopen the scanner.
              </p>
            </div>
          )}

          {/* Camera loading */}
          {!isCameraReady && scanState !== 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* ── Bottom panel ── */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto">

          {/* ── SCANNING — waiting for auto-detect, no button ── */}
          {scanState === 'scanning' && (
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              Hold the barcode steady within the frame. Detection is automatic.
            </p>
          )}

          {/* ── DETECTED — qty inputs + Add Book ── */}
          {scanState === 'detected' && detectedCode && (
            <>
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-2.5">
                <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">Detected</p>
                <p className="text-lg font-mono font-bold text-green-800 dark:text-green-200 tracking-widest select-all break-all">{detectedCode}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Quantity by Condition</p>
                <div className="grid grid-cols-3 gap-2">
                  {CONDITIONS.map(cond => {
                    const meta = CONDITION_META[cond];
                    return (
                      <div key={cond} className={`rounded-lg px-2 py-2.5 border ${meta.bgColor}`}>
                        <label className={`block text-xs font-semibold mb-1.5 ${meta.color}`}>{meta.label}</label>
                        <input
                          type="number"
                          min={0}
                          value={scanInventory[cond] === 0 ? '' : scanInventory[cond]}
                          onChange={e => updateQty(cond, e.target.value)}
                          onBlur={e => { if (e.target.value === '') updateQty(cond, '0'); }}
                          placeholder="0"
                          className="w-full px-1.5 py-1 rounded text-sm text-center font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setDetectedCode(null);
                    setScanInventory(emptyInventory());
                    setScanState('scanning');
                    videoRef.current?.play();
                  }}
                  className="flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={() => handleAddBook(detectedCode, scanInventory)}
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Book
                </button>
              </div>
            </>
          )}

          {/* ── ADDED — confirmation flash ── */}
          {scanState === 'added' && addedSnapshot && (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 p-4 text-center space-y-2">
              <div className="flex items-center justify-center gap-1.5 text-green-600 dark:text-green-400 font-semibold text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Book Added
              </div>
              <p className="font-mono text-xs text-green-700 dark:text-green-300 break-all">{addedSnapshot.isbn}</p>
              <p className="text-xs text-green-600 dark:text-green-400">{inventorySummary(addedSnapshot.inv)}</p>
              <div className="flex items-center justify-center gap-1.5 pt-1 text-gray-400 dark:text-gray-500">
                <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Resuming…</span>
              </div>
            </div>
          )}

          {/* ── MANUAL — ISBN text input (no BarcodeDetector) ── */}
          {scanState === 'manual' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  ISBN or Product ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualIsbn}
                    onChange={e => setManualIsbn(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleManualAdd(); }}
                    placeholder="e.g. 9780385340533"
                    autoFocus
                    className="flex-1 px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:text-white dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm placeholder-gray-400"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Quantity by Condition</p>
                <div className="grid grid-cols-3 gap-2">
                  {CONDITIONS.map(cond => {
                    const meta = CONDITION_META[cond];
                    return (
                      <div key={cond} className={`rounded-lg px-2 py-2.5 border ${meta.bgColor}`}>
                        <label className={`block text-xs font-semibold mb-1.5 ${meta.color}`}>{meta.label}</label>
                        <input
                          type="number"
                          min={0}
                          value={scanInventory[cond] === 0 ? '' : scanInventory[cond]}
                          onChange={e => updateQty(cond, e.target.value)}
                          onBlur={e => { if (e.target.value === '') updateQty(cond, '0'); }}
                          placeholder="0"
                          className="w-full px-1.5 py-1 rounded text-sm text-center font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleManualAdd}
                disabled={!manualIsbn.trim()}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Book
              </button>
            </>
          )}

          {/* ── ERROR ── */}
          {scanState === 'error' && (
            <button
              onClick={handleClose}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}