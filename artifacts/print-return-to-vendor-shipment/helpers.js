var QRCode = require('qrcode');

// All other formatting helpers now come from the canonical
// templates/reports/helpers/report-html-helpers.js (both the on-screen HTML
// preview and the jsreport PDF/XLSX render path build their helper set from
// there — see buildJsreportHelpersString()). qrCode is report-specific and
// stays here as the one real extra this report needs.
// Async helper: generates QR code as base64 data URL
// Usage in template: {{qrCode header}}
// jsreport supports async helpers that return promises
function qrCode(header) {
  if (!header || typeof header !== 'object') {
    return QRCode.toDataURL('no data', { width: 120, margin: 1 });
  }
  var parts = [];
  if (header.doc_type) parts.push('T:' + header.doc_type);
  if (header.documentno) parts.push('N:' + header.documentno);
  if (header.movementdate) parts.push('D:' + String(header.movementdate).substring(0, 10));
  if (header.bp_name) parts.push('BP:' + header.bp_name);
  if (header.org_taxid) parts.push('TID:' + header.org_taxid);
  if (header.status) parts.push('S:' + header.status);

  var data = parts.length > 0 ? parts.join('|') : 'empty';
  return QRCode.toDataURL(data, { width: 120, margin: 1 });
}
