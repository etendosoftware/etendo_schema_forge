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
// round2 — this report's unit cost comes from m_costing.cost, the running
// weighted-average cost the Average Costing algorithm recalculates on every
// transaction. That column can carry more than 2 decimal digits of
// precision. The on-screen HTML/PDF report never shows this
// because it goes through formatCurrency (always 2 decimals); the flat
// Excel/CSV export prints the raw number instead (data-cell-type="number"
// needs a real, unformatted number — see template-excel.hbs), so it must round
// here to stay consistent with what the report itself shows. Returns a Number,
// not a string with forced trailing zeros: Excel already displays a plain
// number like 25.4 as "25.4", not "25.40" — the goal is capping at 2 decimals
// (never more), not padding to exactly 2.

function round2(value) {
  // A product with no cost arrives as null: keep the cell blank instead of 0.
  if (value == null || value === '') return '';
  var num = Number(value);
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

// numCellType — html-to-xlsx writes a data-cell-type="number" cell holding no
// number as the literal NaN. A product with no cost (null unitCost /
// totalValuation) must be a genuinely empty cell, so the template asks for the
// cell type per value: "number" when there is one, "string" when there is not.
function numCellType(value) {
  return value == null || value === '' ? 'string' : 'number';
}

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
