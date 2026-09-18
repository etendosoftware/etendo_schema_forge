import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { fetchMenuTree, collectAllowedIds, MENU_ACCESS_UNREACHABLE } from '@/lib/menuTree.js';

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
    isAuthenticated, isSessionReady, accessLoaded, authRevision, menuAccess,
    captureSession, isCurrentSession,
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
    // Older app-shell-core releases do not publish accessLoaded. Treat an
    // omitted value as legacy compatibility, while still waiting when a newer
    // core explicitly says the access snapshot is not loaded.
    if (!isSessionReady || (accessLoaded !== undefined && !accessLoaded)) {
      setAllowedIds(undefined);
      return undefined;
    }
    // ETP-5189 — AuthContext already fetches the role-filtered menu as part of
    // its access snapshot so menu-only permission changes participate in the
    // same refresh/revision. Reuse that map instead of issuing a second
    // /sws/neo/listmenu request from the layout. The undefined check preserves
    // compatibility with older app-shell-core versions that do not expose
    // menuAccess yet; those versions retain the fetch fallback below.
    if (menuAccess !== undefined) {
      // ETP-5375 — a PLAIN empty object is now a confirmed, resolved allow set of zero
      // ids (the role — or lack of one — legitimately grants no window/process access,
      // per ETP-4514) and must filter to an empty Set so AppLayout's blocking screen
      // fires. Only the reserved MENU_ACCESS_UNREACHABLE sentinel — set by App.jsx's
      // fetchMenuAccess() when SFListMenu is aborted/unreachable/times out — means
      // "don't filter" (fail open). Collapsing both into "empty === fail-open" (the
      // previous behavior) made the blocking screen impossible to ever reach: a
      // genuinely zero-access role and an unreachable menu webhook both serialized to
      // the same `{}` by the time they got here.
      if (menuAccess[MENU_ACCESS_UNREACHABLE]) {
        setAllowedIds(null);
      } else {
        setAllowedIds(new Set(Object.keys(menuAccess)));
      }
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
  }, [isAuthenticated, isSessionReady, accessLoaded, authRevision, menuAccess, captureSession, isCurrentSession]);

  return allowedIds;
}
