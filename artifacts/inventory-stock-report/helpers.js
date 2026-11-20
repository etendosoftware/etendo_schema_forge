// All formatting helpers now come from the canonical
// templates/reports/helpers/report-html-helpers.js (both the on-screen HTML
// preview and the jsreport PDF/XLSX render path build their helper set from
// there — see buildJsreportHelpersString()). This report has no non-default
// formatNumber options.
//
// csvField is NO LONGER declared here: ETP-5032 promoted it to that canonical
// set, because it had been hand-copied into nine reports and every copy only
// quoted the value — none of them neutralized spreadsheet formula injection
// (CWE-1236, ADR-0004). template-csv.hbs keeps calling {{{csvField x}}}
// unchanged; the canonical helper now also prefixes an apostrophe when the
// value starts with a formula trigger.
//
// dashIfBlank — a product with stock but no cost arrives with a null unitCost /
// totalValuation. Every output of this report shows the same "—" placeholder the
// Warehouse > Products tab uses, instead of an empty cell (ETP-5555). `raw` is the
// value as the handler sent it and decides whether it is blank; `shown` is that
// same value already rounded by round2. A real zero is a cost, not a blank, so it
// keeps its value.
//
// Used by template-excel.hbs and template-csv.hbs only: jsreport loads this file
// for those. The on-screen HTML preview does NOT load a report's helpers.js, so
// template.hbs gets the same placeholder from the canonical `eq` helper instead
// ({{#if (eq x null)}}), which every render path ships.
function dashIfBlank(raw, shown) {
  return raw == null || raw === '' ? '\u2014' : shown;
}
