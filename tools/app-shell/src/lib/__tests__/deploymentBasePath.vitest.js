// `.vitest.js` (jsdom), not `.test.js` (Node test runner): `getRouterBase()` reads the real
// `window.location.pathname` global, and this project's `npm test` (`node --test ...`) runs
// under plain Node with no DOM globals at all — `typeof window` is `'undefined'` there, so a
// `.test.js` file would throw on the very first call. `src/lib/__tests__/health-events.vitest.js`
// is the existing precedent for stubbing `window.location` this way (`Object.defineProperty`),
// so this file follows the same convention and naming.

import { describe, it, expect, afterEach } from 'vitest';
import { getRouterBase } from '../deploymentBasePath.js';

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
    configurable: true,
  });
}

describe('getRouterBase', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('returns an empty string when the pathname has no /web/ segment', () => {
    setPathname('/warehouse/abc123');
    expect(getRouterBase()).toBe('');
  });

  it('returns an empty string at the domain root', () => {
    setPathname('/');
    expect(getRouterBase()).toBe('');
  });

  it('returns contextPath + moduleSegment for a pathname one segment past the module', () => {
    setPathname('/etendo/web/com.etendoerp.go/warehouse/abc123');
    expect(getRouterBase()).toBe('/etendo/web/com.etendoerp.go');
  });

  it('resolves to the same 2-segment base regardless of how many segments sit past the module — this is the exact "strip last N segments" bug class the helper exists to avoid (ETP-5083 review)', () => {
    setPathname('/etendo/web/com.etendoerp.go/warehouse/abc123/something-deeper');
    expect(getRouterBase()).toBe('/etendo/web/com.etendoerp.go');
  });

  it('handles a context path with multiple segments before /web/, mirroring App.jsx detectBasePath', () => {
    setPathname('/some/nested/context/web/module-name/x');
    expect(getRouterBase()).toBe('/some/nested/context/web/module-name');
  });

  // Sentinel/QA gap-fill (ETP-5083): Tomcat deployed at ROOT (no context path at all) still has
  // a `/web/<module>` segment right at the start of the pathname — `webIdx === 0`, so
  // `contextPath` is `''` rather than absent. Not the same code path as the "no /web/ marker"
  // tests above (those hit the early `return ''`); this one exercises the substring/join branch
  // with an empty contextPath, mirroring App.jsx's own `webIdx !== -1` branch.
  it('handles a root-deployed Tomcat (no context path before /web/)', () => {
    setPathname('/web/com.etendoerp.go/warehouse/abc123');
    expect(getRouterBase()).toBe('/web/com.etendoerp.go');
  });
});
