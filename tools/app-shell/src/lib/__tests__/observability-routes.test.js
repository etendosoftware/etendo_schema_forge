import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sanitizeSentryEvent } from '@etendosoftware/app-shell-core/observability/adapters/sentry';
import { sanitizeMixpanelEvent } from '@etendosoftware/app-shell-core/observability/adapters/mixpanel';
import { sanitizeRumRequest } from '@etendosoftware/app-shell-core/observability/adapters/rum';

// ETP-4578 H7 (D5) — the host's REAL routes, through the three providers.
//
// The route table is read from runtime-routes.jsx, so a route added there without a row
// below turns this test red instead of shipping un-reviewed. Each concrete pathname is then
// sent through what each provider actually does with a route:
//   - Sentry: the transaction name;
//   - Mixpanel: `$current_url` (URL mode `path`);
//   - RUM: the page id in an event's metadata.
// The expected values are the ones MEASURED against the host's own normalizeRoute on
// 2026-09-29 (frozen in the core's route-golden.test.js): a record's own page is `:recordId`
// as the router reports it and `:id` as `window.location` does (it carries the `/go` base
// path); a word is never an id.
const TOKEN = 'tok-abcdef0123456789';
const RECORD = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const WINDOW = 'sales-order';
const BASE = '/go';

const SAMPLE_PARAMS = { ':token': TOKEN, ':recordId': RECORD, ':windowName': WINDOW };

// Routes with a parameter, and what each form must become.
const PARAMETERIZED = {
  'portal/:token': { router: '/portal/:recordId', browser: '/go/portal/:id' },
  ':windowName/:recordId': { router: `/${WINDOW}/:recordId`, browser: `/go/${WINDOW}/:id` },
  ':windowName': { router: `/${WINDOW}`, browser: `/go/${WINDOW}` },
  'artifacts/:windowName': { router: `/artifacts/${WINDOW}`, browser: `/go/artifacts/${WINDOW}` },
};

// KNOWN LIMIT, pinned so that fixing it turns this test red. A route whose first segment is
// 12+ characters mixing letters and digits reads as an id to the core's scrub, which runs on the
// route AFTER it is normalized and does not know the string is a route. The host has always kept
// a first segment as the screen name. Over-collapsing loses the page's name; it leaks nothing.
// Fixing it means routing `gateway.page` and the three adapters through a route-aware sanitize
// (a core change: new preview, new repin).
const KNOWN_COLLAPSED = {
  'oauth2-clients': { router: '/:id', browser: '/go/:recordId' },
};

// Routes that live inside a window (not in runtime-routes.jsx) and were called out in review.
const WINDOW_INTERNAL = [
  { path: '/settings/organization/fiscal-configuration/new', router: '/settings/organization/fiscal-configuration/new', browser: '/go/settings/organization/fiscal-configuration/new' },
  { path: `/${WINDOW}/new`, router: `/${WINDOW}/new`, browser: `/go/${WINDOW}/new` },
  { path: `/${WINDOW}/${RECORD}/lines`, router: `/${WINDOW}/:id/lines`, browser: `/go/${WINDOW}/:id/lines` },
];

function routePaths() {
  const source = readFileSync(fileURLToPath(new URL('../../runtime-routes.jsx', import.meta.url)), 'utf8');
  return [...source.matchAll(/(?:path:|lazyRoute\()\s*'([^']+)'/g)].map((match) => match[1]);
}

function expand(pattern) {
  return `/${pattern.split('/').map((segment) => SAMPLE_PARAMS[segment] ?? segment).join('/')}`;
}

/** What each provider sends for `pathname`, given whether it is the router's or the browser's form. */
function throughProviders(pathname) {
  const sentry = sanitizeSentryEvent({ type: 'transaction', transaction: pathname }, {}).transaction;
  const mixpanel = sanitizeMixpanelEvent(
    { event: 'page_view', properties: {} },
    { allowedKeys: [], currentUrl: () => `https://go.etendo.cloud${pathname}`, referrer: () => '' },
  ).properties.$current_url;
  const rum = JSON.parse(sanitizeRumRequest({
    RumEvents: [{ id: '1', timestamp: 1, type: 'com.amazon.rum.page_view_event', metadata: JSON.stringify({ pageId: pathname }), details: '{}' }],
  }).RumEvents[0].metadata).pageId;
  return { sentry, mixpanel, rum };
}

function assertAllProviders(pathname, expected, label) {
  const out = throughProviders(pathname);
  assert.deepEqual(out, { sentry: expected, mixpanel: expected, rum: expected }, `${label}: ${pathname}`);
}

describe('real host routes through Sentry, Mixpanel and RUM (ETP-4578 H7)', () => {
  const patterns = routePaths();

  it('reads the route table, so the test cannot go stale silently', () => {
    assert.ok(patterns.length >= 20, `expected the host route table, found ${patterns.length} paths`);
    assert.ok(patterns.includes('portal/:token'));
    assert.ok(patterns.includes(':windowName/:recordId'));
  });

  it('has a reviewed expectation for every parameterized route the host declares', () => {
    const parameterized = patterns.filter((pattern) => pattern.includes(':'));
    for (const pattern of parameterized) {
      assert.ok(PARAMETERIZED[pattern], `route "${pattern}" has no row in PARAMETERIZED: decide how it must be normalized`);
    }
  });

  for (const pattern of routePaths().filter((p) => p.includes(':'))) {
    const expected = PARAMETERIZED[pattern];
    if (!expected) continue;
    it(`${pattern}: ${expected.router} as the router reports it, ${expected.browser} as the browser does`, () => {
      assertAllProviders(expand(pattern), expected.router, 'router');
      assertAllProviders(`${BASE}${expand(pattern)}`, expected.browser, 'browser');
    });
  }

  it('leaves every route without a parameter exactly as it is, in both forms', () => {
    for (const pattern of patterns.filter((p) => !p.includes(':') && !KNOWN_COLLAPSED[p])) {
      assertAllProviders(`/${pattern}`, `/${pattern}`, 'router');
      assertAllProviders(`${BASE}/${pattern}`, `${BASE}/${pattern}`, 'browser');
    }
  });

  it('pins the known over-collapsed routes, and every one must still be a route of the host', () => {
    for (const [pattern, { router, browser }] of Object.entries(KNOWN_COLLAPSED)) {
      assert.ok(patterns.includes(pattern), `${pattern} is no longer a host route: remove it from KNOWN_COLLAPSED`);
      assertAllProviders(`/${pattern}`, router, 'router (known limit)');
      assertAllProviders(`${BASE}/${pattern}`, browser, 'browser (known limit)');
    }
  });

  for (const { path, router, browser } of WINDOW_INTERNAL) {
    it(`window route ${path}`, () => {
      assertAllProviders(path, router, 'router');
      assertAllProviders(`${BASE}${path}`, browser, 'browser');
    });
  }

  it('never lets a query, fragment or token survive in any provider', () => {
    const dirty = `/portal/${TOKEN}?code=sh0rtC0de42#access_token=abc`;
    for (const [provider, value] of Object.entries(throughProviders(dirty))) {
      assert.equal(value, '/portal/:recordId', provider);
    }
  });
});
