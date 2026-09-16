import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { fetchMenuTree, collectAllowedIds } from '@/lib/menuTree.js';

/**
 * Returns the set of windowId/processId/obuiappProcessId values the current role can
 * reach, per SFListMenu (com.etendoerp.go docs/neo-headless.md §8).
 *
 * Three distinct return values, deliberately not collapsed into one "falsy" state:
 * - `undefined` — the fetch is still in flight (authenticated, first render). Callers
 *   should treat this as "filter to nothing yet" (grow the sidebar in as data arrives)
 *   rather than "don't filter," to avoid a flash-of-full-menu-then-shrink on load.
 * - `null` — resolved: unauthenticated, or the fetch failed. Callers should treat this
 *   as "don't filter" so the sidebar degrades gracefully (fully unfiltered) if the
 *   webhook is unreachable, matching current mock-mode behavior.
 * - `Set<string>` — resolved successfully; the real allowed-id set.
 */
export function useRoleMenu() {
  const {
    isAuthenticated, isSessionReady, authRevision, captureSession, isCurrentSession,
  } = useAuth();
  const [allowedIds, setAllowedIds] = useState(undefined);

  useEffect(() => {
    if (!isAuthenticated) {
      setAllowedIds(null);
      return undefined;
    }
    // Authenticated but not yet coherent (a refresh/context change may still be in flight):
    // keep returning `undefined` rather than fetching against a session that might change
    // out from under us before the request resolves.
    if (!isSessionReady) {
      setAllowedIds(undefined);
      return undefined;
    }
    // Reset to the in-flight state on every new authenticated fetch — otherwise a
    // login (isAuthenticated flipping false -> true without a full page reload)
    // would leave `allowedIds` at the previous `null` from the unauthenticated
    // branch until this fetch resolves, re-enabling the unfiltered sidebar and
    // reintroducing the flash-of-full-menu-then-shrink this hook exists to avoid.
    setAllowedIds(undefined);
    const snapshot = captureSession();
    fetchMenuTree()
      .then((data) => {
        if (!isCurrentSession(snapshot)) return;
        setAllowedIds(collectAllowedIds(data?.tree));
      })
      .catch(() => {
        if (isCurrentSession(snapshot)) setAllowedIds(null);
      });
    return undefined;
  }, [isAuthenticated, isSessionReady, authRevision, captureSession, isCurrentSession]);

  return allowedIds;
}
