// @covers tools/app-shell/src/pages/portal/usePortalFavicon.js
// New file: the hook is the portal's only tab-icon handling and no existing portal test renders a
// bare hook; driving it through PortalPage would need the whole page's mocks for three DOM checks.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { portalFaviconHref, usePortalFavicon } from '../usePortalFavicon.js';

function addIconLink(href) {
  const link = document.createElement('link');
  link.setAttribute('rel', 'icon');
  link.setAttribute('href', href);
  document.head.appendChild(link);
  return link;
}

afterEach(() => {
  document.head.querySelectorAll('link[rel~="icon"]').forEach((link) => link.remove());
});

describe('usePortalFavicon', () => {
  it('points a relative icon link at the root favicon while mounted, and restores it on unmount', () => {
    const link = addIconLink('./favicon.png');

    const { unmount } = renderHook(() => usePortalFavicon());
    expect(link.getAttribute('href')).toBe(portalFaviconHref());
    expect(link.getAttribute('href').startsWith('/')).toBe(true);

    unmount();
    expect(link.getAttribute('href')).toBe('./favicon.png');
  });

  it('leaves an already absolute icon link alone', () => {
    const link = addIconLink('/favicon.png');

    const { unmount } = renderHook(() => usePortalFavicon());
    unmount();

    expect(link.getAttribute('href')).toBe('/favicon.png');
  });

  it('does nothing when the page has no icon link', () => {
    const { unmount } = renderHook(() => usePortalFavicon());
    unmount();

    expect(document.head.querySelector('link[rel~="icon"]')).toBeNull();
  });

  it('follows the Vite base', () => {
    expect(portalFaviconHref('/')).toBe('/favicon.png');
    expect(portalFaviconHref('/app')).toBe('/app/favicon.png');
  });
});
