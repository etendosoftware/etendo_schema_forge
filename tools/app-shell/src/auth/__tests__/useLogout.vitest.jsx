import { renderHook, act } from '@testing-library/react';

// Mock the core auth so we control (and observe) the underlying logout.
const coreLogout = vi.fn();
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: coreLogout }),
}));

import { useLogout } from '../useLogout';

const STORAGE_KEY = 'dashboard_date_range';

describe('useLogout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a stable callback', () => {
    const { result, rerender } = renderHook(() => useLogout());
    const first = result.current;
    expect(typeof first).toBe('function');
    rerender();
    // useCallback keyed on the (stable, mocked) logout keeps the same identity.
    expect(result.current).toBe(first);
  });

  it('clears the persisted range before calling the core logout', () => {
    // Seed both storages, then assert that BY THE TIME the core logout runs the
    // range key is already gone from both. This proves clear-happens-before-
    // logout without depending on how jsdom routes removeItem internally.
    sessionStorage.setItem(STORAGE_KEY, 'mtd');
    localStorage.setItem(STORAGE_KEY, 'ytd');

    let sessionAtLogout = 'unset';
    let localAtLogout = 'unset';
    coreLogout.mockImplementation(() => {
      sessionAtLogout = sessionStorage.getItem(STORAGE_KEY);
      localAtLogout = localStorage.getItem(STORAGE_KEY);
    });

    const { result } = renderHook(() => useLogout());
    act(() => result.current());

    expect(coreLogout).toHaveBeenCalledTimes(1);
    expect(sessionAtLogout).toBeNull();
    expect(localAtLogout).toBeNull();
  });

  it('removes the range key from both sessionStorage and localStorage', () => {
    sessionStorage.setItem(STORAGE_KEY, 'mtd');
    localStorage.setItem(STORAGE_KEY, 'ytd');

    const { result } = renderHook(() => useLogout());
    act(() => result.current());

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(coreLogout).toHaveBeenCalledTimes(1);
  });
});
