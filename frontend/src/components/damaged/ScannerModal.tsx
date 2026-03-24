import React, { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { isValidEan13 } from './validators'

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

export default function ScannerModal({ isOpen, onClose, onScan }: ScannerModalProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const regionId = "reader";
  
  // Use a ref for lastScanned so it persists across renders without triggering them
  const lastScanned = useRef({ value: "", time: 0 });

  useEffect(() => {
    if (isOpen) {
      // Initialize the scanner logic
      scannerRef.current = new Html5Qrcode(regionId);
      
      const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 150 }, // ISBNs are wide rectangles
        formatsToSupport: [ Html5QrcodeSupportedFormats.EAN_13 ] 
      };

      scannerRef.current.start(
        { facingMode: "environment" }, // Prioritize back camera
        config,
        (decodedText) => {
          const now = Date.now();

          // 1. Validate Checksum (Ensure it's a real ISBN/EAN-13)
          if (!isValidEan13(decodedText)) {
            return;
          }

          // 2. Cooldown Logic: Prevent duplicate scans of the same book within 3 seconds
          if (
            decodedText === lastScanned.current.value && 
            (now - lastScanned.current.time) < 3000
          ) {
            return;
          }

          // Update tracking refs
          lastScanned.current = { value: decodedText, time: now };

          // 3. Send to Wizard
          onScan(decodedText);
        },
        () => { /* Silent failure for frames with no code */ }
      ).catch(err => console.error("Scanner start error:", err));
    }

    return () => {
      // Cleanup: Stop camera when modal closes
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().then(() => {
          scannerRef.current?.clear();
        }).catch(err => console.error("Scanner stop error:", err));
      }
    };
  }, [isOpen, onScan]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-lg shadow-xl overflow-hidden border dark:border-gray-700">
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h3 className="font-semibold text-gray-900 dark:text-white">Scan Book Barcode</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">&times;</button>
        </div>
        
        <div className="p-6">
          <div id={regionId} className="overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800" />
          <p className="text-xs text-center text-gray-500 mt-4">
            Align the EAN-13 barcode within the box.
          </p>
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 flex justify-center">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm font-medium"
          >
            Done Scanning
          </button>
        </div>
      </div>
    </div>
  );
}