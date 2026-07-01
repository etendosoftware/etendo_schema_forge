import { useEffect, useCallback, useRef } from 'react';

export async function clearServiceWorkerStateAndReload() {
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.unregister();
    }
  } finally {
    window.location.reload();
  }
}


/**
 * True when focus is in an editable control (text input, textarea, select, or
 * a contentEditable region). Used to avoid reloading the page out from under a
 * user who is mid-typing — a reload would discard their input and steal focus.
 */
function isUserEditing() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  );
}

/**
 * Hook to manage service worker updates.
 *
 * Registration is handled by vite-plugin-pwa via injectRegister:'auto', which
 * injects a script tag in the built HTML (autoUpdate mode with skipWaiting +
 * clientsClaim). This hook only:
 * - Listens for SW controller changes (new version activated)
 * - Notifies via onUpdateAvailable when a new SW takes over
 * - Checks for updates on tab focus and route changes
 * - Provides clearCacheAndReload as a last-resort escape hatch
 */
export function useServiceWorker({ onUpdateAvailable } = {}) {
  const onUpdateRef = useRef(onUpdateAvailable);
  onUpdateRef.current = onUpdateAvailable;

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Whether a SW already controlled this page when the hook mounted. On the
    // very first visit the page loads uncontrolled and the freshly-installed SW
    // claims it (clientsClaim) — that first 'controllerchange' carries no newer
    // assets, so reloading would only destroy in-progress input for nothing.
    const hadControllerAtMount = !!navigator.serviceWorker.controller;

    // When autoUpdate + skipWaiting + clientsClaim are active, a new SW
    // activates and claims clients immediately, firing 'controllerchange' on
    // every client. We reload to pick up new assets — but never on top of a
    // user who is mid-typing (see isUserEditing / pendingReload below).
    let reloading = false;
    let pendingReload = false;

    function doReload() {
      if (reloading) return;
      reloading = true;
      onUpdateRef.current?.();
      window.location.reload();
    }

    function handleControllerChange() {
      // Guard 1: first-install claim — nothing newer to load, skip the reload.
      if (!hadControllerAtMount) return;
      // Guard 2: a genuine update arrived. If the user is editing, defer the
      // reload so we don't wipe their input or steal focus. The new SW already
      // controls the page, so fresh assets are served on their next navigation
      // regardless; we flush the deferred reload once focus leaves the field.
      if (isUserEditing()) {
        pendingReload = true;
        return;
      }
      doReload();
    }

    // Flush a deferred reload once the user stops editing. focusout fires before
    // focus settles on the next element, so re-check on the next tick: if focus
    // moved to another editable control we keep waiting, otherwise we reload.
    function handleFocusOut() {
      if (!pendingReload) return;
      setTimeout(() => {
        if (pendingReload && !isUserEditing()) {
          doReload();
        }
      }, 0);
    }

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      handleControllerChange,
    );
    document.addEventListener('focusout', handleFocusOut);

    // Poll for updates when the tab regains focus
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then((reg) => {
          reg?.update();
        });
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange,
      );
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  /** Delete every cache entry and unregister the SW, then reload */
  const clearCacheAndReload = useCallback(() => clearServiceWorkerStateAndReload(), []);

  /** Manually trigger an update check (useful on route changes) */
  const checkForUpdate = useCallback(() => {
    navigator.serviceWorker?.getRegistration().then((reg) => {
      reg?.update();
    });
  }, []);

  return { clearCacheAndReload, checkForUpdate };
}
