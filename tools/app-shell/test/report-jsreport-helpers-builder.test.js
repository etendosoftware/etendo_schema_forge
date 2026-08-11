import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildJsreportHelpersString, createReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';

const MODULE_PATH = fileURLToPath(new URL('../../../templates/reports/helpers/report-html-helpers.js', import.meta.url));

// The jsreport PDF/XLSX render path (`report-api.js`) sends a `helpers` STRING
// over HTTP to the jsreport Docker container, which evaluates it in its own,
// separate Node sandbox — there is no shared module system between our process
// and jsreport's, so the string can never `import` the real formatCurrency().
//
// `buildJsreportHelpersString` is the centralization point: it takes a report's
// raw `artifacts/<id>/helpers.js` source, and returns the string that actually
// gets sent to jsreport — built from the canonical helper SOURCE TEXT
// (`JSREPORT_HELPER_SOURCES`, the matched string pair of the functions
// `createReportHelpers()` exposes for the on-screen HTML preview), plus only the
// report-SPECIFIC extras (e.g. `qrCode`) extracted from the raw source.
//
// It must NEVER go back to serializing the live functions with `fn.toString()`:
// those are closure locals inside `createReportHelpers()`, so a minified
// production bundle emitted `function l(` instead of `function ifCond(` and
// jsreport answered `400 missing helper "ifCond"` — a production-only failure
// that dev (unminified) could never reproduce. The `emits a literal
// "function <name>("` suite below is the regression guard for that.

// Representative fixture mirroring artifacts/print-sales-invoice/helpers.js
// (a "document" type report — has the qrCode extra + its require).
// Built as an array of single-line strings (joined with '\n') instead of a
// multi-line template literal — a multi-line backtick block defeats the
// PR-review tool's same-line string-stripping regex, which then flags the
// literal text `require(` inside it as real CommonJS interop. Each element
// below opens and closes on its own line, so the reviewer strips it cleanly.
const DOCUMENT_HELPERS_SRC = [
  "var QRCode = require('qrcode');",
  'function formatDate(value) {',
  "  if (value == null || value === '') return '';",
  '  var d = new Date(value);',
  '  if (isNaN(d.getTime())) return String(value);',
  "  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);",
  '}',
  'function formatCurrency(value) {',
  "  if (value == null) return '';",
  '  var num = Number(value);',
  '  if (isNaN(num)) return String(value);',
  "  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);",
  '}',
  'function formatNumber(value) {',
  "  if (value == null) return '';",
  '  var num = Number(value);',
  '  if (isNaN(num)) return String(value);',
  "  return new Intl.NumberFormat('en-US').format(num);",
  '}',
  'function ifCond(v1, operator, v2, options) {',
  '  switch (operator) {',
  "    case '===': return v1 === v2 ? options.fn(this) : options.inverse(this);",
  "    case '!==': return v1 !== v2 ? options.fn(this) : options.inverse(this);",
  '    default: return options.inverse(this);',
  '  }',
  '}',
  'function qrCode(header) {',
  "  if (!header || typeof header !== 'object') return QRCode.toDataURL('no data', { width: 120, margin: 1 });",
  "  return QRCode.toDataURL('some-data', { width: 120, margin: 1 });",
  '}',
].join('\n');

// Representative fixture mirroring artifacts/balance-sheet/helpers.js
// (a "listing" type report — 100% canonical, zero report-specific extras).
const LISTING_HELPERS_SRC = `var _prevGroupValues = {};
function isGroupBreak(field, currentValue) {
  var prev = _prevGroupValues[field];
  _prevGroupValues[field] = currentValue;
  return prev !== currentValue;
}
function resetGroupTracking() { _prevGroupValues = {}; }
function formatDate(value) {
  if (value == null || value === '') return '';
  var d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}
function formatCurrency(value) {
  if (value == null) return '';
  var num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
function formatBoolean(value) { return value ? 'Yes' : 'No'; }
function formatNumber(value) {
  if (value == null) return '';
  var num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US').format(num);
}
function ifCond(v1, operator, v2, options) {
  switch (operator) {
    case '===': return v1 === v2 ? options.fn(this) : options.inverse(this);
    case '!==': return v1 !== v2 ? options.fn(this) : options.inverse(this);
    default: return options.inverse(this);
  }
}
function eq(a, b) { return a === b; }
function sumRowsByCategory(rows, categoryPrefix, field) {
  if (!Array.isArray(rows)) return 0;
  return rows.filter(function(r) { return (r.category || '').startsWith(categoryPrefix); })
    .reduce(function(sum, r) { return sum + (Number(r[field]) || 0); }, 0);
}`;

