import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';

/**
 * ETP-5189 — flags a REAL, post-login change to the current session's access
 * (windowAccess/capabilities/menuAccess, ETP-5195's own silent-refresh diff — see
 * AuthContext.jsx's [ETP-5189] comment on `menuAccess`), so `RoleChangedBanner` can
 * notify the user their role/permissions were updated elsewhere.
 *
 * Deliberately does NOT key off raw `authRevision`: that also bumps on a pure token
 * rotation with no access change (see AuthContext.jsx's `metadataUnchanged` case),
 * which must NOT show this banner. `windowAccess`/`capabilities`/`menuAccess` only
 * change OBJECT REFERENCE when the underlying diff was real — a plain rotation keeps
 * the exact same object instances. Comparing those three references is therefore the
 * precise "did anything the user can see actually change" signal.
 *
 * The first settle (initial login / page load) is captured as a baseline, not a
 * "change" — the banner must never fire on first render, only on a change AFTER the
 * session was already ready.
 *
 * `accessLoaded` gates that first settle so it happens once the REAL access maps
 * have been fetched, not while they're still the initial `{}` placeholder (which
 * would otherwise misread the normal initial-load transition as a "change"). This
 * required exposing `accessLoaded` on `useAuth()`'s value object — it was already
 * tracked internally by `AuthContext.jsx`/`sessionController.js` but never surfaced
 * to consumers before this ticket; confirmed live (2026-09-11) via a stale-session
 * console check that it always read `undefined` here, which silently made this
 * entire hook a no-op — the effect returned before ever reaching the diff logic.
 * Needs the core preview built from `schema_forge_core`'s `feature/ETP-5189` branch
 * AFTER this fix (not the one this repo's `package.json` was pinned to earlier).
 *
 * `dismiss()` — confirmed live (2026-09-11) that a reload is never actually needed
 * for correctness: `useWindowAccess`/`WindowAccessGuard`/`useRoleMenu` all read the
 * SAME live state reactively, so even a currently-open window's own access re-guards
 * itself the instant `windowAccess` updates, no reload required. The banner therefore
 * has no "Reload now" action any more and must be dismissible instead — otherwise it
 * would sit on screen for the rest of the session with no way to clear it. `dismiss`
 * just resets the flag; `baseline.current` is already the LATEST observed triple by
 * that point (updated on every diffed render, not only the very first one), so a
 * SUBSEQUENT genuine change after a dismiss is still compared against the right prior
 * state and correctly re-flags — dismissing does not suppress a later real change.
 *
 * ETP-5423 — `isAuthenticated` is checked FIRST, ahead of `isSessionReady`/
 * `accessLoaded`, because a logout is not one clean transition but two renders in a
 * row that both look like legitimate access settles. `sessionController.js`'s
 * `replace({}, { clear: true })` first publishes `accessLoaded:false` for the
 * now-cleared session; almost immediately after, `AuthContext.jsx`'s own
 * access-bootstrap effect re-fires for that same anonymous session and republishes a
 * SECOND, freshly-allocated set of empty `windowAccess`/`capabilities`/`menuAccess`
 * objects with `accessLoaded:true` — a brand-new object reference settling in, which
 * is exactly the shape this hook is built to treat as a real change. Gating on
 * `isAuthenticated` first means both of logout's own republishes are absorbed as a
 * no-op (baseline and `changed` are simply cleared) rather than diffed against
 * whatever the previous session's baseline happened to be. It also means the
 * following login's first settle starts from `baseline.current === null` again, so
 * it is captured as a fresh baseline (branch above) instead of being compared
 * against a stale triple left over from the session that just ended.
 */
export function useRoleChangeNotice() {
  const { isAuthenticated, isSessionReady, accessLoaded, windowAccess, capabilities, menuAccess } = useAuth();
  const baseline = useRef(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    // ETP-5423 — a logout (isAuthenticated flipping true -> false) is a session
    // boundary, not a permission change to diff. Without this reset, the baseline
    // captured for the just-closed session survives: the render right after
    // logout has accessLoaded:false, so the guard below bails out before it can
    // ever update baseline.current, and the NEXT accessLoaded settle — for the
    // unauthenticated session's own brand-new empty {} access maps — gets diffed
    // against that stale baseline and misreads a plain logout as a real
    // permission change. Mirrors useRoleMenu.js's own isAuthenticated-gated reset
    // (same ETP-5189 ticket). `changed` is reset too: the banner component never
    // unmounts across logout (see App.jsx, mounted as a sibling of AppLayout), so
    // if it was already visible when the user logged out it would otherwise stay
    // visible on the login screen.
    if (!isAuthenticated) {
      baseline.current = null;
      setChanged(false);
      return;
    }
    if (!isSessionReady || !accessLoaded) return;
    const current = { windowAccess, capabilities, menuAccess };
    if (baseline.current === null) {
      baseline.current = current;
      return;
    }
    const isDifferent = baseline.current.windowAccess !== windowAccess
      || baseline.current.capabilities !== capabilities
      || baseline.current.menuAccess !== menuAccess;
    baseline.current = current;
    if (isDifferent) setChanged(true);
  }, [isAuthenticated, isSessionReady, accessLoaded, windowAccess, capabilities, menuAccess]);

  const dismiss = useCallback(() => setChanged(false), []);

  return { changed, dismiss };
}
