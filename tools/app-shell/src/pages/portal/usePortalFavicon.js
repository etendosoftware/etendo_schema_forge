import { useEffect } from 'react';

/**
 * The favicon's root-absolute URL, following the Vite base (`/` today).
 *
 * @param {string} [base] the base the app is served from (`import.meta.env.BASE_URL`)
 */
export function portalFaviconHref(base = import.meta.env?.BASE_URL ?? '/') {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}favicon.png`;
}

/** Whether an `href` attribute is relative to the page (not `/…`, `//…`, a scheme or `data:`). */
function isRelative(href) {
  return Boolean(href) && !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href);
}

/**
 * Points the tab icon at the root favicon while a portal page is shown (ETP-6209, prod bug).
 *
 * `index.html` declares the icon relative (`./favicon.png`). On `/portal/<token>` and
 * `/portal/decision/<token>` the browser resolves that under the portal path, the server refuses
 * it, and the tab shows a generic globe. `index.html` and the shared shell stay as they are (user
 * decision); while a portal page is mounted, a relative icon link is set to the root-absolute
 * favicon, and the original `href` is put back on unmount. No icon link, or an already absolute
 * one: nothing to do.
 */
export function usePortalFavicon() {
  useEffect(() => {
    const link = typeof document === 'undefined' ? null : document.querySelector('link[rel~="icon"]');
    const original = link?.getAttribute('href');
    if (!link || !isRelative(original)) return undefined;
    link.setAttribute('href', portalFaviconHref());
    return () => { link.setAttribute('href', original); };
  }, []);
}
