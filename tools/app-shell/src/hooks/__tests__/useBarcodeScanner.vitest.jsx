import { renderHook, act } from '@testing-library/react';
import { useBarcodeScanner } from '../useBarcodeScanner';

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns lastScan=null and scanCount=0 initially', () => {
    const onScan = vi.fn();
    const { result } = renderHook(() => useBarcodeScanner({ onScan }));
    expect(result.current.lastScan).toBeNull();
    expect(result.current.scanCount).toBe(0);
  });

  it('detects a barcode from rapid keystrokes followed by Enter', () => {
    const onScan = vi.fn();
    const { result } = renderHook(() => useBarcodeScanner({ onScan }));

    act(() => {
      for (const ch of 'ABC123') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onScan).toHaveBeenCalledWith('ABC123');
    expect(result.current.lastScan).toBe('ABC123');
    expect(result.current.scanCount).toBe(1);
  });

  it('ignores short sequences (< 3 chars)', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('does not scan when enabled=false', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, enabled: false }));

    act(() => {
      for (const ch of 'BARCODE') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('fires on idle timeout for rapid chars without Enter', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    act(() => {
      for (const ch of 'SCAN1') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
    });

    // Idle timeout triggers after 100ms
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onScan).toHaveBeenCalledWith('SCAN1');
  });

  // --- Additional branch coverage ---

  it('detects scan with Enter key after rapid input (classic scanner)', () => {
    const onScan = vi.fn();
    const { result } = renderHook(() => useBarcodeScanner({ onScan }));

    act(() => {
      // Simulate rapid scanner input followed by Enter
      for (const ch of 'PROD-456') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onScan).toHaveBeenCalledWith('PROD-456');
    expect(result.current.lastScan).toBe('PROD-456');
    expect(result.current.scanCount).toBe(1);
  });

  it('manual typing (slow keys) does NOT trigger scan', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    // Type first char
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'H', bubbles: true }));
    });

    // Wait longer than CHAR_INTERVAL_MS (80ms) between keystrokes
    act(() => {
      vi.advanceTimersByTime(120);
    });

    // Type second char after gap — this resets the buffer
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(120);
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(120);
    });

    // Press Enter — buffer only has the last char due to gaps
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // Should NOT fire onScan because each keystroke was too slow (gap > 80ms)
    // and the buffer gets reset, so it never accumulates >= 3 chars
    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignores keydown on focused input fields (not search input)', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    // Create an input element and focus it
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      for (const ch of 'BLOCKED') {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onScan).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('allows scanning when focused on searchInputRef', () => {
    const onScan = vi.fn();
    const searchInput = document.createElement('input');
    document.body.appendChild(searchInput);
    const searchInputRef = { current: searchInput };

    renderHook(() => useBarcodeScanner({ onScan, searchInputRef }));

    searchInput.focus();

    act(() => {
      for (const ch of 'SCAN99') {
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onScan).toHaveBeenCalledWith('SCAN99');

    document.body.removeChild(searchInput);
  });

  it('ignores non-printable keys (Shift, Control, etc.)', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('handles multiple consecutive scans and increments scanCount', () => {
    const onScan = vi.fn();
    const { result } = renderHook(() => useBarcodeScanner({ onScan }));

    // First scan
    act(() => {
      for (const ch of 'FIRST') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // Second scan
    act(() => {
      for (const ch of 'SECOND') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onScan).toHaveBeenCalledTimes(2);
    expect(result.current.lastScan).toBe('SECOND');
    expect(result.current.scanCount).toBe(2);
  });

  it('discards buffer when idle timeout fires with < 3 chars', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', bubbles: true }));
    });

    // Idle timeout fires with only 2 chars — discarded
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onScan).not.toHaveBeenCalled();
  });
});
