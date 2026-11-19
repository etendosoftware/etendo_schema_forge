// All formatting helpers now come from the canonical
// templates/reports/helpers/report-html-helpers.js (both the on-screen HTML
// preview and the jsreport PDF/XLSX render path build their helper set from
// there — see buildJsreportHelpersString()). This report has no non-default
// formatNumber options, so this file declares no helper of its own.
//
// csvField is NO LONGER declared here: ETP-5032 promoted it to that canonical
// set, because it had been hand-copied into nine reports and every copy only
// quoted the value — none of them neutralized spreadsheet formula injection
// (CWE-1236, ADR-0004). template-csv.hbs keeps calling {{{csvField x}}}
// unchanged; the canonical helper now also prefixes an apostrophe when the
// value starts with a formula trigger.

// ETP-6084 chart-tree exports: a null / non-finite value (no % when the reference is 0) is an
// empty cell, never a numeric NaN; amounts are rounded to cents so float noise (1.8e-12) reads 0.
function round2(value) {
  if (value == null || value === '') return '';
  var num = Number(value);
  if (!isFinite(num)) return '';
  return Math.round(num * 100) / 100;
}

function numCellType(value) {
  return value == null || value === '' || !isFinite(Number(value)) ? 'string' : 'number';
}

// CSV text: always 2 decimals, dot separator, '' when there is no value.
function fixed2(value) {
  if (value == null || value === '') return '';
  var num = Number(value);
  if (!isFinite(num)) return '';
  return (Math.round(num * 100) / 100).toFixed(2);
}
