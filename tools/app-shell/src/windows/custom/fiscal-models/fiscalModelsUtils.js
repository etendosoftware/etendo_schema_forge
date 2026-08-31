import { formatCurrency } from '../../../lib/formatCurrency.js';

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

// Maps identChecks field ids (from casillas form) to their AEAT HTTP param names.
// Simple 1:1 string forwarding — value is set only when truthy.
const IDENT_PARAM_MAP = [
  ['bank_iban',          'IBAN'],
  ['bank_swift_bic',     'BIC'],
  ['bank_nombre',        'Bank'],
  ['bank_direccion',     'BankAddress'],
  ['bank_ciudad',        'BankCity'],
  ['bank_pais',          'CountryIso'],
  ['bank_sepa',          'SEPA'],
  ['baja_domiciliacion', 'Cancel_Modify_Debit'],
];

// Declaration types (tipo_declaracion) for which AEAT actually allows/requires an
// IBAN: Domiciliación (U), Devolución (D), and Devolución transferencia extranjero
// (X). For any other tipo, AEAT rejects the submission with error EDID065 if IBAN
// is present. Shared by generate303File and AeatSubmitFlow — both must guard the
// same set before hitting the network.
export const IBAN_REQUIRED_TIPOS = ['U', 'D', 'X'];

// Declaration type (tipo_declaracion) for which AEAT's NRC (Número de Referencia Completo)
// field actually applies: Ingreso (I) only, per AEAT's own bundled Modelo 303 spec. The backend
// already discards any NRC value for every other tipo before it reaches AEAT
// (`Fiscal303BoxesHandler#resolveNrcForSubmission`, mirroring Classic's
// `AEAT303PresentationServlet`) — this constant mirrors the Java side's
// `DECLARATION_TYPE_INGRESO` 1:1 so both layers agree on the same literal. UI-only visibility
// gate: NRC is NOT mandatory even for tipo I (no AEAT "required" rule found — a real AEAT flow,
// "reconocimiento de deuda", lets you submit an Ingreso declaration without one), so this must
// never be paired with a required/blocking validation.
export const DECLARATION_TYPE_INGRESO = 'I';

// Maps editable box numbers (from manualOverrides / liveBoxes) to AEAT HTTP param names.
// Only boxes that the AEAT module reads from inputParams (not computed from DB) are listed.
const BOX_PARAM_MAP = {
  42:  'Special_Compensations',      // compensaciones régimen especial / agrario
  43:  'Investment_Adjustment',      // regularización bienes de inversión
  44:  'Adjustment_Final_Percentage',// prorrata definitiva
  68:  'AnnualRegularAmt',           // regularización anual prorrata (T4/12 only)
  78:  'PreviousPeriodAmtApplied',   // cuotas a compensar aplicadas en este período
  108: 'AdministrativeCriteriaDiscrepancy', // discrepancia criterio administrativo (2024+)
  109: 'ReturnsPendingSettlement',   // devoluciones en tramitación (2023+)
  110: 'PreviousPeriodAmt',          // cuotas a compensar pendientes de períodos anteriores
  111: 'RectifyingAmount',           // rectificación. importe (2024+ rectificativa)
  124: 'OSS_SujetaYAcogida',         // operaciones OSS sujetas y acogidas (2021+)
};

/**
 * Calls GET /neo/fiscal303/generate and triggers a browser file download.
 * Returns { ok: true } on success, or { ok: false, error: string } on failure.
 *
 * All parameters are read from the casillas form state:
 *   identChecks   — identificación fields (tipo_declaracion, bank_iban, bank_swift_bic, etc.)
 *   manualOverrides — editable box values keyed by box number
 *   filename      — optional download filename (defaults to 303_<period>_<year>.txt)
 */
function applyRectificativaParams(params, identChecks) {
  params.set('IsComplementary', 'Y');
  if (identChecks.nro_justificante) params.set('ComplementaryNo', identChecks.nro_justificante);
  if (identChecks.motivo_rectificacion === 'R') params.set('RectifyingReason', 'Y');
  else if (identChecks.motivo_rectificacion === 'D')
    params.set('AdministrativeDiscrepancyRectifyingReason', 'Y');
}

