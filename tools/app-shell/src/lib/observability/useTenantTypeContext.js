import { useEffect } from 'react';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';
import { setContext } from '../observability.js';
import { resolveTenantType } from './tenantType.js';

/**
 * ETP-6072 — keeps `tenant_type` (`demo` | `productive`) in the common event context, following
 * the tenant the session is inside, and clears it on unmount (sign-out).
 *
 * The environment list loads asynchronously: until it settles the property is left off the
 * events, and it stays off when the list cannot answer (failed read, no matching row, a row with
 * no lifecycle type). Consumers must read its absence as "unknown". Mounting another
 * `useEnvironmentSwitch` costs no extra request: every instance shares one `/sws/go/environments`
 * read through the DataProvider cache (ETP-5051). A company switch is a hard navigation, so the
 * next page resolves the new tenant from scratch.
 *
 * @returns {{ settled: boolean }} `settled` once the list has answered or failed, so a caller can
 *   hold an event until the property is set (`useSessionStartTracking` does, for `session_started`)
 */
export function useTenantTypeContext() {
  const { environments, loading, currentClientId } = useEnvironmentSwitch();
  const tenantType = resolveTenantType(environments, currentClientId);

  useEffect(() => {
    void setContext({ tenant_type: tenantType }); // NOSONAR -- fire-and-forget, same as role_groups.
    return () => {
      void setContext({ tenant_type: undefined }); // NOSONAR -- a signed-out page must not keep the last tenant.
    };
  }, [tenantType]);

  return { settled: !loading };
}
