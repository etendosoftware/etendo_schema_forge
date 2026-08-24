// All formatting helpers now come from the canonical
// templates/reports/helpers/report-html-helpers.js (both the on-screen HTML
// preview and the jsreport PDF/XLSX render path build their helper set from
// there — see buildJsreportHelpersString()). This report has no non-default
// formatNumber options.
//
// Two report-specific extras below (same pattern as report-general-ledger's
// csvField, ETP-4898):
//
// csvField — quotes a CSV field and doubles any embedded quote, only when the
// value actually needs it (contains a comma/quote/newline). Used exclusively
// by template-csv.hbs; the HTML/PDF/Excel templates never need it.
//
// round2 — the backend (AgingReportHandler.java) builds these amounts from
// BigDecimal without a fixed scale, so a value can arrive with more than 2
// decimal digits. The on-screen HTML/PDF report never shows this because it
// goes through formatCurrency (always 2 decimals); the flat Excel/CSV export
// prints the raw number instead (data-cell-type="number" needs a real,
// unformatted number — see template-excel.hbs), so it must round here to stay
// consistent with what the report itself shows. Returns a Number, not a
// string with forced trailing zeros: Excel already displays a plain number
// like 25.4 as "25.4", not "25.40" — the goal is capping at 2 decimals (never
// more), not padding to exactly 2.
function csvField(value) {
  if (value == null) return '';
  var s = String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function round2(value) {
  var num = Number(value);
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}
