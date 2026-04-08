// Group-break detection: tracks previous values per group field
var _prevGroupValues = {};

function isGroupBreak(field, currentValue) {
  var prev = _prevGroupValues[field];
  _prevGroupValues[field] = currentValue;
  return prev !== currentValue;
}

function resetGroupTracking() {
  _prevGroupValues = {};
}

// Format helpers
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

function formatBoolean(value) {
  return value ? 'Yes' : 'No';
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

function eq(a, b) { return a === b; }

// Sum the `field` values of rows whose `category` starts with categoryPrefix
function sumRowsByCategory(rows, categoryPrefix, field) {
  if (!Array.isArray(rows)) return 0;
  return rows
    .filter(function(r) { return (r.category || '').startsWith(categoryPrefix); })
    .reduce(function(sum, r) { return sum + (Number(r[field]) || 0); }, 0);
}
