import { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'dashboard_date_range';

const VALID_RANGES = new Set(['lastYear', 'last90d', 'last30d', 'mtd', 'ytd']);

const DEFAULT_RANGE = 'lastYear';

// The selected range is scoped to the browser session (sessionStorage), so it
// survives module navigation within a session but resets to the default when a
// new session starts. It is also cleared explicitly on logout via
// clearStoredDateRange() to reset logout + re-login within the same tab.
function readStoredRange() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && VALID_RANGES.has(stored)) return stored;
  } catch {
    // ignore
  }
  return DEFAULT_RANGE;
}

/** Clears the persisted range so the next session starts at the default. */
export function clearStoredDateRange() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    // Also purge the legacy localStorage key from before the sessionStorage
    // migration so pre-existing sessions don't leave an orphaned value behind.
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const DashboardDateRangeContext = createContext(null);

export function DashboardDateRangeProvider({ children }) {
  const [range, setRangeState] = useState(readStoredRange);

  const setRange = useCallback((value) => {
    if (!VALID_RANGES.has(value)) return;
    setRangeState(value);
    try {
      sessionStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }, []);

  return (
    <DashboardDateRangeContext.Provider value={{ range, setRange }}>
      {children}
    </DashboardDateRangeContext.Provider>
  );
}

export function useDashboardDateRange() {
  const ctx = useContext(DashboardDateRangeContext);
  if (!ctx) throw new Error('useDashboardDateRange must be used inside DashboardDateRangeProvider');
  return ctx;
}
