// All formatting helpers come from the canonical
// templates/reports/helpers/report-html-helpers.js (both the on-screen HTML
// preview and the jsreport PDF/XLSX render path build their helper set from
// there — see buildJsreportHelpersString()). The document QR is no longer a
// helper either: it is precomputed as plain data (header.qrDataUrl) via
// computeDocumentQrDataUrl() before render, so this report declares no
// report-specific helpers (ETP-4908).