export function applyIdentParams(params, identChecks) {
  for (const [field, paramName] of IDENT_PARAM_MAP) {
    const v = identChecks[field];
    if (v) params.set(paramName, paramName === 'IBAN' ? v.replace(/\s/g, '') : v);
  }
  if (identChecks.sin_actividad === true) params.set('Declaration_NoActivity', 'Y');
  // Sujeto pasivo inscrito en el Registro de devolución mensual (art. 30 RIVA) — read by
  // AEAT303Report.java's MONTHLY_REGISTER constant; box 65 defaults to "not registered"
  // (2) unless this is explicitly "Y" (ETP-5027).
  if (identChecks.redeme === true) params.set('MonthlyRegister', 'Y');
  // Concurso de acreedores — AEAT303Report2014's "IsConcurso"/"ConcursoType" constants, still
  // read unchanged through the override chain up to AEAT303Report2025 (ETP-5027).
  if (identChecks.concurso === true) params.set('IsConcurso', 'Y');
  if (identChecks.postconcursal === true) params.set('ConcursoType', 'Y');
  if (identChecks.complementaria === true) {
    params.set('IsComplementary', 'Y');
    if (identChecks.nro_justificante) params.set('ComplementaryNo', identChecks.nro_justificante);
  }
  // Rectificativa (2024+): IsComplementary=Y activates rectAssessment in the AEAT module.
  if (identChecks.rectificativa) applyRectificativaParams(params, identChecks);
}

function applyBoxParams(params, manualOverrides) {
  for (const [boxNum, paramName] of Object.entries(BOX_PARAM_MAP)) {
    const v = manualOverrides[Number(boxNum)];
    if (v != null) params.set(paramName, String(v));
  }
}

function parseServerMessage(raw) {
  try {
    const parsed = JSON.parse(raw);
    const full = parsed?.error?.message || parsed?.message || '';
    // Strip Java exception class prefix (e.g. "com.foo.SomeException: Actual message")
    const exIdx = full.indexOf('Exception: ');
    let cleaned = (exIdx >= 0 ? full.slice(exIdx + 11) : full).trim();
    // Openbravo message keys arrive as "@AEAT303_SomeKey@" — strip the @ delimiters
    if (cleaned.startsWith('@') && cleaned.endsWith('@')) cleaned = cleaned.slice(1, -1);
    return cleaned || undefined;
  } catch (_) { return undefined; }
}

export function triggerDownload(blob, downloadName) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

/**
 * Decodes a base64 string (no `data:` URI prefix) into a Blob, via the
 * standard atob → Uint8Array pattern.
 */
