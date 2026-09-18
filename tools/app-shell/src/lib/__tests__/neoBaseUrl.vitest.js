// `.vitest.js` (jsdom), not `.test.js` (Node test runner): every function here reads the real
// `window.location.pathname`, and `npm test` runs `node --test` with no DOM globals at all.
// `Object.defineProperty(window, 'location', ...)` is the existing convention for stubbing it
// (see `deploymentBasePath.vitest.js`); `import.meta.env` is a real mutable object under
// Vitest, which is how `AppIframeHost.vitest.jsx` and `SideMenu.vitest.jsx` set VITE_* flags.

import { describe, it, expect, afterEach } from 'vitest';
import { detectBasePath, getNeoBaseUrl, getSpecBaseUrl } from '../neoBaseUrl.js';

const originalLocation = window.location;

function setPathname(pathname) {
  Object.defineProperty(window, 'location', { value: { pathname }, writable: true, configurable: true });
}

afterEach(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
  delete import.meta.env.VITE_API_BASE;
  delete import.meta.env.VITE_MOCK;
});

describe('detectBasePath', () => {
  it('reports no context path at the domain root, and "/" as the router basename', () => {
    setPathname('/');
    expect(detectBasePath()).toEqual({ apiBase: '', routerBase: '/' });
  });

  it('takes the context path from the segment preceding /web/', () => {
    setPathname('/etendo/web/com.etendoerp.go/product');
    expect(detectBasePath()).toEqual({
      apiBase: '/etendo',
      routerBase: '/etendo/web/com.etendoerp.go',
    });
  });

  // Same case as `getRouterBase`'s: a root-deployed Tomcat has `/web/` at index 0, so the
  // context path is empty rather than absent — the substring branch, not the early return.
  it('handles a root-deployed Tomcat with no context path before /web/', () => {
    setPathname('/web/com.etendoerp.go/product');
    expect(detectBasePath()).toEqual({ apiBase: '', routerBase: '/web/com.etendoerp.go' });
  });

  it('lets VITE_API_BASE override the detected context path', () => {
    import.meta.env.VITE_API_BASE = '/etendo';
    setPathname('/');
    expect(detectBasePath()).toEqual({ apiBase: '/etendo', routerBase: '/' });
  });
});

describe('getNeoBaseUrl', () => {
  it('hangs NEO off the domain root when there is no context path', () => {
    setPathname('/');
    expect(getNeoBaseUrl()).toBe('/sws/neo');
  });

  it('keeps the deployment context path', () => {
    setPathname('/etendo/web/com.etendoerp.go/first-steps');
    expect(getNeoBaseUrl()).toBe('/etendo/sws/neo');
  });

  // The deployed SPA container is served from a different path than the backend, so it declares
  // the backend explicitly — this is the configuration the ETP-5371 failure shipped under.
  it('keeps the context path VITE_API_BASE declares, whatever route the user is on', () => {
    import.meta.env.VITE_API_BASE = '/etendo';
    setPathname('/first-steps');
    expect(getNeoBaseUrl()).toBe('/etendo/sws/neo');
  });

  it('points at the mock server under VITE_MOCK', () => {
    import.meta.env.VITE_MOCK = 'true';
    setPathname('/');
    expect(getNeoBaseUrl()).toBe('/api');
  });
});

describe('getSpecBaseUrl', () => {
  it('appends the spec to the NEO root', () => {
    setPathname('/etendo/web/com.etendoerp.go/product');
    expect(getSpecBaseUrl('product')).toBe('/etendo/sws/neo/product');
  });

  /**
   * ETP-5371 — the regression this module exists for.
   *
   * `WindowLoader` builds `${API_BASE_URL}/${windowName}` for the Products window; the First
   * Steps checklist opens the SAME import from a route that never passes through
   * `WindowLoader`, and used to build its base from `getApiBase()` — the deployment prefix
   * (`/etendo`) rather than the spec URL. Both are non-empty strings, so nothing downstream
   * could tell them apart: the batch POST went to `/batch` and the duplicate pre-check to
   * `/etendo/product`. Asserting equality here is the check that was missing — it fails if
   * either entry point's derivation drifts from the other's.
   */
  it('matches what WindowLoader builds for the same window', () => {
    import.meta.env.VITE_API_BASE = '/etendo';
    setPathname('/first-steps');

    const windowLoaderBase = `${getNeoBaseUrl()}/product`; // WindowLoader.jsx:95
    expect(getSpecBaseUrl('product')).toBe(windowLoaderBase);
    expect(getSpecBaseUrl('product')).toBe('/etendo/sws/neo/product');
  });
});
