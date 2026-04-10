import { useEffect, useRef, useState, useCallback } from 'react';

const CHAR_INTERVAL_MS = 80;
const IDLE_TIMEOUT_MS = 100;

/**
 * Detects barcode scanner input by monitoring keystroke speed.
 * Scanners send characters at ~50-100ms intervals followed by Enter.
 *
 * @param {Object}   options
 * @param {Function} options.onScan          - Called with the scanned barcode string
 * @param {boolean}  [options.enabled=true]  - Toggle the listener
 * @param {Object}   [options.searchInputRef] - React ref to the search input (scanning allowed even when focused)
 * @returns {{ lastScan: string|null, scanCount: number }}
 */
export function useBarcodeScanner({ onScan, enabled = true, searchInputRef = null }) {
  const [lastScan, setLastScan] = useState(null);
  const [scanCount, setScanCount] = useState(0);

  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const timeoutRef = useRef(null);
  const onScanRef = useRef(onScan);

  // Keep callback ref fresh without re-registering the listener
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const processBuffer = useCallback(() => {
    const barcode = bufferRef.current.trim();
    bufferRef.current = '';
    lastKeyTimeRef.current = 0;

    if (barcode.length >= 3) {
      setLastScan(barcode);
      setScanCount(prev => prev + 1);
      onScanRef.current?.(barcode);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e) {
      const target = e.target;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Allow scanning when focused on the search input (scanner-friendly field)
      const isSearchInput =
        searchInputRef?.current && target === searchInputRef.current;

      // Block when focused on other input fields
      if (isInput && !isSearchInput) return;

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (bufferRef.current.length > 0) {
          processBuffer();
        }
        return;
      }

      // Only buffer printable single characters
      if (e.key.length !== 1) return;

      if (bufferRef.current.length === 0 || elapsed <= CHAR_INTERVAL_MS) {
        bufferRef.current += e.key;
        lastKeyTimeRef.current = now;

        // If focused on search input, prevent the character from being typed
        // so the barcode doesn't appear character-by-character
        if (isSearchInput && bufferRef.current.length > 1) {
          e.preventDefault();
        }

        // Reset idle timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          // If enough chars arrived quickly, treat as scan
          if (bufferRef.current.length >= 3) {
            processBuffer();
          } else {
            // Too few chars / too slow — discard (manual typing)
            bufferRef.current = '';
            lastKeyTimeRef.current = 0;
          }
          timeoutRef.current = null;
        }, IDLE_TIMEOUT_MS);
      } else {
        // Gap too long — reset buffer (manual typing resumed)
        bufferRef.current = e.key;
        lastKeyTimeRef.current = now;

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          bufferRef.current = '';
          lastKeyTimeRef.current = 0;
          timeoutRef.current = null;
        }, IDLE_TIMEOUT_MS);
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, searchInputRef, processBuffer]);

  return { lastScan, scanCount };
}
