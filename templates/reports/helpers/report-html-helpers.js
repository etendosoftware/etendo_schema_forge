/**
 * Canonical Handlebars helpers for LOCAL HTML rendering of reports.
 *
 * This is the ONLY approved source for jsreport's `formatCurrency`/`formatNumber`
 * helpers — never write a second currency/number Handlebars helper by hand in a
 * per-report `helpers.js` or inline in `report-api.js`. See CLAUDE.md § Currency
 * & Amount Formatting (MANDATORY); the browser-side equivalent is
 * `tools/app-shell/src/lib/formatCurrency.js` (ETP-4314).
 *
 * These mirror — verbatim — the generated `artifacts/<id>/helpers.js` functions
 * that the report HTML render path historically registered (the fixed whitelist:
 * isGroupBreak, resetGroupTracking, formatDate, formatCurrency, formatBoolean,
 * formatNumber, ifCond, eq, sumField, formatDateDisplay, sumRowsByCategory).
 *
 * Keeping them as a trusted in-repo module lets the report server and the Vite
 * dev plugin register the helpers WITHOUT dynamically executing the per-report
 * artifact file (no `new Function` / `eval`, which Sonar flags as S1523).
 *
 * jsreport (PDF/XLSX) is intentionally unchanged: it still consumes the per-report
 * `helpers.js` string directly, which is where report-specific helpers such as
 * `qrCode` live. Those are never part of the local HTML whitelist.
 *
 * `createReportHelpers()` returns a fresh set with isolated group-break state,
 * matching the previous per-render isolation that `new Function` provided.
 *
 * The only helper that historically diverged between reports is `formatNumber`
 * (most reports format integers with no decimals; the tax report keeps 2 so tax
 * rates render as "21.00%"). That difference is expressed as data via the
 * `numberFormat` option (Intl.NumberFormat options) instead of per-report code,
 * and `extractNumberFormatOptions()` recovers it from a report's `helpers.js`
 * without executing it.
 *
 * @param {object} [options]
 * @param {Intl.NumberFormatOptions} [options.numberFormat] Options applied by
 *        `formatNumber`. Defaults to the canonical generator behaviour (no
 *        fixed fraction digits).
 */
export function createReportHelpers({ numberFormat } = {}) {
  // Group-break detection: tracks previous values per group field
  let _prevGroupValues = {};

  function isGroupBreak(field, currentValue) {
    var prev = _prevGroupValues[field];
    _prevGroupValues[field] = currentValue;
    return prev !== currentValue;
  }

  function resetGroupTracking() {
    _prevGroupValues = {};
  }

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
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(num);
  }

  function formatBoolean(value) {
    return value ? 'Yes' : 'No';
  }

  function formatNumber(value) {
    if (value == null) return '';
    var num = Number(value);
    if (isNaN(num)) return String(value);
    return new Intl.NumberFormat('es-ES', Object.assign({ useGrouping: true }, numberFormat || undefined)).format(num);
  }

  function ifCond(v1, operator, v2, options) {
    switch (operator) {
      case '===': return v1 === v2 ? options.fn(this) : options.inverse(this);
      case '!==': return v1 !== v2 ? options.fn(this) : options.inverse(this);
      default: return options.inverse(this);
    }
  }

  function eq(a, b) { return a === b; }

  function sumField(rows, field) {
    if (!Array.isArray(rows)) return 0;
    return rows.reduce(function(acc, row) {
      var val = Number(row[field]);
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }

  function formatDateDisplay(value) {
    if (value == null || value === '') return '';
    // Accepts YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      var parts = value.split('-');
      return parts[2] + '-' + parts[1] + '-' + parts[0];
    }
    return String(value);
  }

  function sumRowsByCategory(rows, categoryPrefix, field) {
    if (!Array.isArray(rows)) return 0;
    return rows
      .filter(function(r) { return (r.category || '').startsWith(categoryPrefix); })
      .reduce(function(sum, r) { return sum + (Number(r[field]) || 0); }, 0);
  }

  return {
    isGroupBreak,
    resetGroupTracking,
    formatDate,
    formatCurrency,
    formatBoolean,
    formatNumber,
    ifCond,
    eq,
    sumField,
    formatDateDisplay,
    sumRowsByCategory,
  };
}

