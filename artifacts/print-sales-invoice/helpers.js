var QRCode = require('qrcode');

function formatDate(value) {
  if (value == null || value === '') return '';
  var d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}
function formatCurrency(value) {
  if (value == null) return '';
  var num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
function formatNumber(value) {
  if (value == null) return '';
  var num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US').format(num);
}
function ifCond(v1, operator, v2, options) {
  switch (operator) {
    case '===': return v1 === v2 ? options.fn(this) : options.inverse(this);
    case '!==': return v1 !== v2 ? options.fn(this) : options.inverse(this);
    default: return options.inverse(this);
  }
}

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
  if (header.dateinvoiced) parts.push('D:' + String(header.dateinvoiced).substring(0, 10));
  if (header.bp_name) parts.push('BP:' + header.bp_name);
  if (header.grandtotal) parts.push('$:' + header.grandtotal);
  if (header.currency) parts.push('C:' + header.currency);
  if (header.org_taxid) parts.push('TID:' + header.org_taxid);
  if (header.status) parts.push('S:' + header.status);

  var data = parts.length > 0 ? parts.join('|') : 'empty';
  return QRCode.toDataURL(data, { width: 120, margin: 1 });
}
