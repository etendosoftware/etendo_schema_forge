import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GTM_ID,
  installGtm,
  isGtmInstalled,
  resolveGtmId,
  showCookieBanner,
} from '../gtm.js';

/**
 * ETP-6363 — marketing's tag container loads on the production host only, never in a support
 * session, and the cookie settings reopen HubSpot's banner.
 *
 * @covers tools/app-shell/src/lib/marketing/gtm.js
 */
describe('resolveGtmId', () => {
  it('loads the app container on the production host', () => {
    expect(resolveGtmId({ hostname: 'app.etendo.ai' })).toBe(DEFAULT_GTM_ID);
    expect(resolveGtmId({ hostname: 'APP.ETENDO.AI' })).toBe(DEFAULT_GTM_ID);
  });

  it('loads nothing on a developer machine, a staging host or in a support session', () => {
    expect(resolveGtmId({ hostname: 'localhost' })).toBeNull();
    expect(resolveGtmId({ hostname: 'staging.etendo.ai' })).toBeNull();
    expect(resolveGtmId({ hostname: 'app.etendo.ai', supportSession: true })).toBeNull();
    expect(resolveGtmId({ hostname: 'app.etendo.ai', env: { VITE_GTM_ENABLED: 'false' } })).toBeNull();
  });

  it('takes the hosts and the container from the build when set', () => {
    const env = { VITE_GTM_HOSTS: 'local.etendo.ai, staging.etendo.ai', VITE_GTM_ID: 'GTM-TEST1' };
    expect(resolveGtmId({ hostname: 'local.etendo.ai', env })).toBe('GTM-TEST1');
    expect(resolveGtmId({ hostname: 'app.etendo.ai', env })).toBeNull();
    expect(resolveGtmId({ hostname: 'app.etendo.ai', env: { VITE_GTM_ID: 'not-a-container' } })).toBeNull();
  });
});

describe('installGtm', () => {
  it('starts the dataLayer and adds the container script once', () => {
    const win = {};
    expect(installGtm('GTM-TEST1', { win, doc: document })).toBe(true);
    expect(installGtm('GTM-TEST1', { win, doc: document })).toBe(false);

    expect(isGtmInstalled(win)).toBe(true);
    expect(win.dataLayer[0]).toMatchObject({ event: 'gtm.js' });
    const scripts = [...document.querySelectorAll('script[src*="googletagmanager.com/gtm.js"]')];
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toContain('id=GTM-TEST1');
    expect(scripts[0].async).toBe(true);
  });

  it('does nothing without a container', () => {
    const win = {};
    expect(installGtm(null, { win, doc: document })).toBe(false);
    expect(isGtmInstalled(win)).toBe(false);
    expect(win.dataLayer).toBeUndefined();
  });
});

describe('showCookieBanner', () => {
  it('asks HubSpot to show its banner again', () => {
    const win = {};
    showCookieBanner(win);
    expect(win._hsp).toEqual([['showBanner']]);
  });
});