/**
 * Verbatim SOURCE TEXT of the canonical helpers, keyed by the helper name
 * jsreport must register them under.
 *
 * WHY A SECOND, STRING COPY OF THE FUNCTIONS ABOVE — READ BEFORE "DEDUPLICATING":
 * `buildJsreportHelpersString()` used to serialize the live functions with
 * `fn.toString()`. That silently breaks in a production bundle: the helpers are
 * local declarations inside `createReportHelpers()`'s closure, so the minifier
 * renames both the FUNCTION NAMES (`function ifCond(` → `function l(`) and every
 * CLOSURE VARIABLE they capture (`_prevGroupValues` → `e`). jsreport derives each
 * helper's name from the `function <name>(` text it receives, so the emitted
 * string declared `l`/`i`/… and jsreport answered `400 missing helper "ifCond"`;
 * `isGroupBreak` additionally hit a `ReferenceError` on the renamed closure var.
 * It only ever worked in dev, where nothing is minified.
 *
 * Emitting hardcoded source text is the fix, and it is the same pattern the
 * three helpers that already survived minification (`__groupEsEs`,
 * `formatCurrency`, `formatNumber`) have always used: no bundle identifier —
 * neither a function name nor a captured variable — can leak into the string, so
 * the output is byte-identical in dev and in a minified production build. The
 * alternative (recreating the live helpers from these strings via
 * `new Function`) is ruled out by Sonar S1523, per this module's docstring.
 *
 * INVARIANT: each entry here must stay behaviourally identical to its
 * same-named function in `createReportHelpers()` above. They are a matched pair;
 * change one, change the other. A parity test guards this — see
 * `tools/app-shell/test/report-jsreport-helpers-builder.test.js`.
 *
 * `formatCurrency`/`formatNumber` are intentionally absent — they are generated
 * per call with the instance separators / decimal precision baked in.
 */
const JSREPORT_HELPER_SOURCES = {
  isGroupBreak: `function isGroupBreak(field, currentValue) {
  var prev = _prevGroupValues[field];
  _prevGroupValues[field] = currentValue;
  return prev !== currentValue;
}`,
  resetGroupTracking: `function resetGroupTracking() {
  _prevGroupValues = {};
}`,
  formatDate: `function formatDate(value) {
  if (value == null || value === '') return '';
  var d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}`,
  formatBoolean: `function formatBoolean(value) {
  return value ? 'Yes' : 'No';
}`,
  ifCond: `function ifCond(v1, operator, v2, options) {
  switch (operator) {
    case '===': return v1 === v2 ? options.fn(this) : options.inverse(this);
    case '!==': return v1 !== v2 ? options.fn(this) : options.inverse(this);
    default: return options.inverse(this);
  }
}`,
  eq: `function eq(a, b) { return a === b; }`,
  sumField: `function sumField(rows, field) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce(function(acc, row) {
    var val = Number(row[field]);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
}`,
  formatDateDisplay: `function formatDateDisplay(value) {
  if (value == null || value === '') return '';
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(String(value))) {
    var parts = value.split('-');
    return parts[2] + '-' + parts[1] + '-' + parts[0];
  }
  return String(value);
}`,
  sumRowsByCategory: `function sumRowsByCategory(rows, categoryPrefix, field) {
  if (!Array.isArray(rows)) return 0;
  return rows
    .filter(function(r) { return (r.category || '').startsWith(categoryPrefix); })
    .reduce(function(sum, r) { return sum + (Number(r[field]) || 0); }, 0);
}`,
};

/**
 * Statically recover the `formatNumber` Intl options from a report's
 * `helpers.js` source WITHOUT executing it. Returns the options object the
 * artifact's `formatNumber` passed to `Intl.NumberFormat`, or `undefined` when
 * the report uses the canonical (no-options) behaviour.
 *
 * This keeps the registration generic — any report whose generated helpers
 * declare fixed fraction digits keeps them — without special-casing a report
 * name in this shared module.
 *
 * @param {string} helpersCode Raw contents of `artifacts/<id>/helpers.js`.
 * @returns {Intl.NumberFormatOptions | undefined}
 */
