// All formatting helpers now come from the canonical
// templates/reports/helpers/report-html-helpers.js (both the on-screen HTML
// preview and the jsreport PDF/XLSX render path build their helper set from
// there — see buildJsreportHelpersString()). This report has no non-default
// formatNumber options.
//
// csvField is a report-specific extra (ETP-4899, same pattern as
// report-trial-balance's) — quotes a CSV field and doubles any embedded quote,
// only when the value actually needs it (contains a comma/quote/newline). Used
// exclusively by template-csv.hbs; the HTML/PDF/XLSX templates never need it.
function csvField(value) {
  if (value == null) return '';
  var s = String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
