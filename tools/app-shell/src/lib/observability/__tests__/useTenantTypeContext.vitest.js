// @covers tools/app-shell/src/lib/observability/useTenantTypeContext.js
/**
 * ETP-6072 — `useTenantTypeContext` keeps `tenant_type` in the common event context: absent until
 * the environment list resolves the current tenant, updated when it changes, cleared on unmount.
 */
import { renderHook } from '@testing-library/react';

const useEnvironmentSwitchMock = vi.fn();
vi.mock('@/hooks/useEnvironmentSwitch.js', () => ({
  useEnvironmentSwitch: () => useEnvironmentSwitchMock(),
}));

const setContextMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../observability.js', () => ({
  setContext: (...args) => setContextMock(...args),
}));

import { useTenantTypeContext } from '../useTenantTypeContext.js';

const environments = [
  { clientId: 'C-DEMO', environmentType: 'DEMO' },
  { clientId: 'C-PROD', environmentType: 'PRODUCTIVE' },
];

describe('useTenantTypeContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leaves tenant_type out while the environment list is loading', () => {
    useEnvironmentSwitchMock.mockReturnValue({ environments: [], loading: true, currentClientId: 'C-PROD' });

    renderHook(() => useTenantTypeContext());

    expect(setContextMock).toHaveBeenCalledWith({ tenant_type: undefined });
  });

  it('sets tenant_type once the list resolves the current tenant', () => {
    useEnvironmentSwitchMock.mockReturnValue({ environments: [], loading: true, currentClientId: 'C-PROD' });
    const { rerender } = renderHook(() => useTenantTypeContext());

    useEnvironmentSwitchMock.mockReturnValue({ environments, loading: false, currentClientId: 'C-PROD' });
    rerender();

    expect(setContextMock).toHaveBeenLastCalledWith({ tenant_type: 'productive' });
  });

  it('follows a change of tenant, but not a re-render that resolves the same type', () => {
    useEnvironmentSwitchMock.mockReturnValue({ environments, loading: false, currentClientId: 'C-PROD' });
    const { rerender } = renderHook(() => useTenantTypeContext());

    useEnvironmentSwitchMock.mockReturnValue({ environments: [...environments], loading: false, currentClientId: 'C-PROD' });
    rerender();
    expect(setContextMock).toHaveBeenCalledOnce();

    useEnvironmentSwitchMock.mockReturnValue({ environments, loading: false, currentClientId: 'C-DEMO' });
    rerender();
    expect(setContextMock).toHaveBeenLastCalledWith({ tenant_type: 'demo' });
  });

  it('reports settled only once the list has answered or failed', () => {
    useEnvironmentSwitchMock.mockReturnValue({ environments: [], loading: true, currentClientId: 'C-PROD' });
    const { result, rerender } = renderHook(() => useTenantTypeContext());
    expect(result.current.settled).toBe(false);

    useEnvironmentSwitchMock.mockReturnValue({ environments: [], loading: false, currentClientId: 'C-PROD' });
    rerender();
    expect(result.current.settled).toBe(true);
    expect(setContextMock).toHaveBeenLastCalledWith({ tenant_type: undefined });
  });

  it('clears tenant_type on unmount', () => {
    useEnvironmentSwitchMock.mockReturnValue({ environments, loading: false, currentClientId: 'C-DEMO' });
    const { unmount } = renderHook(() => useTenantTypeContext());

    unmount();

    expect(setContextMock).toHaveBeenLastCalledWith({ tenant_type: undefined });
  });
});
