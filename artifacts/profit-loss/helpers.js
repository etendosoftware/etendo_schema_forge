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

// ETP-6239 — "sep 26 Comparado": a period group's label plus a sub-column caption, for the single
// header row of the CSV export (periodLabel and the rest are canonical helpers).
function periodCaption(label, caption) {
  return label + ' ' + caption;
}

// ETP-6080 — round2 / numCellType, copied from inventory-stock-report/helpers.js (not canonical
// helpers, so each report keeps its own copy). The variation cells of the Excel/CSV export are
// nullable (variationPct is null when the reference is 0) and carry long decimals.
// round2 caps a value at 2 decimals and returns '' for null (a blank cell, never 0).
function round2(value) {
  if (value == null || value === '') return '';
  var num = Number(value);
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

// numCellType — html-to-xlsx writes a data-cell-type="number" cell holding no number as the
// literal NaN (invalid XML), so a null value must be a genuinely empty "string" cell.
function numCellType(value) {
  return value == null || value === '' ? 'string' : 'number';
}
