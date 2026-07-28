import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildJsreportHelpersString } from '../../../templates/reports/helpers/report-html-helpers.js';

// The jsreport PDF/XLSX render path (`report-api.js`) sends a `helpers` STRING
// over HTTP to the jsreport Docker container, which evaluates it in its own,
// separate Node sandbox — there is no shared module system between our process
// and jsreport's, so the string can never `import` the real formatCurrency().
//
// `buildJsreportHelpersString` is the centralization point: it takes a report's
// raw `artifacts/<id>/helpers.js` source, and returns the string that actually
// gets sent to jsreport — built by SERIALIZING (via fn.toString()) the same
// canonical functions `createReportHelpers()` already uses for the on-screen
// HTML preview, plus only the report-SPECIFIC extras (e.g. `qrCode`) extracted
// from the raw source. This is the real, single source of truth for both paths
// — not a second, hand-maintained copy.

// Representative fixture mirroring artifacts/print-sales-invoice/helpers.js
// (a "document" type report — has the qrCode extra + its require).
const DOCUMENT_HELPERS_SRC = `var QRCode = require('qrcode');
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
function qrCode(header) {
  if (!header || typeof header !== 'object') return QRCode.toDataURL('no data', { width: 120, margin: 1 });
  return QRCode.toDataURL('some-data', { width: 120, margin: 1 });
}`;

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
