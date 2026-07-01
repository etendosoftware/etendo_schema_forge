// ── Box computation ──────────────────────────────────────────────────
// Returns { boxes, summary } from GET /neo/fiscal303/boxes?year=&period=.
// Falls back to hardcoded GOOrg mock data when token/apiBaseUrl are absent or the request fails.
export async function computeBoxes303(decl, { token, apiBaseUrl } = {}) {
  if (token && apiBaseUrl) {
    try {
      const base = apiBaseUrl.replace(/\/[^/]+$/, '');
      const params = new URLSearchParams({ year: decl.year, period: decl.period });
      const url = `${base}/fiscal303/boxes?${params}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) return await res.json();
    } catch (_) {
      // fall through to mock
    }
  }

  // ── Mock fallback (demo / no backend) ─────────────────────────────
  await new Promise(r => setTimeout(r, 900));

  if (decl.year === 2026 && decl.period === 'T2') {
    return {
      boxes: {
        1:44, 3:1.76, 4:201, 6:14.07,
        7:6162.60, 9:1294.15, 27:1309.98,
        28:175186, 29:36789.06, 45:36789.06, 46:-35479.08,
        59:23, 60:36,
      },
      summary: { accrued:1309.98, deductible:36789.06, result:-35479.08 },
    };
  }
  if (decl.year === 2026 && decl.period === 'T1') {
    return {
      boxes: { 7:3248, 9:682.08, 27:682.08, 28:16659, 29:3498.39, 45:3498.39, 46:-2816.31 },
      summary: { accrued:682.08, deductible:3498.39, result:-2816.31 },
    };
  }
  return null;
}

/**
 * Calls GET /neo/fiscal303/generate and triggers a browser file download.
 * Returns true on success, false on error.
 */
export async function generate303File(decl, { token, apiBaseUrl } = {}) {
  if (!token || !apiBaseUrl) return false;
  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const tipo = decl.result?.kind ?? 'N';
    const params = new URLSearchParams({ year: decl.year, period: decl.period, tipo });
    const url = `${base}/fiscal303/generate?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `303_${decl.period}_${decl.year}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch (_) {
    return false;
  }
}

// 'pending' is kept intentionally: Modelo 349 uses it as its initial draft state.
export const STATUSES = [
  'skipped', 'pending', 'draft', 'ready',
  'submitted', 'submitted_ext', 'submitted_ack',
];

export const STATUS_COLOR = {
  skipped:       'grey',
  pending:       'orange',
  draft:         'blue',
  ready:         'green',
  submitted:     'teal',
  submitted_ext: 'violet',
  submitted_ack: 'emerald',
};

export const STATUS_ICON = {
  skipped:       '×',
  pending:       '○',
  draft:         '✎',
  ready:         '✓',
  submitted:     '✓',
  submitted_ext: '↗',
  submitted_ack: '☑',
};

export const STATUS_ORDER = [...STATUSES];

export function formatPeriod(period) {
  if (!period) return '—';
  if (/^T\d$/.test(period)) return period;
  if (/^\d{2}$/.test(period)) return `${parseInt(period, 10)}M`;
  return period;
}

export function formatAmount(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function formatPercent(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function fmtDecl(decl) {
  return `${decl.model} ${decl.year} ${formatPeriod(decl.period)}`;
}

function roundEur(n) {
  return Math.round(n * 100) / 100;
}

// ── Box mapping helpers ───────────────────────────────────────────
// 21% → boxes [7, -, 9]; 10%+7%+8% (merged) → [4, -, 6]; 4%+5% → [1, -, 3]
// 0% → [150, -, 152]; 2% (2026 new) → [165, -, 167]
const SALES_MERGE = [
  { rates: ['21'],           boxes: [7, 9] },
  { rates: ['10', '7', '8'], boxes: [4, 6] },
  { rates: ['4', '5'],       boxes: [1, 3] },
  { rates: ['0'],            boxes: [150, 152] },
  { rates: ['2'],            boxes: [165, 167] },
];

// 1.75% recargo 2023+ → 156/158; others unchanged
const EC_RATE_MAP = { '1.4': [19, 21], '5.2': [22, 24], '0.5': [16, 18], '1.75': [156, 158] };

const PURCH_MAP = [
  ['purchNormal',    28, 29],
  ['purchInvGoods',  30, 31],
  ['purchImport',    32, 33],
  ['purchImportInv', 34, 35],
  ['purchIntraCorr', 36, 37],
  ['purchIntraInv',  38, 39],
  ['purchRectif',    40, 41],
];

function fillSalesBoxes(b, byRate) {
  for (const { rates, boxes: [baseBox, taxBox] } of SALES_MERGE) {
    let base = 0, tax = 0;
    for (const r of rates) {
      base += byRate[r]?.base ?? 0;
      tax  += byRate[r]?.tax  ?? 0;
    }
    if (base) b[baseBox] = roundEur(base);
    if (tax)  b[taxBox]  = roundEur(tax);
  }
}

function fillECBoxes(b, ecByRate) {
  for (const [rate, [baseBox, taxBox]] of Object.entries(EC_RATE_MAP)) {
    const d = ecByRate[rate] ?? {};
    if (d.base) b[baseBox] = roundEur(d.base);
    if (d.tax)  b[taxBox]  = roundEur(d.tax);
  }
}

function fillPurchBoxes(b, data) {
  for (const [key, baseBox, taxBox] of PURCH_MAP) {
    const d = data[key];
    if (d?.base) b[baseBox] = roundEur(d.base);
    if (d?.tax)  b[taxBox]  = roundEur(d.tax);
  }
  if (data.specialComp  != null) b[42] = roundEur(data.specialComp);
  if (data.invAdjust    != null) b[43] = roundEur(data.invAdjust);
  if (data.proRataFinal != null) b[44] = roundEur(data.proRataFinal);
}

/**
 * Maps aggregated invoice data to 303 box numbers, mirroring AEAT303Report2014 logic.
 *
 * @param {object} data
 *   salesByRate     { '21':{base,tax}, '10':{base,tax}, '7':{base,tax}, '8':{base,tax}, '4':{base,tax}, '0':{base,tax}, '2':{base,tax} }
 *   ecByRate        recargo equivalencia: { '1.4':{base,tax}, '5.2':{base,tax}, '0.5':{base,tax} }
 *   euPurch         { base, tax }  — intracomunitarias adquisiciones (boxes 10/11)
 *   ispPurch        { base, tax }  — inversión sujeto pasivo (boxes 12/13)
 *   purchNormal     { base, tax }  — operaciones interiores corrientes (boxes 28/29)
 *   purchInvGoods   { base, tax }  — bienes inversión (boxes 30/31)
 *   purchImport     { base, tax }  — importaciones corrientes (boxes 32/33)
 *   purchImportInv  { base, tax }  — importaciones inversión (boxes 34/35)
 *   purchIntraCorr  { base, tax }  — intracom. corrientes (boxes 36/37)
 *   purchIntraInv   { base, tax }  — intracom. inversión (boxes 38/39)
 *   purchRectif     { base, tax }  — rectificaciones (boxes 40/41)
 *   specialComp     number         — compensaciones régimen especial (box 42)
 *   invAdjust       number         — regularización bienes inversión (box 43)
 *   proRataFinal    number         — regularización prorrata (box 44)
 *   previousCompensation number    — compensación período anterior (box 67, info only)
 *   intracommSales  number         — entregas intracom. exentas (box 59)
 *   exports         number         — exportaciones (box 60)
 *
 * @returns {{ boxes: {[boxNum:number]: number}, summary: {accrued,deductible,result} }}
 */
export function deriveBoxes303(data) {
  const b = {};

  fillSalesBoxes(b, data.salesByRate ?? {});

  // EU acquisitions → boxes 10, 11
  const euPurch = data.euPurch ?? {};
  if (euPurch.base) b[10] = roundEur(euPurch.base);
  if (euPurch.tax)  b[11] = roundEur(euPurch.tax);

  // ISP (inverse charge) → boxes 12, 13
  const ispPurch = data.ispPurch ?? {};
  if (ispPurch.base) b[12] = roundEur(ispPurch.base);
  if (ispPurch.tax)  b[13] = roundEur(ispPurch.tax);

  fillECBoxes(b, data.ecByRate ?? {});

  // Total devengada (box 27) = 152+167+03+155+06+09+11+13+15+158+170+18+21+24+26
  const accruedBoxes = [3, 6, 9, 11, 13, 15, 18, 21, 24, 26, 152, 155, 158, 167, 170];
  b[27] = roundEur(accruedBoxes.reduce((s, box) => s + (b[box] ?? 0), 0));

  fillPurchBoxes(b, data);

  // Total deducible (box 45) = (29+31+33+35+37+39+41+42+43+44)
  const deductBoxes = [29, 31, 33, 35, 37, 39, 41, 42, 43, 44];
  b[45] = roundEur(deductBoxes.reduce((s, box) => s + (b[box] ?? 0), 0));

  // Resultado (box 46) = 27 − 45
  b[46] = roundEur((b[27] ?? 0) - (b[45] ?? 0));

  // ── Info adicional ─────────────────────────────────────────────
  if (data.intracommSales != null) b[59] = roundEur(data.intracommSales);
  if (data.exports        != null) b[60] = roundEur(data.exports);

  const summary = {
    accrued:    b[27] ?? 0,
    deductible: b[45] ?? 0,
    result:     b[46] ?? 0,
  };
  if (data.previousCompensation != null) {
    summary.previousCompensation = data.previousCompensation;
  }

  return { boxes: b, summary };
}

const COMPLETED_STATUSES = new Set([
  'submitted', 'submitted_ext', 'submitted_ack', 'skipped',
]);

function getDeadlineDate(model, year, period) {
  if (/^T\d$/.test(period)) {
    const q = parseInt(period[1], 10);
    const month = q === 4 ? 1 : q * 3 + 1;
    const y = q === 4 ? year + 1 : year;
    return new Date(y, month - 1, 20);
  }
  if (/^\d{2}$/.test(period)) {
    const m = parseInt(period, 10);
    const nextM = m === 12 ? 1 : m + 1;
    const y = m === 12 ? year + 1 : year;
    return new Date(y, nextM - 1, 20);
  }
  return null;
}

/**
 * Returns true if any invoice affecting the given declaration's period was
 * updated after sinceMs (Unix ms timestamp). Returns false on any error.
 */
export async function checkModified303(decl, sinceMs, { token, apiBaseUrl } = {}) {
  if (!token || !apiBaseUrl) return false;
  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const params = new URLSearchParams({ year: decl.year, period: decl.period, since: sinceMs });
    const url = `${base}/fiscal303/modified?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const data = await res.json();
    return data.modified === true;
  } catch (_) {
    return false;
  }
}

// ── Model 349 utilities ───────────────────────────────────────────

export async function compute349Operators(decl, { token, apiBaseUrl } = {}) {
  if (token && apiBaseUrl) {
    try {
      const base = apiBaseUrl.replace(/\/[^/]+$/, '');
      const params = new URLSearchParams({ year: decl.year, period: decl.period });
      const res = await fetch(`${base}/fiscal349/operators?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  // Mock fallback — demo mode only (no token)
  await new Promise(r => setTimeout(r, 700));
  if (decl.year === 2026 && (decl.period === 'T1' || decl.period === 'T2')) {
    return {
      operators: [
        { bpId: '1', nif: 'IT12345678901', name: 'Bramini Vino S.r.l.',      key: 'A', base: '12450.00' },
        { bpId: '2', nif: 'FR40123456789', name: 'Olives de Provence SARL',   key: 'A', base: '6800.00'  },
        { bpId: '3', nif: 'DE123456789',   name: 'Bayern Technik GmbH',        key: 'E', base: '17600.00' },
        { bpId: '4', nif: 'PT501234567',   name: 'Lusitana Serviços Lda',      key: 'S', base: '650.00'   },
        { bpId: '5', nif: 'NL123456789B01',name: 'Amsterdam Trading BV',       key: 'I', base: '1450.00'  },
      ],
      summary: { totalE: '17600.00', totalS: '650.00', totalA: '19250.00', totalI: '1450.00' },
    };
  }
  return null;
}

export async function generate349File(decl, { token, apiBaseUrl, phone, contact } = {}) {
  if (!token || !apiBaseUrl) return false;
  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const body = new URLSearchParams({ year: decl.year, period: decl.period });
    if (phone)   body.set('phone',   phone);
    if (contact) body.set('contact', contact);
    const res = await fetch(`${base}/fiscal349/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `349_${decl.period}_${decl.year}.349`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch (_) {
    return false;
  }
}

export async function checkModified349(decl, sinceMs, { token, apiBaseUrl } = {}) {
  if (!token || !apiBaseUrl) return false;
  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const params = new URLSearchParams({ year: decl.year, period: decl.period, since: sinceMs });
    const res = await fetch(`${base}/fiscal349/modified?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.modified === true;
  } catch (_) {
    return false;
  }
}

export function computeUpcomingDeadlines(decls, limit = 5) {
  return decls
    .filter(d => !COMPLETED_STATUSES.has(d.status))
    .map(d => {
      const deadline = getDeadlineDate(d.model, d.year, d.period);
      return deadline ? { decl: d, deadline } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.deadline - b.deadline)
    .slice(0, limit);
}
