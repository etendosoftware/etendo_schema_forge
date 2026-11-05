/** @covers tools/app-shell/src/windows/custom/product/useSidebarCollapsed.js */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarCollapsed, SIDEBAR_COLLAPSED_KEY } from '../useSidebarCollapsed';

describe('useSidebarCollapsed', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('defaults to open when nothing is stored', () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(false);
  });

  it('reads the stored value synchronously on the first render', () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
    const seen = [];
    renderHook(() => { const s = useSidebarCollapsed(); seen.push(s[0]); return s; });
    expect(seen[0]).toBe(true);
  });

  it('writes every change to storage', () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
    act(() => result.current[1](false));
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('false');
  });

  it('survives storage throwing on read and falls back to open', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(false);
  });

  it('keeps working in memory when storage throws on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });

  it('treats an unexpected stored value as open', () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'maybe');
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(false);
  });
});
