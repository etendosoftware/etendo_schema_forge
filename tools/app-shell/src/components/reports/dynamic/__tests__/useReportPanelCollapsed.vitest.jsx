// @covers tools/app-shell/src/components/reports/dynamic/useReportPanelCollapsed.js
let authValue = { username: 'ana' };
vi.mock('@etendosoftware/app-shell-core/auth', () => ({ useAuthOptional: () => authValue }));

import { act, renderHook } from '@testing-library/react';
import { useReportPanelCollapsed } from '../useReportPanelCollapsed.js';

const KEY = 'etendo.reports.panel.collapsed:';

beforeEach(() => {
  authValue = { username: 'ana' };
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useReportPanelCollapsed', () => {
  it('starts expanded and persists a manual toggle under the username key', () => {
    const { result } = renderHook(() => useReportPanelCollapsed());
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem(`${KEY}ana`)).toBe('1');
    act(() => result.current.setCollapsed(false));
    expect(localStorage.getItem(`${KEY}ana`)).toBe('0');
  });

  it('reads the saved value, and a different username has its own', () => {
    localStorage.setItem(`${KEY}ana`, '1');
    expect(renderHook(() => useReportPanelCollapsed()).result.current.collapsed).toBe(true);
    authValue = { username: 'bob' };
    expect(renderHook(() => useReportPanelCollapsed()).result.current.collapsed).toBe(false);
  });

  it('falls back to the anonymous key without auth', () => {
    authValue = null;
    const { result } = renderHook(() => useReportPanelCollapsed());
    act(() => result.current.setCollapsed(true));
    expect(localStorage.getItem(`${KEY}anonymous`)).toBe('1');
  });

  it('persist:false changes the state but writes nothing', () => {
    const { result } = renderHook(() => useReportPanelCollapsed());
    act(() => result.current.setCollapsed(true, { persist: false }));
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem(`${KEY}ana`)).toBeNull();
  });

  it('tolerates a throwing localStorage (read and write) and still toggles', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useReportPanelCollapsed());
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
  });
});
