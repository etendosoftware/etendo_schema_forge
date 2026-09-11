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
