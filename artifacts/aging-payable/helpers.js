// All formatting helpers now come from the canonical
// templates/reports/helpers/report-html-helpers.js (both the on-screen HTML
// preview and the jsreport PDF/XLSX render path build their helper set from
// there — see buildJsreportHelpersString()). This report has no non-default
// formatNumber options; `round2` below is its one report-specific extra.
//
// csvField is NO LONGER declared here: ETP-5032 promoted it to that canonical
// set, because it had been hand-copied into nine reports and every copy only
// quoted the value — none of them neutralized spreadsheet formula injection
// (CWE-1236, ADR-0004). template-csv.hbs keeps calling {{{csvField x}}}
// unchanged; the canonical helper now also prefixes an apostrophe when the
// value starts with a formula trigger.
//
// round2 — the backend (AgingReportHandler.java) builds these amounts
// from BigDecimal without a fixed scale, so a value can arrive with more
// than 2 decimal digits. The on-screen HTML/PDF report never shows this
// because it goes through formatCurrency (always 2 decimals); the flat
// Excel/CSV export prints the raw number instead (data-cell-type="number"
// needs a real, unformatted number — see template-excel.hbs), so it must round
// here to stay consistent with what the report itself shows. Returns a Number,
// not a string with forced trailing zeros: Excel already displays a plain
// number like 25.4 as "25.4", not "25.40" — the goal is capping at 2 decimals
// (never more), not padding to exactly 2.

function round2(value) {
  var num = Number(value);
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}