export function extractNumberFormatOptions(helpersCode) {
  if (!helpersCode) return undefined;
  // Capture the options literal of the Intl.NumberFormat call inside formatNumber.
  const body = /function\s+formatNumber\b[\s\S]*?Intl\.NumberFormat\(\s*['"][^'"]*['"]\s*,\s*(\{[\s\S]*?\})\s*\)/.exec(helpersCode);
  if (!body) return undefined;
  const opts = {};
  const min = /minimumFractionDigits\s*:\s*(\d+)/.exec(body[1]);
  const max = /maximumFractionDigits\s*:\s*(\d+)/.exec(body[1]);
  if (min) opts.minimumFractionDigits = Number(min[1]);
  if (max) opts.maximumFractionDigits = Number(max[1]);
  return Object.keys(opts).length ? opts : undefined;
}

/**
 * Register the canonical HTML helper set on a Handlebars instance.
 * Resets group-break tracking first, matching the previous render behaviour.
 *
 * @param {object} handlebars Handlebars instance.
 * @param {string} [helpersCode] Raw `helpers.js` of the report being rendered.
 *        Used only to preserve a report's `formatNumber` decimal formatting; no
 *        code from it is executed.
 */
export function registerReportHelpers(handlebars, helpersCode) {
  const helpers = createReportHelpers({ numberFormat: extractNumberFormatOptions(helpersCode) });
  helpers.resetGroupTracking();
  Object.entries(helpers).forEach(([name, fn]) => {
    if (typeof fn === 'function') handlebars.registerHelper(name, fn);
  });
  return helpers;
}

// Helper names covered by the canonical set — anything else found in a report's
// raw helpers.js (e.g. `qrCode`) is report-specific and must be preserved verbatim.
//
// Derived from JSREPORT_HELPER_SOURCES (the source-text map) rather than
// hand-maintained as a third, separate list: a helper added there without
// being added here would silently fail to get stripped from a report's
// extras, letting a report-declared function with the same name survive
// alongside the canonical one — two `function <name>(` declarations in the
// emitted string, with JS hoisting picking whichever the report declared.
// `formatCurrency`/`formatNumber` are added explicitly because they are
// intentionally excluded from JSREPORT_HELPER_SOURCES (generated per call
// with instance separators baked in — see that map's docstring).
const CANONICAL_HELPER_NAMES = new Set([
  ...Object.keys(JSREPORT_HELPER_SOURCES),
  'formatCurrency',
  'formatNumber',
]);

function extractBraceBlock(source, startIdx) {
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

function extractTopLevelFunctions(source) {
  const results = [];
  const re = /function\s+(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(source))) {
    const fnSource = extractBraceBlock(source, m.index);
    results.push({ name: m[1], source: fnSource });
    re.lastIndex = m.index + fnSource.length;
  }
  return results;
}

function extractRequireLines(source) {
  const matches = source.match(/^[ \t]*(?:var|const|let)\s+\w+\s*=\s*require\([^)]*\)\s*;?[ \t]*$/gm);
  return matches ? matches.join('\n') : '';
}