export function base64ToBlob(base64, mimeType = 'application/pdf') {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

/**
 * Decodes a base64 payload (e.g. `pdfBase64` from POST /fiscal303/submit)
 * and triggers a browser download — for endpoints that return the file
 * inline in a JSON response rather than as a fetch Response blob.
 */
export function triggerBase64Download(base64, downloadName, mimeType = 'application/pdf') {
  if (!base64) return;
  triggerDownload(base64ToBlob(base64, mimeType), downloadName);
}

export async function generate303File(decl, { token, apiBaseUrl, identChecks, manualOverrides, filename } = {}) {
  if (!token || !apiBaseUrl) return { ok: false, error: 'no_token' };

  const tipo = identChecks?.tipo_declaracion ?? decl.result?.kind ?? 'N';

  if (
    (IBAN_REQUIRED_TIPOS.includes(tipo) || identChecks?.rectificativa === true) &&
    !identChecks?.bank_iban?.trim()
  ) {
    return { ok: false, error: 'iban_required' };
  }

  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const params = new URLSearchParams({ year: decl.year, period: decl.period, tipo });

    if (identChecks) applyIdentParams(params, identChecks);
    if (manualOverrides) applyBoxParams(params, manualOverrides);

    const url = `${base}/fiscal303/generate?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      return { ok: false, error: `http_${res.status}`, serverMessage: parseServerMessage(raw) };
    }
    const blob = await res.blob();
    triggerDownload(blob, filename ?? `303_${decl.period}_${decl.year}.txt`);
    return { ok: true };
  } catch (_) {
    return { ok: false, error: 'network' };
  }
}

/**
 * Calls PUT /neo/fiscal303/declarations?id=... to persist a manual status
 * change. Despite the URL, this endpoint is generic across fiscal models —
 * both 303 and 349 declarations live in the same backend table.
 *
 * `submissionMethod` (ETP-4755, optional) distinguishes the manual "Presentado" paths
 * (`manual_ack` / `manual_no_receipt`) that would otherwise collide on the exact same
 * `submitted_ack` status as a real AEAT telematic submission (which sets its own
 * `submission_method: 'aeat_telematic'` server-side — see `AeatSubmitFlow.jsx`, never
 * sent from here). Omitted entirely for any status change that isn't one of the manual
 * "Presentado" paths (see `FmModel303Page.jsx`/`FmModel349Page.jsx`'s `handlePresent`),
 * so the backend's "explicit null means not sent" contract for this field is honored.
 * Returns { ok: true } on success, or { ok: false, error: string } on failure.
 */
export async function persistDeclarationStatus(id, newStatus, { token, apiBaseUrl, submissionMethod } = {}) {
  if (!token || !apiBaseUrl) return { ok: false, error: 'no_token' };
  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const body = { status: newStatus };
    if (submissionMethod) body.submissionMethod = submissionMethod;
    const res = await fetch(`${base}/fiscal303/declarations?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true };
  } catch (_) {
    return { ok: false, error: 'network' };
  }
}

/**
 * Calls PUT /fiscal303/declarations?id=... to persist the manually-entered identification
 * checks + box-value overrides for a Modelo 303 declaration, so they survive a page refresh.
 * Mirrors persistDeclarationStatus's contract: { ok: true } on success, or
 * { ok: false, error: string } on failure.
 *
 * The backend may respond { ok: true, manualDataApplied: false } (HTTP success, but the
 * payload itself failed server-side validation and was NOT saved — other fields in the same
 * PUT request still apply, but this function only ever sends manualData, so there's nothing
 * else to report). That case is surfaced here as { ok: false, error: 'rejected' } — the caller
 * can't do anything different between "the call failed" and "the call succeeded but the data
 * was rejected", so both collapse to the same ok:false contract.
 */
export async function persistManualData(id, manualData, { token, apiBaseUrl } = {}) {
  if (!token || !apiBaseUrl) return { ok: false, error: 'no_token' };
  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const res = await fetch(`${base}/fiscal303/declarations?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualData }),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const body = await res.json().catch(() => null);
    if (body?.manualDataApplied === false) return { ok: false, error: 'rejected' };
    return { ok: true };
  } catch (_) {
    return { ok: false, error: 'network' };
  }
}

const EMPTY_INCIDENTS = { blocking: 0, warning: 0, items: [] };

/**
 * Calls GET /neo/fiscal303/incidents?id=... to fetch the AEAT validation rows persisted for a
 * declaration — replaced (not appended) on every telematic submission attempt, test mode and
 * production alike (see ETP-4456, `Fiscal303BoxesHandler#handleSubmit` +
 * `FiscalDeclCrudHandler#replaceIncidents`). Maps the backend's generic `{code, message, severity}`
 * rows into the shape `IncidentsTab`/`SourcesTab` (`FmTabContent.jsx`) already expect from the demo
 * mock data (`DEMO_DECLARATIONS` in `FmListPage.jsx`): `origin` = code, `message` = message,
 * `severity` = the backend's own `severity` value (`'block'` for AEAT errors, `'warn'` for AEAT
 * warnings/avisos — added in ETP-4456's `severity` column on `ETGO_Fiscal_Decl_Incident`, so no
 * mapping/translation is needed here beyond a defensive fallback). Any row missing/blank `severity`
 * (e.g. data persisted before this column existed) defaults to `'block'`, matching the backend's
 * own default for legacy rows (`FiscalDeclCrudHandler#resolveSeverity`). `blocking`/`warning` are
 * now the actual counts of each severity in the response, rather than an assumed all-blocking
 * shape. These rows never carry a casilla number, so the existing "ir a Casilla X" button in
 * `IncidentsTab` (matched via `inc.origin?.match(/Casilla\s+\d+/i)`) naturally never renders for
 * them — left untouched, it's for a separate, not-yet-built casilla-validation feature.
 * Returns `{ blocking, warning, items }` on success, or the all-zero empty shape when
 * token/apiBaseUrl/id are missing or the request fails — safe to always destructure.
 *
 * `model` selects which route to hit (`303` by default). Per `AbstractFiscalHandler#handleIncidents`,
 * `/fiscal303/incidents` and `/fiscal349/incidents` are both backed by the same
 * `ETGO_Fiscal_Decl_Incident` table, so a 349 declaration can be queried the same way — it will
 * simply come back empty today, since only the 303 telematic submission flow writes rows there.
 */
