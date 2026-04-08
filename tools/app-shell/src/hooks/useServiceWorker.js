import { useEffect, useCallback, useRef } from 'react';

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

    // When autoUpdate + skipWaiting + clientsClaim are active, a new SW
    // activates and claims clients immediately. The 'controllerchange' event
    // fires on every client when this happens — reload to pick up new assets.
    let reloading = false;
    function handleControllerChange() {
      if (reloading) return;
      reloading = true;
      onUpdateRef.current?.();
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      handleControllerChange,
    );

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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  /** Delete every cache entry and unregister the SW, then reload */
  const clearCacheAndReload = useCallback(async () => {
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
  }, []);

  /** Manually trigger an update check (useful on route changes) */
  const checkForUpdate = useCallback(() => {
    navigator.serviceWorker?.getRegistration().then((reg) => {
      reg?.update();
    });
  }, []);

  return { clearCacheAndReload, checkForUpdate };
}