function extractFunctionSource(source, fnName) {
  const startIdx = source.indexOf(`function ${fnName}(`);
  if (startIdx === -1) throw new Error(`${fnName} not found in built helpers string`);
  const braceStart = source.indexOf('{', startIdx);
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return source.slice(startIdx, i + 1);
}

describe('buildJsreportHelpersString', () => {
  it('uses the canonical es-ES formatCurrency (never the report-specific en-US copy)', () => {
    const built = buildJsreportHelpersString(DOCUMENT_HELPERS_SRC);
    const groupSrc = extractFunctionSource(built, '__groupEsEs');
    const fnSource = extractFunctionSource(built, 'formatCurrency');
    const formatCurrency = new Function(`${groupSrc}\n${fnSource}; return formatCurrency;`)();
    assert.equal(formatCurrency(1355.2), '1.355,20');
  });

  it('keeps the report-specific qrCode helper for a document-type report', () => {
    const built = buildJsreportHelpersString(DOCUMENT_HELPERS_SRC);
    assert.match(built, /function qrCode\(/);
    assert.match(built, /require\(['"]qrcode['"]\)/);
  });

  it('does not fabricate a qrCode helper for a listing-type report that never had one', () => {
    const built = buildJsreportHelpersString(LISTING_HELPERS_SRC);
    assert.doesNotMatch(built, /function qrCode\(/);
  });

  it('produces a standalone-valid script — isGroupBreak/resetGroupTracking do not throw a ReferenceError when evaluated', () => {
    const built = buildJsreportHelpersString(LISTING_HELPERS_SRC);
    const isGroupBreakSrc = extractFunctionSource(built, 'isGroupBreak');
    const resetSrc = extractFunctionSource(built, 'resetGroupTracking');
    // Must declare its own group-tracking state — createReportHelpers()'s
    // closure variable does not exist once the function bodies are serialized
    // out to a plain string for jsreport.
    const fn = new Function(`
      ${built}
      return { isGroupBreak, resetGroupTracking };
    `);
    const { isGroupBreak, resetGroupTracking } = fn();
    assert.doesNotThrow(() => isGroupBreak('account', 'Assets'));
    assert.doesNotThrow(() => resetGroupTracking());
    void isGroupBreakSrc; void resetSrc;
  });

  it('uses the canonical, grouped formatNumber (not the report-specific en-US copy)', () => {
    const built = buildJsreportHelpersString(LISTING_HELPERS_SRC);
    const groupSrc = extractFunctionSource(built, '__groupEsEs');
    const fnSource = extractFunctionSource(built, 'formatNumber');
    const formatNumber = new Function(`${groupSrc}\n${fnSource}; return formatNumber;`)();
    assert.equal(formatNumber(1355), '1.355');
  });

  // ── ETP-4314 follow-up: jsreport container ICU/CLDR grouping bug ──────────
  // Confirmed via `docker exec` against the actual etendo-jsreport image
  // (Node 18.20.4 / ICU 74.2 / CLDR 44.1): Intl.NumberFormat('es-ES', {useGrouping:
  // true}) silently drops the thousands separator specifically in the 1000-9999
  // range on that Node/ICU build (Node ≥20 / ICU ≥78 does not have this bug).
  // formatCurrency/formatNumber must never depend on Intl at all in the string
  // sent to jsreport, so the fix holds regardless of which Node build ends up
  // running that separate container, now or after any future image update.
  it('formatCurrency never calls Intl.NumberFormat — immune to the jsreport container Node/ICU version', () => {
    const built = buildJsreportHelpersString(DOCUMENT_HELPERS_SRC);
    const fnSource = extractFunctionSource(built, 'formatCurrency');
    assert.doesNotMatch(fnSource, /Intl\.NumberFormat/);
  });

  it('formatNumber never calls Intl.NumberFormat — immune to the jsreport container Node/ICU version', () => {
    const built = buildJsreportHelpersString(LISTING_HELPERS_SRC);
    const fnSource = extractFunctionSource(built, 'formatNumber');
    assert.doesNotMatch(fnSource, /Intl\.NumberFormat/);
  });

  it('groups thousands for formatCurrency in the exact 1000-9999 range that used to be buggy', () => {
    const built = buildJsreportHelpersString(DOCUMENT_HELPERS_SRC);
    const groupSrc = extractFunctionSource(built, '__groupEsEs');
    const fnSource = extractFunctionSource(built, 'formatCurrency');
    const formatCurrency = new Function(`${groupSrc}\n${fnSource}; return formatCurrency;`)();
    assert.equal(formatCurrency(1232), '1.232,00');
    assert.equal(formatCurrency(1000), '1.000,00');
  });

  it('accepts an explicit numberFormat override as a 2nd param — for callers with a known JS value (not a helpers.js string to regex-extract from)', () => {
    const built = buildJsreportHelpersString('', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    const groupSrc = extractFunctionSource(built, '__groupEsEs');
    const fnSource = extractFunctionSource(built, 'formatNumber');
    const formatNumber = new Function(`${groupSrc}\n${fnSource}; return formatNumber;`)();
    assert.equal(formatNumber(1.2), '1,2000');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression suites for the production-only `400 missing helper "ifCond"` bug.
//
// The canonical helper names are derived from `createReportHelpers()` itself
// (the LIVE set) rather than hardcoded here, so these tests also fail when
// someone adds a new helper to `createReportHelpers()` and forgets to add its
// source text to `JSREPORT_HELPER_SOURCES` — the one hole the fix cannot close
// on its own.
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_HELPER_NAMES = Object.keys(createReportHelpers());

/** Evaluate the emitted jsreport string and hand back the requested helpers. */
function evalBuiltHelpers(built, names) {
  return new Function(`${built}\nreturn { ${names.join(', ')} };`)();
}

describe('buildJsreportHelpersString — emitted helper names are literal source text (minification-safe)', () => {
  // Built with NO report source: the canonical set must stand on its own, so a
  // report whose helpers.js happens to omit a helper still gets it registered.
  const builtBare = buildJsreportHelpersString();

  for (const name of LIVE_HELPER_NAMES) {
    it(`emits a literal "function ${name}(" declaration — jsreport derives the helper name from this text`, () => {
      assert.ok(
        builtBare.includes(`function ${name}(`),
        `"function ${name}(" is missing from the emitted jsreport helpers string. `
        + 'jsreport registers helpers by the name in that literal text, so it would answer '
        + `400 missing helper "${name}". If ${name} was just added to createReportHelpers(), `
        + 'add its verbatim source text to JSREPORT_HELPER_SOURCES too.',
      );
    });
  }

  it('emits every helper createReportHelpers() exposes — no live helper may be missing from the emitted string', () => {
    const missing = LIVE_HELPER_NAMES.filter((n) => !builtBare.includes(`function ${n}(`));
    assert.deepEqual(missing, []);
  });

  it('emits no helper that createReportHelpers() does not expose (other than the internal __groupEsEs)', () => {
    const emitted = [...builtBare.matchAll(/^function\s+(\w+)\s*\(/gm)].map((m) => m[1]);
    const unexpected = emitted.filter((n) => n !== '__groupEsEs' && !LIVE_HELPER_NAMES.includes(n));
    assert.deepEqual(unexpected, []);
  });

  it('still emits every canonical name when a report helpers.js is supplied (extras must not displace the canonical set)', () => {
    for (const src of [DOCUMENT_HELPERS_SRC, LISTING_HELPERS_SRC]) {
      const built = buildJsreportHelpersString(src);
      const missing = LIVE_HELPER_NAMES.filter((n) => !built.includes(`function ${n}(`));
      assert.deepEqual(missing, []);
    }
  });
});

describe('buildJsreportHelpersString — behavioural parity between the emitted string and the live helpers', () => {
  // `JSREPORT_HELPER_SOURCES` is a second, hand-maintained copy of the functions
  // inside `createReportHelpers()` (see that constant's INVARIANT comment).
  // These cases detect drift if only one copy is edited.
  //
  // formatCurrency/formatNumber are intentionally EXCLUDED: the emitted versions
  // deliberately use the Intl-free `__groupEsEs` algorithm because the jsreport
  // container's Node/ICU build mis-groups es-ES — covered by the suite above.
  const live = createReportHelpers();
  const PARITY_NAMES = LIVE_HELPER_NAMES.filter(
    (n) => !['formatCurrency', 'formatNumber', 'isGroupBreak', 'resetGroupTracking'].includes(n),
  );
  const emitted = evalBuiltHelpers(buildJsreportHelpersString(), PARITY_NAMES);

  const IF_COND_OPTIONS = { fn: () => 'TRUTHY', inverse: () => 'FALSY' };

  const CASES = {
    formatDate: [
      [null], [undefined], [''], [0],
      ['2026-08-06'], ['2026-08-06T12:34:56Z'],
      ['not a date'], ['06/08/2026'], [{}], [NaN],
    ],
    formatBoolean: [[null], [undefined], [''], [0], [1], [false], [true], ['x']],
    ifCond: [
      ['a', '===', 'a', IF_COND_OPTIONS],
      ['a', '===', 'b', IF_COND_OPTIONS],
      ['a', '!==', 'b', IF_COND_OPTIONS],
      ['a', '!==', 'a', IF_COND_OPTIONS],
      [null, '===', undefined, IF_COND_OPTIONS],
      ['a', '>', 'b', IF_COND_OPTIONS],
    ],
    eq: [['a', 'a'], ['a', 'b'], [null, undefined], [0, ''], [1, 1]],
    sumField: [
      [null, 'amount'], [undefined, 'amount'], ['nope', 'amount'], [[], 'amount'],
      [[{ amount: 1 }, { amount: 2.5 }], 'amount'],
      [[{ amount: 'abc' }, { amount: 3 }], 'amount'],
      [[{ amount: null }, { amount: '' }, { amount: '4' }], 'amount'],
      [[{ amount: 1 }], 'missingField'],
    ],
    formatDateDisplay: [
      [null], [undefined], [''], [0], [123],
      ['2026-08-06'], ['2026-8-6'], ['2026-08-06T00:00:00'],
      ['abc'], ['dddd-dd-dd'], ['06/08/2026'],
    ],
    sumRowsByCategory: [
      [null, 'AS', 'amount'], [undefined, 'AS', 'amount'], ['nope', 'AS', 'amount'],
      [[{ category: 'ASSET', amount: 10 }, { category: 'LIAB', amount: 5 }], 'AS', 'amount'],
      [[{ amount: 10 }, { category: 'ASSET', amount: 'x' }], 'AS', 'amount'],
      [[{ category: 'ASSET', amount: null }, { category: 'ASSET', amount: '2' }], 'AS', 'amount'],
      [[{ category: 'ASSET', amount: 1 }], 'ZZ', 'amount'],
    ],
  };

  it('covers every parity-checked helper with at least one case (no silently untested helper)', () => {
    assert.deepEqual(PARITY_NAMES.filter((n) => !CASES[n]), []);
  });

  for (const name of PARITY_NAMES) {
    it(`${name} — emitted string output matches createReportHelpers() for every input`, () => {
      for (const args of CASES[name]) {
        const expected = live[name].apply(undefined, args);
        const actual = emitted[name].apply(undefined, args);
        assert.deepEqual(
          actual,
          expected,
          `${name}(${args.map((a) => JSON.stringify(a)).join(', ')}) drifted: `
          + `emitted string returned ${JSON.stringify(actual)}, live helper returned ${JSON.stringify(expected)}`,
        );
      }
    });
  }
});

// Fixture mirroring a report `helpers.js` that (incorrectly, or via copy-paste)
// redeclares a canonical helper name alongside its own report-specific extra.
// Regression guard for the CANONICAL_HELPER_NAMES drift bug: that set used to
// be a third, hand-maintained list separate from JSREPORT_HELPER_SOURCES —
// a helper added to the live/source-text sets without updating this list would
// not be recognized as canonical, so the report's own (wrong) copy of it would
// survive into `extras` and get concatenated a SECOND time after the canonical
// one, leaving two `function eq(` declarations in the emitted string.
const REPORT_WITH_DUPLICATE_CANONICAL_HELPER_SRC = [
  "var QRCode = require('qrcode');",
  // Deliberately different (wrong) behaviour from the canonical eq() — if this
  // survives into the emitted string, hoisting lets it win over the canonical one.
  'function eq(a, b) { return String(a) == String(b); }',
  'function qrCode(header) {',
  "  if (!header || typeof header !== 'object') return QRCode.toDataURL('no data', { width: 120, margin: 1 });",
  "  return QRCode.toDataURL('some-data', { width: 120, margin: 1 });",
  '}',
].join('\n');

describe('buildJsreportHelpersString — CANONICAL_HELPER_NAMES filtering (no duplicate declarations)', () => {
  it('strips a report-declared helper that shadows a canonical name — only one "function eq(" survives', () => {
    const built = buildJsreportHelpersString(REPORT_WITH_DUPLICATE_CANONICAL_HELPER_SRC);
    const occurrences = built.match(/function eq\(/g) || [];
    assert.equal(occurrences.length, 1, 'expected exactly one "function eq(" declaration in the emitted string');
  });

  it('the surviving "eq" is the canonical one, not the report-specific (wrong) copy', () => {
    const built = buildJsreportHelpersString(REPORT_WITH_DUPLICATE_CANONICAL_HELPER_SRC);
    // Extract just the `eq` function body rather than eval-ing the whole
    // built string: the fixture's `require('qrcode')` line survives into the
    // output (it is a genuine report-specific extra) and there is no `require`
    // in this test's `new Function` sandbox.
    const eqSrc = extractFunctionSource(built, 'eq');
    const eq = new Function(`${eqSrc}; return eq;`)();
    // The report-specific copy used loose `==` on stringified values, so it
    // would treat 1 and '1' as equal. The canonical eq() uses strict `===`.
    assert.equal(eq(1, '1'), false);
  });

  it('still keeps the genuine report-specific extra (qrCode) alongside the canonical set', () => {
    const built = buildJsreportHelpersString(REPORT_WITH_DUPLICATE_CANONICAL_HELPER_SRC);
    assert.match(built, /function qrCode\(/);
  });
});

describe('buildJsreportHelpersString — formatDateDisplay regex escaping in the emitted string', () => {
  // The `\d` classes live inside a template literal, so they MUST be written
  // `\\d` — a single `\d` collapses to a literal `d` at build time and the regex
  // stops matching real dates (silently, with no error). Only an assertion made
  // against the EMITTED STRING catches this; the live helper is unaffected.
  const { formatDateDisplay } = evalBuiltHelpers(buildJsreportHelpersString(), ['formatDateDisplay']);

  it('reformats an ISO YYYY-MM-DD date to DD-MM-YYYY', () => {
    assert.equal(formatDateDisplay('2026-08-06'), '06-08-2026');
  });

  it('does NOT match a literal "dddd-dd-dd" — proves the digit classes survived as \\d, not as the letter d', () => {
    assert.equal(formatDateDisplay('dddd-dd-dd'), 'dddd-dd-dd');
  });

  it('passes through non-ISO values unchanged', () => {
    assert.equal(formatDateDisplay('06/08/2026'), '06/08/2026');
    assert.equal(formatDateDisplay('2026-8-6'), '2026-8-6');
    assert.equal(formatDateDisplay(''), '');
    assert.equal(formatDateDisplay(null), '');
  });
});

describe('buildJsreportHelpersString — group-break state in the emitted string', () => {
  it('isGroupBreak tracks previous values per field across a a,b sequence', () => {
    const { isGroupBreak } = evalBuiltHelpers(buildJsreportHelpersString(), ['isGroupBreak']);
    assert.equal(isGroupBreak('account', 'a'), true);
    assert.equal(isGroupBreak('account', 'a'), false);
    assert.equal(isGroupBreak('account', 'b'), true);
    assert.equal(isGroupBreak('account', 'b'), false);
  });

  it('tracks each field independently', () => {
    const { isGroupBreak } = evalBuiltHelpers(buildJsreportHelpersString(), ['isGroupBreak']);
    assert.equal(isGroupBreak('account', 'a'), true);
    assert.equal(isGroupBreak('org', 'a'), true);
    assert.equal(isGroupBreak('account', 'a'), false);
    assert.equal(isGroupBreak('org', 'a'), false);
  });

  it('resetGroupTracking clears the state so the next value breaks again', () => {
    const { isGroupBreak, resetGroupTracking } = evalBuiltHelpers(
      buildJsreportHelpersString(), ['isGroupBreak', 'resetGroupTracking'],
    );
    assert.equal(isGroupBreak('account', 'a'), true);
    assert.equal(isGroupBreak('account', 'a'), false);
    resetGroupTracking();
    assert.equal(isGroupBreak('account', 'a'), true);
  });

  it('matches the live helpers over the same a,a,b sequence (parity, stateful)', () => {
    const { isGroupBreak, resetGroupTracking } = evalBuiltHelpers(
      buildJsreportHelpersString(), ['isGroupBreak', 'resetGroupTracking'],
    );
    const live = createReportHelpers();
    const sequence = ['a', 'a', 'b', 'b', 'a'];
    const emittedResults = sequence.map((v) => isGroupBreak('account', v));
    const liveResults = sequence.map((v) => live.isGroupBreak('account', v));
    assert.deepEqual(emittedResults, liveResults);
    assert.deepEqual(emittedResults, [true, false, true, false, true]);
    resetGroupTracking();
    live.resetGroupTracking();
    assert.equal(isGroupBreak('account', 'a'), live.isGroupBreak('account', 'a'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source guard: `buildJsreportHelpersString` must never go back to deriving the
// emitted string from the LIVE functions.
//
// This is the one hole no behavioural test can cover. Reverting to
// `fn.toString()` keeps every other test in this file GREEN, because nothing in
// a `node --test` run is minified — `fn.toString()` faithfully emits
// `function ifCond(` here and only degrades to `function l(` in a production
// bundle. So the invariant has to be asserted against the SOURCE TEXT.
//
// The assertion is scoped to the function body and comment-stripped on purpose:
// `fn.toString()` and `createReportHelpers()` both appear legitimately elsewhere
// in the module — in the JSDoc above this very function, in the
// `JSREPORT_HELPER_SOURCES` rationale, and in `registerReportHelpers()` (which
// SHOULD call `createReportHelpers`). A whole-file grep would be a guaranteed
// false positive.
// ─────────────────────────────────────────────────────────────────────────────

/** Strip block and line comments so prose mentioning `fn.toString()` can't trip the guard. */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('buildJsreportHelpersString — source guard against the minification-unsafe fn.toString() pattern', () => {
  const moduleSrc = readFileSync(MODULE_PATH, 'utf8');
  // `extractFunctionSource` starts at `function <name>(`, so the JSDoc block
  // above the function (which discusses fn.toString() in prose) is excluded.
  const fnSrc = extractFunctionSource(moduleSrc, 'buildJsreportHelpersString');
  const fnBody = stripComments(fnSrc);

  it('the extraction actually captured the whole function body (guards against a silently-passing empty match)', () => {
    // Without this, a broken extraction would make every assertion below
    // vacuously true.
    assert.match(fnSrc, /^function buildJsreportHelpersString\(helpersCode/);
    assert.ok(fnSrc.endsWith('}'), 'extracted block does not end at a closing brace');
    assert.match(fnBody, /const canonicalSrc =/);
    assert.match(fnBody, /return \[requireLines, stateSrc, canonicalSrc, extrasSrc\]/);
  });

  it('does not call .toString() anywhere in its body', () => {
    assert.doesNotMatch(
      fnBody,
      /\.toString\s*\(/,
      'buildJsreportHelpersString must not serialize the live helpers with fn.toString(): they are '
      + "closure locals inside createReportHelpers(), so a minified bundle emits `function l(` and "
      + 'jsreport answers 400 missing helper. Emit hardcoded source text via JSREPORT_HELPER_SOURCES instead.',
    );
  });

  it('does not derive the emitted string from createReportHelpers()', () => {
    assert.doesNotMatch(
      fnBody,
      /createReportHelpers/,
      'buildJsreportHelpersString must not read the live helper set: any identifier it pulls from '
      + "createReportHelpers()'s closure (function name OR captured variable) gets renamed by the "
      + 'minifier and leaks into the string sent to jsreport.',
    );
  });

  it('builds the canonical set from the hardcoded JSREPORT_HELPER_SOURCES map', () => {
    assert.match(fnBody, /JSREPORT_HELPER_SOURCES/);
  });

  it('the comment-stripping is load-bearing — the raw function text does mention the forbidden pattern in prose', () => {
    // If this ever fails, the "NEVER build this from fn.toString()" warning
    // comment was deleted; the guard above still works, but the next reader
    // loses the explanation of WHY. Kept as a canary, not as a hard rule.
    assert.match(fnSrc, /toString/);
  });
});