export async function fetchDeclarationIncidents(id, { token, apiBaseUrl, model = '303' } = {}) {
  if (!token || !apiBaseUrl || !id) return EMPTY_INCIDENTS;
  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const res = await fetch(`${base}/fiscal${model}/incidents?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return EMPTY_INCIDENTS;
    const body = await res.json().catch(() => null);
    const rows = Array.isArray(body?.data) ? body.data : [];
    const items = rows.map(r => ({
      origin: r.code ?? '',
      message: r.message ?? '',
      severity: r.severity === 'warn' ? 'warn' : 'block',
    }));
    const blocking = items.filter(i => i.severity === 'block').length;
    const warning = items.filter(i => i.severity === 'warn').length;
    return { blocking, warning, items };
  } catch (_) {
    return EMPTY_INCIDENTS;
  }
}

export const STATUSES = [
  'draft', 'ready',
  'submitted', 'submitted_ext', 'submitted_ack',
];

export const STATUS_COLOR = {
  draft:         'blue',
  ready:         'green',
  submitted:     'teal',
  submitted_ext: 'violet',
  submitted_ack: 'emerald',
};

export const STATUS_ICON = {
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
  return formatCurrency('EUR', amount);
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

/**
 * Computes the real AEAT filing deadline for a fiscal declaration.
 *
 * Rules verified (2026-08) against the official Agencia Tributaria sede electrónica:
 *   - Modelo 303 plazos: https://sede.agenciatributaria.gob.es/Sede/iva/presentar-declaracion-iva-modelo-303/plazo-presentacion-modelo-303.html
 *   - Modelo 349 plazos: https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-349-decla_____n-recapitulativa-operaciones-intracomunitarias_/plazos-presentacion.html
 *
 * ── Quarterly (303 AND 349 — AEAT uses the identical rule for both models) ──
 *   T1 → April 20, T2 → July 20, T3 → October 20 (same year).
 *   T4 → January 30 of the FOLLOWING year. NOT day 20 — AEAT explicitly extends
 *   the last quarter's deadline ("...del último trimestre del año, que deberá
 *   presentarse durante los treinta primeros días naturales del mes de enero").
 *
 * ── Monthly 303 (IVA autoliquidación) ──
 *   Regular months → day 30 of the following month ("del 1 al 30 del mes
 *   siguiente"), NOT day 20.
 *   January        → extended through the LAST DAY OF FEBRUARY (28 or 29,
 *   leap-year aware) — "hasta el último día del mes de febrero en el caso de
 *   la autoliquidación correspondiente al mes de enero". This is a fixed
 *   AEAT extension, not a generic "+1 month, day 30" shift.
 *
 * ── Monthly 349 (declaración recapitulativa de operaciones intracomunitarias) ──
 *   Regular months → first 20 days of the following month → day 20 ("durante
 *   los veinte primeros días naturales del mes inmediato siguiente").
 *   July           → EXCEPTION: consolidated with August, filed during the
 *   first 20 days of SEPTEMBER → day 20 of month+2, not month+1 ("la
 *   correspondiente al mes de julio, que podrá presentarse durante el mes de
 *   agosto y los veinte primeros días naturales del mes de septiembre").
 *   August         → no separate rule needed: August's own "following month"
 *   deadline is already September 20, which is where July's extended
 *   deadline lands too — both converge on the same date.
 *
 * ── Deliberately NOT modeled: weekend/holiday shifting ──
 *   AEAT shifts a deadline to the next business day when it falls on a
 *   weekend or public holiday ("si el vencimiento del plazo... coincide con
 *   día inhábil, la fecha límite de presentación se traslada al día hábil
 *   inmediato posterior"). Doing this correctly would require a maintained
 *   Spanish national-holiday calendar (which also isn't the same calendar as
 *   AEAT's own "sede electrónica" non-working-day calendar in every year).
 *   That's out of scope for this KPI: "Por vencer" is a planning aid, not a
 *   legal compliance calculator, and skipping it only risks the count
 *   resolving a borderline declaration 1-3 days early/late in years where a
 *   deadline lands on a weekend. Revisit if this card starts being used for
 *   anything more binding than a dashboard nudge.
 *
 * AEAT deadline rules change periodically (this codebase already tracks a
 * 2024 AEAT rule change for Modelo 303 boxes elsewhere — see BOX_PARAM_MAP
 * above). Re-verify against the sede electrónica if these dates look wrong
 * for a given campaign year.
 */
// Quarterly deadline (303 AND 349 — AEAT uses the identical rule for both
// models). T4 deadline is day 30 of January, not day 20.
function getQuarterlyDeadline(year, quarter) {
  if (quarter === 4) return new Date(year + 1, 0, 30);
  const month = quarter * 3 + 1;
  return new Date(year, month - 1, 20);
}

// Monthly 349 deadline. July's 349 is consolidated with August → deadline is
// Sept 20, not Aug 20. Every other month → day 20 of the following month.
function getMonthly349Deadline(year, month) {
  if (month === 7) return new Date(year, 8, 20);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, 20);
}

// Monthly 303 deadline (and default fallback for any other/unspecified
// monthly model): day 30 of the following month, except January which
// extends to the last day of February. `new Date(year, 2, 0)` = "day 0 of
// March" = the last day of February, automatically leap-year aware.
function getMonthly303Deadline(year, month) {
  if (month === 1) return new Date(year, 2, 0);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, 30);
}

// Dispatches to the quarterly/monthly-303/monthly-349 rule above based on
// `period`'s shape and `model`. Split out of a single branch-heavy function
// (SonarQube S3776) into these small, independently-testable helpers — same
// dates, same logic, just decomposed.
function getDeadlineDate(model, year, period) {
  if (/^T\d$/.test(period)) {
    return getQuarterlyDeadline(year, parseInt(period[1], 10));
  }
  if (/^\d{2}$/.test(period)) {
    const m = parseInt(period, 10);
    return model === '349' ? getMonthly349Deadline(year, m) : getMonthly303Deadline(year, m);
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

/**
 * Re-runs the VIES validation for every NIF-IVA of a declaration that is still
 * pending, by calling POST /neo/fiscal349/validate-vies?year=&period=.
 *
 * Endpoint contract: 200 { validated, valid, invalid, stillPending }, where `validated` is
 * every pending operator the call ACCOUNTED FOR — deduplicated by `bpId`, since one partner
 * spans several operator rows (one per AEAT key, plus rectificative rows) and is checked once.
 * `valid + invalid + stillPending === validated` always holds; the UI relies on that invariant.
 *
 * POST-only by design: the call mutates C_BPartner, and the endpoint answers 405 to a GET.
 *
 * Return contract deliberately mirrors `generate349File` (`{ ok, error, serverMessage }`)
 * rather than `compute349Operators`'s bare `null`-on-failure: the caller has to tell the
 * user WHY nothing changed, and `parseServerMessage` is what turns a NEO error body
 * ("@AEAT349_SomeKey@", a Java exception message) into that text. `compute349Operators`
 * can collapse every failure into `null` only because its caller silently keeps the
 * previous operators; a user-initiated button cannot stay silent.
 *
 * NOTE ON "PENDING": `stillPending` absorbs THREE different outcomes and does not
 * distinguish them — the partner failed the eligibility gate (tax-id key is not NOI, or the
 * tax id is blank), VIES answered inconclusively (timeout, HTTP error, or the very common
 * `MS_MAX_CONCURRENT_REQ` — the member state is saturated; France returns it routinely), or
 * the partner was deferred past the batch cap of 25 partners per call.
 *
 * Callers must therefore NOT attribute a cause to this number: "the VIES service did not
 * answer" is false for the gate-failure and deferred cases, and "invalid data" is false for
 * the service case. The per-outcome breakdown is deliberately not surfaced at all — classic
 * collapses every failure into "pending" and GO matches it (aggregate counts only).
 * `stillPending` IS exactly what the banner will show on the next render, so re-running the
 * action is always a meaningful follow-up.
 */
export async function validate349Vies(decl, { token, apiBaseUrl } = {}) {
  if (!token || !apiBaseUrl) return { ok: false, error: 'no_token' };
  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const params = new URLSearchParams({ year: decl.year, period: decl.period });
    const res = await fetch(`${base}/fiscal349/validate-vies?${params}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      return { ok: false, error: `http_${res.status}`, serverMessage: parseServerMessage(raw) };
    }
    const data = await res.json();
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
    };
    // ETP-5027 (QA F2/F5) — `notEligible` and `failed` were split out of `stillPending`:
    // a gate failure is permanent (retrying can never change it) and a failed write-back is
    // not a success. Both default to 0 through `num()`, so a payload from an older backend
    // still parses — it simply reports neither bucket.
    return {
      ok: true,
      validated:    num(data?.validated),
      valid:        num(data?.valid),
      invalid:      num(data?.invalid),
      notEligible:  num(data?.notEligible),
      failed:       num(data?.failed),
      stillPending: num(data?.stillPending),
    };
  } catch (_) {
    return { ok: false, error: 'network' };
  }
}

