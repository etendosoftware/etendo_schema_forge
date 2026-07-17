import { render, screen, act } from '@testing-library/react';
import {
  DashboardDateRangeProvider,
  useDashboardDateRange,
  clearStoredDateRange,
} from '../DashboardDateRangeContext';

const STORAGE_KEY = 'dashboard_date_range';

// Test harness: exposes the context value so tests can read `range` from the
// DOM and drive `setRange` imperatively.
let ctxRef = null;

function Probe() {
  const ctx = useDashboardDateRange();
  ctxRef = ctx;
  return <span data-testid="range">{ctx.range}</span>;
}

function renderProvider() {
  return render(
    <DashboardDateRangeProvider>
      <Probe />
    </DashboardDateRangeProvider>,
  );
}

describe('DashboardDateRangeContext', () => {
  beforeEach(() => {
    ctxRef = null;
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('initial range (readStoredRange via provider mount)', () => {
    it('defaults to lastYear when sessionStorage is empty', () => {
      renderProvider();
      expect(screen.getByTestId('range')).toHaveTextContent('lastYear');
    });

    it('seeds from a valid stored value', () => {
      sessionStorage.setItem(STORAGE_KEY, 'last30d');
      renderProvider();
      expect(screen.getByTestId('range')).toHaveTextContent('last30d');
    });

    it.each(['lastYear', 'last90d', 'last30d', 'mtd', 'ytd'])(
      'accepts the valid stored value %s',
      (value) => {
        sessionStorage.setItem(STORAGE_KEY, value);
        renderProvider();
        expect(screen.getByTestId('range')).toHaveTextContent(value);
      },
    );

    it('falls back to lastYear when the stored value is invalid', () => {
      sessionStorage.setItem(STORAGE_KEY, 'garbage');
      renderProvider();
      expect(screen.getByTestId('range')).toHaveTextContent('lastYear');
    });

    it('does not read the legacy localStorage value', () => {
      // Pre-migration sessions may have left a value in localStorage; it must
      // NOT seed the range (only sessionStorage is read).
      localStorage.setItem(STORAGE_KEY, 'ytd');
      renderProvider();
      expect(screen.getByTestId('range')).toHaveTextContent('lastYear');
    });
  });

  describe('setRange', () => {
    it('updates state and writes a valid value to sessionStorage', () => {
      renderProvider();
      act(() => ctxRef.setRange('mtd'));
      expect(screen.getByTestId('range')).toHaveTextContent('mtd');
      expect(sessionStorage.getItem(STORAGE_KEY)).toBe('mtd');
    });

    it('ignores an invalid value (state and storage unchanged)', () => {
      sessionStorage.setItem(STORAGE_KEY, 'last90d');
      renderProvider();
      expect(screen.getByTestId('range')).toHaveTextContent('last90d');

      act(() => ctxRef.setRange('not-a-range'));

      expect(screen.getByTestId('range')).toHaveTextContent('last90d');
      expect(sessionStorage.getItem(STORAGE_KEY)).toBe('last90d');
    });

    it('does not persist to localStorage', () => {
      renderProvider();
      act(() => ctxRef.setRange('ytd'));
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('clearStoredDateRange', () => {
    it('removes the key from both sessionStorage and localStorage', () => {
      sessionStorage.setItem(STORAGE_KEY, 'last30d');
      localStorage.setItem(STORAGE_KEY, 'ytd');

      clearStoredDateRange();

      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('is a no-op when nothing is stored', () => {
      expect(() => clearStoredDateRange()).not.toThrow();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('reset-on-new-session behavior', () => {
    it('a fresh provider mount after clearStoredDateRange reads the default', () => {
      // Session A: user picks a non-default range.
      const { unmount } = renderProvider();
      act(() => ctxRef.setRange('mtd'));
      expect(sessionStorage.getItem(STORAGE_KEY)).toBe('mtd');
      unmount();

      // Logout clears the persisted range.
      clearStoredDateRange();

      // Session B: a fresh mount must fall back to the default.
      renderProvider();
      expect(screen.getByTestId('range')).toHaveTextContent('lastYear');
    });
  });

  describe('useDashboardDateRange guard', () => {
    it('throws when used outside the provider', () => {
      // Suppress the expected React error boundary noise for this render.
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<Probe />)).toThrow(
        /must be used inside DashboardDateRangeProvider/,
      );
      spy.mockRestore();
    });
  });
});
