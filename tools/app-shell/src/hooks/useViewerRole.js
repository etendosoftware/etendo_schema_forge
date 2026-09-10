import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { fetchMenuTree } from '@/lib/menuTree.js';

/**
 * Returns the CURRENT LOGGED-IN VIEWER's own role identity (from SFListMenu's
 * `viewerRoleId`/`viewerIsClientAdmin`, see com.etendoerp.go docs/neo-headless.md §8) — NOT the
 * record currently being viewed. Standalone and reusable by any component; not coupled to
 * DetailView or any specific window.
 *
 * Same three-state convention as `useRoleMenu()` (`lib/menuTree.js`-backed sibling hook):
 * - `undefined` — the fetch is still in flight (authenticated, first render). Callers should
 *   treat this as "unknown viewer role" and fail closed (hide permission-gated UI) rather than
 *   showing it optimistically.
 * - `null` — unauthenticated, the fetch failed, or the caller has no role assigned at all.
 *   Callers must treat this the same as "not admin" — fail closed, never fail open.
 * - `{ roleId: string, isClientAdmin: boolean }` — resolved successfully.
 *
 * **Deliberately does NOT share a fetch/cache with `useRoleMenu()`**, even though both call
 * `fetchMenuTree()` and a component tree that mounts both (e.g. `AppLayout` + the User window)
 * pays for two `SFListMenu` requests instead of one. Considered a shared in-flight/cache in
 * `lib/menuTree.js`: rejected because that file's own test suite
 * (`lib/__tests__/menuTree.vitest.js`) has 5 `fetchMenuTree()` tests that each mock
 * `globalThis.fetch` fresh and assert an independent, uncached call — a shared cache would
 * either break all five or require rewriting them to manage cache state, to save one extra
 * one-time `GET` per session. Not worth it: this is a per-session cost, not per-render or
 * per-navigation. Revisit only if `useViewerRole()` grows enough call sites that the duplicate
 * request becomes an actual, measured problem.
 */
export function useViewerRole() {
  const { isAuthenticated } = useAuth();
  const [viewerRole, setViewerRole] = useState(undefined);

  useEffect(() => {
    if (!isAuthenticated) {
      setViewerRole(null);
      return undefined;
    }
    setViewerRole(undefined);
    let cancelled = false;
    fetchMenuTree()
      .then((data) => {
        if (cancelled) return;
        if (data?.viewerRoleId == null) {
          setViewerRole(null);
          return;
        }
        setViewerRole({
          roleId: String(data.viewerRoleId),
          isClientAdmin: !!data.viewerIsClientAdmin,
        });
      })
      .catch(() => {
        if (!cancelled) setViewerRole(null);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  return viewerRole;
}
