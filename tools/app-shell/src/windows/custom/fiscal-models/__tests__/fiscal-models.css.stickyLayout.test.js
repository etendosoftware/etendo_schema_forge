// @covers tools/app-shell/src/windows/custom/fiscal-models/fiscal-models.css
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/349/FmModel349Page.jsx
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

  it('.fm-page--freeflow turns its element (the detail page\'s .fm-detail-scroll) into the scrolling ancestor (overflow-y: auto)', () => {
    // `.fm-page--freeflow` sits on the `.fm-detail-scroll` element of the 303/349 detail pages
    // (FmModel303Page.jsx / FmModel349Page.jsx), NOT on `.fm-page`: that element is the one
    // scrolling ancestor every sticky element here resolves its `position: sticky` against.
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

  // ETP-5584 (P15) — the operators table's column header stays pinned with the filter row.
  it('.fm-349-ops-table thead th is sticky at top: 97px, and its wrapper is not a scroll box', () => {
    const th = ruleBodyFor('.fm-349-ops-table thead th', css);
    assert.match(th, /position:\s*sticky/);
    assert.match(th, /top:\s*97px/);
    assert.match(th, /background:/);
    const wrap = ruleBodyFor('.fm-349-ops-wrap', css);
    assert.match(wrap, /overflow:\s*visible/);
  });
});

// ── Detail layout contract (the fixed action-bar header over one scroller) ──────
// Parses the CSS (comments stripped) into rules and collects, per declaration, the value of
// every rule whose selector list contains EXACTLY the given selector — so a declaration that
// moves to another selector, or a property that is dropped, fails here.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const RULES = [...cssNoComments.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
  selectors: sel.split(',').map((x) => x.trim().replace(/\s+/g, ' ')),
  decls: body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
  }),
}));

function declValues(selector, prop) {
  return RULES.filter((r) => r.selectors.includes(selector))
    .flatMap((r) => r.decls.filter(([p]) => p === prop).map(([, v]) => v));
}

// The effective declarations of an element carrying `classes`, from single-compound class
// selectors only (`.a`, `.a.b`) — enough for the flat detail-layout rules under test.
function effective(classes, prop) {
  let value;
  for (const r of RULES) {
    for (const sel of r.selectors) {
      if (!/^(\.[\w-]+)+$/.test(sel)) continue;
      const needed = sel.slice(1).split('.');
      if (!needed.every((c) => classes.includes(c))) continue;
      for (const [p, v] of r.decls) if (p === prop) value = v;
    }
  }
  return value?.replace(/\s*!important$/, '');
}

const pageSrc = {
  303: readFileSync(join(__dirname, '..', 'models', '303', 'FmModel303Page.jsx'), 'utf8'),
  349: readFileSync(join(__dirname, '..', 'models', '349', 'FmModel349Page.jsx'), 'utf8'),
};
const DETAIL_PAGE = ['fm-page', 'fm-page--detail'];
const DETAIL_SCROLL = ['fm-page--freeflow', 'fm-detail-scroll'];

describe('fiscal-models.css — detail layout contract (fixed header, one scroller)', () => {
  for (const model of ['303', '349']) {
    it(`Modelo ${model} detail wires the page and the scroller with the classes this contract assumes`, () => {
      assert.match(pageSrc[model], /className="fm-page fm-page--detail"/);
      assert.match(pageSrc[model], /className="fm-page--freeflow fm-detail-scroll"/);
      // The header is closed before the scroller opens: a sibling of it, never inside it.
      const headerClose = pageSrc[model].indexOf('</FmDetailHeader>');
      const scrollOpen = pageSrc[model].indexOf('className="fm-page--freeflow fm-detail-scroll"');
      assert.ok(headerClose !== -1 && headerClose < scrollOpen, 'FmDetailHeader must close before .fm-detail-scroll opens');
    });
  }

  it('.fm-page--detail is a non-scrolling flex column', () => {
    assert.equal(effective(DETAIL_PAGE, 'display'), 'flex');
    assert.equal(effective(DETAIL_PAGE, 'flex-direction'), 'column');
    assert.equal(effective(DETAIL_PAGE, 'overflow'), 'hidden');
    assert.equal(effective(DETAIL_PAGE, 'overflow-y'), undefined);
  });

  it('.fm-detail-header stays outside the scroller (flex-shrink: 0, no overflow of its own)', () => {
    assert.deepEqual(declValues('.fm-detail-header', 'flex-shrink'), ['0']);
    assert.deepEqual(declValues('.fm-detail-header', 'overflow'), []);
    assert.deepEqual(declValues('.fm-detail-header', 'position'), []);
  });

  it('.fm-detail-scroll is the one scroller: it fills the rest (flex 1, min-height 0) with overflow-y: auto', () => {
    assert.equal(effective(DETAIL_SCROLL, 'overflow-y'), 'auto');
    assert.equal(effective(DETAIL_SCROLL, 'min-height'), '0');
    assert.match(effective(DETAIL_SCROLL, 'flex'), /^1\b/);
  });

  it('.fm-config-modal is capped at calc(100dvh - 32px) as a flex column', () => {
    assert.ok(
      declValues('.fm-config-modal', 'max-height').includes('calc(100dvh - 32px)'),
      'expected max-height: calc(100dvh - 32px) on .fm-config-modal',
    );
    assert.deepEqual(declValues('.fm-config-modal', 'display'), ['flex']);
    assert.deepEqual(declValues('.fm-config-modal', 'flex-direction'), ['column']);
  });

  it('.fm-config-modal header and footer never shrink, only the body scrolls', () => {
    assert.deepEqual(declValues('.fm-config-modal__header', 'flex-shrink'), ['0']);
    assert.deepEqual(declValues('.fm-config-modal__footer', 'flex-shrink'), ['0']);
    assert.deepEqual(declValues('.fm-config-modal__body', 'overflow-y'), ['auto']);
  });

  it('the present and AEAT modals drop the shared body\'s 360px min-height', () => {
    assert.deepEqual(declValues('.fm-config-modal__body', 'min-height'), ['360px']);
    assert.deepEqual(declValues('.fm-present-modal .fm-config-modal__body', 'min-height'), ['0']);
    assert.deepEqual(declValues('.fm-aeat-modal .fm-config-modal__body', 'min-height'), ['0']);
  });
});
