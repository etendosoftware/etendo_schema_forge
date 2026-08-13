// Helpers + the advanced-filter catalogs for the generic Payment form's invoice
// table. Outstanding invoices, payment methods, the third-party (bpartner) and
// G/L items all come from real NEO lookups, not from here.

/** Today's date as a local ISO string (yyyy-MM-dd), avoiding UTC off-by-one. */
export const todayISO = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/**
 * Money helpers for the payment workspace, using a POINT as the decimal
 * separator (e.g. 1250.5 → "1250.50"), consistent with the Sales Order lines and
 * the invoice columns (formatAmount). `parseAmount` treats commas as thousands.
 */
export const fmtAmount = (n) => Number(n || 0).toFixed(2);
export const parseAmount = (s) => {
  const v = parseFloat(String(s).replace(/,/g, ''));
  return Number.isNaN(v) ? 0 : v;
};

/** Formats a number as es-ES currency (no symbol): 1250 → "1.250,00". */
export const eur = (n) =>
  Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Parses an es-ES formatted amount ("1.250,00") back to a Number. */
export const parseEur = (s) => {
  const v = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? 0 : v;
};

// ── Advanced ("by conditions") filter for the invoice table ──────────────────
export const FILTER_FIELDS = [
  { key: 'no', label: 'Nº documento', type: 'text' },
  { key: 'bp', label: 'Contacto', type: 'text' },
  { key: 'fecha', label: 'Fecha de la factura', type: 'date' },
  { key: 'venc', label: 'Vencimiento', type: 'date' },
  { key: 'estado', label: 'Estado de vencimiento', type: 'estado' },
  { key: 'pend', label: 'Importe pendiente', type: 'num' },
];

export const FILTER_OPS = {
  text: [['contiene', 'contiene'], ['es', 'es igual a']],
  date: [['antes', 'antes de'], ['despues', 'después de']],
  num: [['mayor', 'mayor que'], ['menor', 'menor que'], ['igual', 'igual a']],
  estado: [['es', 'es']],
};

export const ESTADOS = [['vencida', 'Vencida'], ['proxima', 'Próxima a vencer'], ['aldia', 'Al día']];

export const fieldType = (k) => (FILTER_FIELDS.find((x) => x.key === k) || {}).type || 'text';

function parseDate(s) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || '');
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

export function estadoOf(r) {
  if (r.dias < 0) return 'vencida';
  return r.dias <= 7 ? 'proxima' : 'aldia';
}

function matchCond(r, c) {
  if (!c.field || c.value === '' || c.value == null) return true;
  const t = fieldType(c.field);
  if (t === 'estado') return estadoOf(r) === c.value;
  if (t === 'num') {
    const n = parseFloat(String(c.value).replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(n)) return true;
    if (c.op === 'mayor') return r.pend > n;
    if (c.op === 'menor') return r.pend < n;
    return Math.abs(r.pend - n) < 0.005;
  }
  if (t === 'date') {
    const a = parseDate(r[c.field]);
    const b = parseDate(c.value);
    if (!a || !b) return true;
    return c.op === 'antes' ? a < b : a > b;
  }
  const v = String(c.value).toLowerCase();
  const cell = String(r[c.field] || '').toLowerCase();
  return c.op === 'es' ? cell === v : cell.includes(v);
}

/** Filters invoice rows by a free-text query AND a list of advanced conditions. */
export function filterInvoices(rows, q, conds) {
  const qq = (q || '').trim().toLowerCase();
  return rows.filter((r) => {
    if (qq) {
      const hay = [r.no, r.bp, r.desc, r.metodo, r.proyecto, r.cc, r.fecha, r.venc, eur(r.pend), eur(r.total), eur(r.expected)]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return (conds || []).every((c) => matchCond(r, c));
  });
}