/**
 * Calls POST /neo/fiscal349/generate and triggers a browser file download.
 * Returns { ok: true } on success, or { ok: false, error: string, serverMessage?: string }
 * on failure — same return contract as generate303File, so both 303 and 349 callers can
 * surface the real backend error message the same way (see applyGenerateError-style helpers
 * in FmModel303Page.jsx / FmModel349Page.jsx). This matters for 349 specifically because
 * AEAT3492010Report.generateElectronicFile() (org.openbravo.module.aeat349.es) throws real
 * validation exceptions the classic UI surfaces — e.g. Substitutive=Y with FormerStatement
 * blank, or Navarra=Y and Guipuzcoa=Y together — which are only reachable now that this
 * modal exposes those checkboxes (previously Substitutive was hardcoded to "N" and
 * Navarra/Guipuzcoa did not exist as parameters).
 */
export async function generate349File(decl, {
  token, apiBaseUrl, phone, contact,
  fileName, substitutive, formerStatement, representativeTaxId, navarra, guipuzcoa,
} = {}) {
  if (!token || !apiBaseUrl) return { ok: false, error: 'no_token' };
  try {
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    const body = new URLSearchParams({ year: decl.year, period: decl.period });
    if (phone)    body.set('phone',    phone);
    if (contact)  body.set('contact',  contact);
    if (fileName) body.set('fileName', fileName);
    // Substitutive/Navarra/Guipuzcoa are checkbox parameters — always sent, mirroring the
    // backend's own "must always be present" contract (Fiscal349BoxesHandler#handleGenerate,
    // AEAT3492010Report.generateLine1 NPEs on Substitutive if the key is absent).
    body.set('substitutive', substitutive ? 'Y' : 'N');
    body.set('navarra',      navarra      ? 'Y' : 'N');
    body.set('guipuzcoa',    guipuzcoa    ? 'Y' : 'N');
    if (formerStatement)      body.set('formerStatement',      formerStatement);
    if (representativeTaxId)  body.set('representativeTaxId',  representativeTaxId);
    const res = await fetch(`${base}/fiscal349/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      return { ok: false, error: `http_${res.status}`, serverMessage: parseServerMessage(raw) };
    }
    const blob = await res.blob();
    // Honour the user's "Nombre del fichero" (FileGenModal, `fm.filegen.filename`) — the
    // backend sets Content-Disposition from it, but a fetch+blob+a.download flow ignores
    // that header, so the name has to be applied here (mirrors generate303File).
    // Unlike FileGenModal303, the 349 modal's field starts empty with an extension-less
    // placeholder, so the typed value carries no extension: append it only when missing
    // instead of unconditionally, which would yield "foo.txt.txt".
    // .txt to match the Etendo classic Tax Report Launcher output extension
    const typedName = fileName?.trim();
    const downloadName = typedName
      ? (/\.txt$/i.test(typedName) ? typedName : `${typedName}.txt`)
      : `349_${decl.period}_${decl.year}.txt`;
    triggerDownload(blob, downloadName);
    return { ok: true };
  } catch (_) {
    return { ok: false, error: 'network' };
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

/**
 * Number of days the "Por vencer" KPI looks ahead — a rolling window, not "any day in the
 * future". A deadline exactly `UPCOMING_DEADLINE_WINDOW_DAYS` days from today still counts
 * (inclusive upper bound); one day further out does not. See `isUpcomingDeadline` below.
 */
const UPCOMING_DEADLINE_WINDOW_DAYS = 7;

/**
 * Per-declaration "is this one due within the next `UPCOMING_DEADLINE_WINDOW_DAYS` days"
 * predicate — the single source of truth backing the "Por vencer" KPI card, extracted out of
 * `countUpcomingDeadlines` (ETP-4755, KPI-cards-as-filters) so the KPI's own count and the
 * list's "Por vencer" filter can never silently drift apart. Deliberately not derived from
 * `computeUpcomingDeadlines`: that helper is a "top N nearest deadlines for a panel" API
 * (defaults to `limit = 5`) that never compares against "today" at all — it returns the
 * nearest deadlines regardless of how far out (or how overdue) they are, which is a different,
 * legitimate use case ("what's coming up next" vs. this predicate's "is this urgent this
 * week"). This predicate:
 *   - reuses the same AEAT deadline rule (`getDeadlineDate`) and the same completed-status
 *     exclusion (`COMPLETED_STATUSES`), so a presented/skipped declaration is never counted;
 *   - compares the deadline against the real current date (`referenceDate`, defaults to
 *     `new Date()` — never mocked/stale), true only when the deadline falls within
 *     [today, today + UPCOMING_DEADLINE_WINDOW_DAYS] inclusive on both ends. A deadline 80 days
 *     out (e.g. a 303/period-09 draft due Oct 30 when "today" is Aug 11) is genuinely not
 *     "upcoming" in any intuitive sense — narrowed from the original unbounded
 *     "today-or-later" rule for exactly that reason.
 */
export function isUpcomingDeadline(decl, referenceDate = new Date()) {
  if (COMPLETED_STATUSES.has(decl.status)) return false;
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + UPCOMING_DEADLINE_WINDOW_DAYS);
  const deadline = getDeadlineDate(decl.model, decl.year, decl.period);
  return deadline != null && deadline >= today && deadline <= windowEnd;
}

/**
 * Real count of declarations still pending a real AEAT deadline — used by the "Por vencer"
 * KPI card. Has no artificial cap — it is a count, not a truncated preview list. See
 * `isUpcomingDeadline` above for the per-declaration rule this counts.
 */
export function countUpcomingDeadlines(decls, referenceDate = new Date()) {
  return decls.filter(d => isUpcomingDeadline(d, referenceDate)).length;
}