/**
 * Builds the `helpers` string sent to jsreport for the PDF/XLSX render path —
 * the real centralization point for that path (see docs/... ETP-4314 plan).
 *
 * jsreport runs in a separate Docker container reachable only over HTTP, with
 * no shared module system with this repo — so it can never `import`
 * formatCurrency() or this module directly. Instead, this function emits the
 * canonical helper set as source text (`JSREPORT_HELPER_SOURCES`, the matched
 * string pair of `createReportHelpers()`'s functions) and appends only the
 * report-SPECIFIC extras (e.g. `qrCode` + its `require`) extracted from the
 * report's raw `artifacts/<id>/helpers.js`. The result is the single source of
 * truth for both render paths — not a second, hand-maintained copy per report.
 *
 * It deliberately does NOT serialize the live functions with `fn.toString()`:
 * that is minification-unsafe and shipped a production-only
 * `400 missing helper "ifCond"` — see `JSREPORT_HELPER_SOURCES` for the full
 * rationale before changing this.
 *
 * `formatCurrency`/`formatNumber` cannot rely on `Intl.NumberFormat` in the
 * serialized string: jsreport runs its own separate Node process (see module
 * docstring above), and the Node/ICU build the `etendo-jsreport` Docker image
 * ships (Node 18.20.4 / ICU 74.2 / CLDR 44.1, confirmed via `docker exec`)
 * silently drops the thousands separator for the `es-ES` locale specifically
 * in the 1000-9999 range — the exact bug this ticket exists to fix. Node ≥20
 * (ICU ≥78/CLDR ≥48) does not have this data bug, but we can't control which
 * Node build ends up running jsreport (that lives in a separate repo/image).
 * `__groupEsEs` sidesteps the whole class of problem: a manual, locale-data-
 * free grouping algorithm gives the same result on any Node/ICU version.
 *
 * `isGroupBreak`/`resetGroupTracking` have their own closure-variable issue
 * (`_prevGroupValues`) — solved by declaring that variable at the top of the
 * combined string rather than templating the whole function (their bodies
 * don't reference anything else external).
 *
 * @param {string} [helpersCode] Raw contents of `artifacts/<id>/helpers.js`.
 * @param {Intl.NumberFormatOptions} [numberFormatOverride] Explicit
 *        `formatNumber` decimal-precision override for callers that already
 *        know it as a plain JS value (e.g. a document PDF's exchange-rate
 *        precision) instead of one recoverable by regex from a raw
 *        `helpers.js` string. Takes precedence over `extractNumberFormatOptions`.
 * @param {{ thousandsSeparator?: string, decimalSeparator?: string }} [separators]
 *        Instance-wide separators (from the same `/sws/neo/currency-format`
 *        config `formatCurrency.js` reads in the browser — ETP-4314). Baked
 *        into the generated `__groupEsEs` source as literals, since jsreport
 *        can never fetch this config itself. Defaults to `.`/`,`.
 * @returns {string} Combined JS source to send as jsreport's `helpers` field.
 */
export function buildJsreportHelpersString(helpersCode, numberFormatOverride, separators) {
  const numberFormat = numberFormatOverride || extractNumberFormatOptions(helpersCode);
  const thousandsSeparator = (separators && separators.thousandsSeparator) || '.';
  const decimalSeparator = (separators && separators.decimalSeparator) || ',';

  const stateSrc = 'var _prevGroupValues = {};';

  const groupEsEsSrc = `function __groupEsEs(num, minFrac, maxFrac) {
  var sign = num < 0 ? '-' : '';
  var abs = Math.abs(num);
  var fixed = abs.toFixed(maxFrac);
  var parts = fixed.split('.');
  var intPart = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ${JSON.stringify(thousandsSeparator)});
  var decPart = parts[1] || '';
  while (decPart.length > minFrac && decPart.charAt(decPart.length - 1) === '0') {
    decPart = decPart.slice(0, -1);
  }
  return decPart ? sign + intPart + ${JSON.stringify(decimalSeparator)} + decPart : sign + intPart;
}`;

  const formatCurrencySrc = `function formatCurrency(value) {
  if (value == null) return '';
  var num = Number(value);
  if (isNaN(num)) return String(value);
  return __groupEsEs(num, 2, 2);
}`;

  const minFrac = (numberFormat && numberFormat.minimumFractionDigits != null) ? numberFormat.minimumFractionDigits : 0;
  const maxFrac = (numberFormat && numberFormat.maximumFractionDigits != null) ? numberFormat.maximumFractionDigits : 3;
  const formatNumberSrc = `function formatNumber(value) {
  if (value == null) return '';
  var num = Number(value);
  if (isNaN(num)) return String(value);
  return __groupEsEs(num, ${minFrac}, ${maxFrac});
}`;

  // NEVER build this from `fn.toString()` on the live helpers: those are closure
  // locals, so a production bundle emits minified function names AND minified
  // closure-variable references — see JSREPORT_HELPER_SOURCES above.
  const canonicalSrc = Object.values(JSREPORT_HELPER_SOURCES)
    .concat(groupEsEsSrc, formatCurrencySrc, formatNumberSrc)
    .join('\n\n');

  const extras = helpersCode ? extractTopLevelFunctions(helpersCode).filter((f) => !CANONICAL_HELPER_NAMES.has(f.name)) : [];
  const requireLines = helpersCode ? extractRequireLines(helpersCode) : '';
  const extrasSrc = extras.map((f) => f.source).join('\n\n');

  return [requireLines, stateSrc, canonicalSrc, extrasSrc].filter(Boolean).join('\n\n');
}
