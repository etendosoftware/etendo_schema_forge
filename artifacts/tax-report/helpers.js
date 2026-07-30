// All formatting helpers now come from the canonical
// templates/reports/helpers/report-html-helpers.js (both the on-screen HTML
// preview and the jsreport PDF/XLSX render path build their helper set from
// there — see buildJsreportHelpersString()). This file only keeps
// `formatNumber`'s non-default options: extractNumberFormatOptions() reads
// this function's Intl.NumberFormat call (without executing it) to detect
// that tax rates need 2 fixed decimals ("21,00%"), unlike the canonical
// default (no fixed decimals).
function formatNumber(value) {
  if (value == null) return '';
  var num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
