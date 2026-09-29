// Source-reading tests for ETP-5456 (sticky-layout follow-up): the 4 sticky
// regions across the fiscal-models custom window must have `position: sticky`
// with the RIGHT `top` value, stacked correctly relative to their sibling
// sticky elements (0, then 49, then 97), and the previously-broken
// `padding-bottom: 100vh; margin-bottom: -100vh` hack on `.fm-349-totals`
// must never come back. jsdom does not compute real sticky positioning, so
// these are plain text/regex assertions against the CSS source, following the
// pattern in FmCommon.test.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, '..', 'fiscal-models.css'), 'utf8');

function ruleBodyFor(selector, source) {
  const idx = source.indexOf(selector);
  assert.ok(idx !== -1, `selector ${selector} not found in CSS`);
  const openBrace = source.indexOf('{', idx);
  const closeBrace = source.indexOf('}', openBrace);
  assert.ok(openBrace !== -1 && closeBrace !== -1, `malformed rule for ${selector}`);
  return source.slice(openBrace, closeBrace + 1);
}

describe('fiscal-models.css — sticky stack (ETP-5456)', () => {
  it('.fm-tabs-sticky is sticky at top: 0 (the outermost sticky bar, z-index 20)', () => {
    const body = ruleBodyFor('.fm-tabs-sticky', css);
    assert.match(body, /position:\s*sticky/);
    assert.match(body, /top:\s*0\b/);
    assert.match(body, /z-index:\s*20/);
  });

  it('.fm-page--freeflow makes .fm-page the real, uninterrupted scrolling ancestor (overflow-y: auto)', () => {
    // `.fm-page`'s own base rule is `overflow: hidden` — it is `.fm-page--freeflow`
    // (applied on the 303/349 detail pages, per FmModel303Page.jsx / FmModel349Page.jsx)
    // that turns it into the real scrolling ancestor every sticky element here resolves
    // its `position: sticky` against.
    const body = ruleBodyFor('.fm-page--freeflow', css);
    assert.match(body, /overflow-y:\s*auto/);
  });

  it('.fm-349-totals is sticky at top: 97px (docks below tabs bar [49] + filter row [48])', () => {
    const body = ruleBodyFor('.fm-349-totals {', css);
    assert.match(body, /position:\s*sticky/);
    assert.match(body, /top:\s*97px/);
  });

  it('.fm-349-totals does NOT declare overflow, transform, filter or contain (would break sticky)', () => {
    const body = ruleBodyFor('.fm-349-totals {', css);
    assert.doesNotMatch(body, /overflow\s*:/);
    assert.doesNotMatch(body, /transform\s*:/);
    assert.doesNotMatch(body, /filter\s*:/);
    assert.doesNotMatch(body, /contain\s*:/);
  });

  it('the old padding-bottom: 100vh / margin-bottom: -100vh divider hack is NOT present on .fm-349-totals', () => {
    const body = ruleBodyFor('.fm-349-totals {', css);
    assert.doesNotMatch(body, /padding-bottom:\s*100vh/);
    assert.doesNotMatch(body, /margin-bottom:\s*-100vh/);
  });

  it('the 100vh divider hack is not present in any actual (non-comment) CSS rule', () => {
    // The explanatory comment right above `.fm-349-totals` deliberately quotes the
    // removed hack verbatim (documenting WHY it was removed) — strip CSS comments
    // before asserting so that prose doesn't trip a false positive.
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(cssWithoutComments, /padding-bottom:\s*100vh/);
    assert.doesNotMatch(cssWithoutComments, /margin-bottom:\s*-100vh/);
  });
});
