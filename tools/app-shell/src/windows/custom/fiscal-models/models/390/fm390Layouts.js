// Modelo 390 — declarative layout of the "Casillas" tab (ETP-5716).
//
// Pure data + pure helpers (no React, no network), so the layout, the search index and the
// client-side derivation can be read and tested on their own. Rendered by FmBoxes390.jsx.
//
// Box numbers are the AEAT ones (no leading zeros), the same keys the backend returns in
// `GET /fiscal390/boxes` → `boxes` (`Fiscal390BoxLayout` in com.etendoerp.go). Manual inputs are
// named by the classic `TaxReportParameter` search keys the backend reads from
// `manualData.aeatInputs` (`Fiscal390DerivedBoxes.INPUT_KEYS`) and forwards to the classic file
// generator. Labels follow the AEAT "Instrucciones del modelo 390" and the classic parameter names.
//
// Out of scope in this version and therefore NOT shown (the backend may still return them):
// criterio de caja, recargo de equivalencia, régimen simplificado, REAGYP, bienes usados, agencias
// de viajes, grupo de entidades and prorrata (Jira ETP-5716, "Fuera de alcance").
//
// ── Block shape ───────────────────────────────────────────────────────────────
//   { id, titleKey, kind, ... }
//   kind 'identity' | 'devengo' | 'statistics' | 'representative'
//        read from the organization / the header "Tipo" control (FmBoxes390 renders them)
//   kind 'boxes'      → { columns: [i18n keys], items: [Row | RateGroup], toggle?, note? }
//
//   Row       { id, labelKey, cells: [Cell|null, ...], total?, formula?, noteKey? }
//   RateGroup { id, type: 'rates', labelKey, rates: [{ rate, cells }], total?: Row }
//             rate rows whose boxes are all zero are folded ("Sin operaciones").
//   Cell      a box number (calculated, read-only), or
//             { box?, input, percent?, nonNegative?, liquidationOnly?, monthlyReturnOnly? } — a
//             manual input (`input` = search key); `box` is the AEAT number shown in the cell
//             (absent for per-month inputs). `liquidationOnly`: disabled in territory mode;
//             `monthlyReturnOnly`: disabled unless ISMONTHLYRETURN = 'Y' (classic
//             AEAT390_MonthlyReturn_Check).

// ── Manual inputs (classic TaxReportParameter search keys) ───────────────────
export const INPUT = Object.freeze({
  COMPENSATION: 'LIQANUAL_COMPENSATION',                 // [85]
  REGULARIZATION: 'LIQANUAL_VAT_LAW_REGULARIZATION',     // [658]
  VAT_IMPORT: 'LIQANUAL_VAT_IMPORT',                     // [659]
  NO_CURRENT_TYPE_BASE: 'LIQANUAL_NoCurrentTypeBASE',    // [660]
  NO_CURRENT_TYPE_AMOUNT: 'LIQANUAL_NoCurrentTypeAMOUNT', // [661]
  COMMON_TERRITORY: 'COMMON_TERRITORY',                  // [87]
  ALAVA: 'ALAVA',                                        // [88]
  GUIPUZCOA: 'GUIPUZCOA',                                // [89]
  VIZCAYA: 'VIZCAYA',                                    // [90]
  NAVARRA: 'NAVARRA',                                    // [91]
  COMMON_TERRITORY_COMPENSATION: 'COMMON_TERRITORY_COMPENSATION', // [93]
  TOTAL_LASTPERIOD: 'TOTAL_LASTPERIOD',                  // [97]
  TOTAL_LASTPERIOD_DEVOLVER: 'TOTAL_LASTPERIOD_DEVOLVER', // [98]
  END_COMPENSATION: 'LIQANUAL_ENDCOMPENSATION',          // [662]
  OPS_SUJETAS_OSS: '390OPSUJETASCONOSS',                 // [127]
  OPS_INTRAGRUPO: '390OPSINTRAGRUPO',                    // [128]
  REAGYP: '390REAGYP',                                   // [101] (out of scope, kept for [108])
  USED_GOODS: '390USED_GOODS',                           // [227] (out of scope, kept for [108])
  TRAVEL_AGENCY: '390TRAVEL_AGENCY',                     // [228] (out of scope, kept for [108])
  OPER_MONTHLY_RETURN: 'OPER_MONTHLYRETURN',             // [111]
});

/**
 * Inputs an older GO version could store but the 2025 model no longer has, dropped on save:
 * `390OTHER_UEMENBER` (old [112], never written by classic from 2021 on, not in DR390e2025).
 */
export const OBSOLETE_INPUTS_390 = Object.freeze(['390OTHER_UEMENBER']);

/** Per-month inputs of "Resultado de las liquidaciones": INGRESAR_01..12 / DEVOLVER_01..12. */
export const MONTH_CODES = Object.freeze(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
export const ingresarKey = (month) => `INGRESAR_${month}`;
export const devolverKey = (month) => `DEVOLVER_${month}`;

/**
 * Highest value of one territory percentage: classic rejects 100 (AEAT390Report, each of [87]-[91]
 * must be ≤ 99 and together they must add up to 100).
 */
export const TERRITORY_PERCENT_MAX = 99;

/** Territory percentages ([87]-[91]); any of them > 0 switches the result to [92]-[94]. */
export const TERRITORY_PERCENT_INPUTS = Object.freeze([
  INPUT.COMMON_TERRITORY, INPUT.ALAVA, INPUT.GUIPUZCOA, INPUT.VIZCAYA, INPUT.NAVARRA,
]);
/** Every input of the territory block (cleared when "Tributo a varias Administraciones" is off). */
export const TERRITORY_INPUTS = Object.freeze([...TERRITORY_PERCENT_INPUTS, INPUT.COMMON_TERRITORY_COMPENSATION]);

// Classic flag parameters (values 'Y' / 'N'), stored in `manualData.aeatInputs` next to the
// amounts so the backend forwards them to the classic file generator verbatim.
export const FLAG = Object.freeze({
  MONTHLY_RETURN: 'ISMONTHLYRETURN',          // Inscrito en el registro de devolución mensual
  CONCURSO: 'ConcursoAcr',                     // Declarado en concurso de acreedores en el ejercicio
  CONCURSO_LAST_PERIOD: 'ConcursoUltPer',      // ... en el último periodo
  THIRD_PARTY_DECLARATION: 'YEARLY_BP_DECLARATION', // Obligado a presentar la declaración anual de operaciones con terceros (347)
  SUPPLEMENTARY: 'ISSUPPLEMENTARY',            // Declaración sustitutiva
  RECTIFICATION: 'ISRECTIFICATION',            // Sustitutiva por rectificación de cuotas
  SUPPLEMENTARY_NO: 'SUPPLEMENTARYNO',         // Identificador de la declaración anterior
});

// ── Rate rows ─────────────────────────────────────────────────────────────────
const r = (rate, base, cuota) => Object.freeze({ rate, cells: Object.freeze([base, cuota]) });

const rateGroup = (id, labelKey, rates, total) => Object.freeze({
  id, type: 'rates', labelKey, rates: Object.freeze(rates), total: total ? Object.freeze(total) : null,
});

const row = (id, labelKey, cells, extra = {}) => Object.freeze({ id, labelKey, cells: Object.freeze(cells), ...extra });

const input = (key, extra = {}) => Object.freeze({ input: key, ...extra });

const COLS_DEVENGADO = Object.freeze(['fm.box.colHeader.base', 'fm.box.colHeader.cuota']);
const COLS_DEDUCIBLE = Object.freeze(['fm.box.colHeader.base', 'fm.box.colHeader.cuota_ded']);
const COLS_SINGLE = Object.freeze(['fm.m390.col.amount']);
const COLS_MONTHS = Object.freeze(['fm.m390.col.to_pay', 'fm.m390.col.to_return']);

// ── The 11 blocks, in AEAT order ─────────────────────────────────────────────
const BLOCKS = Object.freeze([
  Object.freeze({ id: 'identificacion', titleKey: 'fm.m390.block.identificacion', kind: 'identity' }),
  Object.freeze({ id: 'devengo', titleKey: 'fm.m390.block.devengo', kind: 'devengo' }),
  Object.freeze({ id: 'datos_estadisticos', titleKey: 'fm.m390.block.datos_estadisticos', kind: 'statistics' }),
  Object.freeze({ id: 'representante', titleKey: 'fm.m390.block.representante', kind: 'representative' }),
  Object.freeze({
    id: 'iva_devengado', titleKey: 'fm.m390.block.iva_devengado', kind: 'boxes', icon: 'accrued',
    columns: COLS_DEVENGADO,
    items: Object.freeze([
      rateGroup('reg_ordinario', 'fm.m390.row.reg_ordinario', [
        r('0', 700, 701), r('2', 667, 668), r('4', 1, 2), r('5', 702, 703),
        r('7.5', 669, 670), r('10', 3, 4), r('21', 5, 6),
      ]),
      rateGroup('adq_intra_bienes', 'fm.m390.row.adq_intra_bienes', [
        r('0', 716, 717), r('2', 683, 684), r('4', 21, 22), r('5', 718, 719),
        r('7.5', 685, 686), r('10', 23, 24), r('21', 25, 26),
      ]),
      rateGroup('adq_intra_servicios', 'fm.m390.row.adq_intra_servicios', [
        r('0', 720, 721), r('2', 687, 688), r('4', 545, 546), r('5', 722, 723),
        r('7.5', 689, 690), r('10', 547, 548), r('21', 551, 552),
      ]),
      row('isp', 'fm.m390.row.isp', [27, 28]),
      row('mod_bases', 'fm.m390.row.mod_bases', [29, 30]),
      row('mod_bases_concurso', 'fm.m390.row.mod_bases_concurso', [31, 32]),
      row('total_bases_cuotas', 'fm.m390.row.total_bases_cuotas', [33, 34], { total: true }),
      row('total_devengado', 'fm.m390.row.total_devengado', [null, 47], { total: true, formula: '(34 + RE + 44)' }),
    ]),
  }),
  Object.freeze({
    id: 'iva_deducible', titleKey: 'fm.m390.block.iva_deducible', kind: 'boxes', icon: 'deductible',
    columns: COLS_DEDUCIBLE,
    items: Object.freeze([
      rateGroup('op_int_corrientes', 'fm.m390.row.op_int_corrientes', [
        r('2', 695, 696), r('4', 190, 191), r('5', 724, 725), r('7.5', 697, 698), r('10', 603, 604), r('21', 605, 606),
      ], { id: 'op_int_corrientes_total', labelKey: 'fm.m390.row.group_total', cells: [48, 49], total: true }),
      rateGroup('op_int_inversion', 'fm.m390.row.op_int_inversion', [
        r('2', 749, 750), r('4', 196, 197), r('5', 728, 729), r('7.5', 751, 752), r('10', 611, 612), r('21', 613, 614),
      ], { id: 'op_int_inversion_total', labelKey: 'fm.m390.row.group_total', cells: [50, 51], total: true }),
      rateGroup('import_corrientes', 'fm.m390.row.import_corrientes', [
        r('2', 757, 758), r('4', 202, 203), r('5', 732, 733), r('7.5', 759, 760), r('10', 619, 620), r('21', 621, 622),
      ], { id: 'import_corrientes_total', labelKey: 'fm.m390.row.group_total', cells: [52, 53], total: true }),
      rateGroup('import_inversion', 'fm.m390.row.import_inversion', [
        r('2', 761, 762), r('4', 208, 209), r('5', 734, 735), r('7.5', 763, 764), r('10', 623, 624), r('21', 625, 626),
      ], { id: 'import_inversion_total', labelKey: 'fm.m390.row.group_total', cells: [54, 55], total: true }),
      rateGroup('adq_intra_corrientes', 'fm.m390.row.adq_intra_corrientes', [
        r('2', 765, 766), r('4', 214, 215), r('5', 736, 737), r('7.5', 767, 768), r('10', 627, 628), r('21', 629, 630),
      ], { id: 'adq_intra_corrientes_total', labelKey: 'fm.m390.row.group_total', cells: [56, 57], total: true }),
      rateGroup('adq_intra_inversion', 'fm.m390.row.adq_intra_inversion', [
        r('2', 769, 770), r('4', 220, 221), r('5', 738, 739), r('7.5', 771, 772), r('10', 631, 632), r('21', 633, 634),
      ], { id: 'adq_intra_inversion_total', labelKey: 'fm.m390.row.group_total', cells: [58, 59], total: true }),
      rateGroup('adq_intra_servicios_ded', 'fm.m390.row.adq_intra_servicios', [
        r('2', 773, 774), r('4', 587, 588), r('5', 740, 741), r('7.5', 775, 776), r('10', 635, 636), r('21', 637, 638),
      ], { id: 'adq_intra_servicios_ded_total', labelKey: 'fm.m390.row.group_total', cells: [597, 598], total: true }),
      row('rectif_deducciones', 'fm.m390.row.rectif_deducciones', [639, 62]),
      row('regul_inversion', 'fm.m390.row.regul_inversion', [null, 63]),
      row('no_current_type', 'fm.m390.row.no_current_type', [
        input(INPUT.NO_CURRENT_TYPE_BASE, { box: 660 }),
        input(INPUT.NO_CURRENT_TYPE_AMOUNT, { box: 661 }),
      ]),
      row('suma_deducciones', 'fm.m390.row.suma_deducciones', [null, 64], { total: true }),
    ]),
  }),
  Object.freeze({
    id: 'resultado_liquidacion', titleKey: 'fm.m390.block.resultado_liquidacion', kind: 'boxes',
    columns: COLS_SINGLE,
    items: Object.freeze([
      row('box65', 'fm.m390.box.65', [65], { total: true, formula: '(47 − 64)' }),
      row('box658', 'fm.m390.box.658', [input(INPUT.REGULARIZATION, { box: 658 })]),
      row('box84', 'fm.m390.box.84', [84], { total: true, formula: '(65 + 658)' }),
      row('box659', 'fm.m390.box.659', [input(INPUT.VAT_IMPORT, { box: 659 })]),
      row('box85', 'fm.m390.box.85', [input(INPUT.COMPENSATION, { box: 85, nonNegative: true, liquidationOnly: true })]),
      row('box86', 'fm.m390.box.86', [86], { total: true, formula: '(84 + 659 − 85)' }),
    ]),
  }),
  Object.freeze({
    id: 'territorio', titleKey: 'fm.m390.block.territorio', kind: 'boxes', toggle: true,
    noteKey: 'fm.m390.territory.note',
    columns: COLS_SINGLE,
    items: Object.freeze([
      row('box87', 'fm.m390.box.87', [input(INPUT.COMMON_TERRITORY, { box: 87, percent: true })]),
      row('box88', 'fm.m390.box.88', [input(INPUT.ALAVA, { box: 88, percent: true })]),
      row('box89', 'fm.m390.box.89', [input(INPUT.GUIPUZCOA, { box: 89, percent: true })]),
      row('box90', 'fm.m390.box.90', [input(INPUT.VIZCAYA, { box: 90, percent: true })]),
      row('box91', 'fm.m390.box.91', [input(INPUT.NAVARRA, { box: 91, percent: true })]),
      row('box92', 'fm.m390.box.92', [92], { total: true, formula: '(84 × 87 %)' }),
      row('box93', 'fm.m390.box.93', [input(INPUT.COMMON_TERRITORY_COMPENSATION, { box: 93, nonNegative: true })]),
      row('box94', 'fm.m390.box.94', [94], { total: true, formula: '(92 + 659 − 93)' }),
    ]),
  }),
  Object.freeze({
    id: 'resultado_liquidaciones', titleKey: 'fm.m390.block.resultado_liquidaciones', kind: 'boxes',
    columns: COLS_MONTHS,
    items: Object.freeze([
      ...MONTH_CODES.map(m => row(`month${m}`, `fm.m390.month.${m}`, [
        input(ingresarKey(m)), input(devolverKey(m), { monthlyReturnOnly: true }),
      ])),
      row('box95_96', 'fm.m390.row.total_liquidaciones', [95, 96], { total: true }),
      row('box97', 'fm.m390.box.97', [input(INPUT.TOTAL_LASTPERIOD, { box: 97 }), null]),
      row('box98', 'fm.m390.box.98', [null, input(INPUT.TOTAL_LASTPERIOD_DEVOLVER, { box: 98 })]),
      row('box662', 'fm.m390.box.662', [input(INPUT.END_COMPENSATION, { box: 662 }), null]),
    ]),
  }),
  Object.freeze({
    id: 'volumen_operaciones', titleKey: 'fm.m390.block.volumen_operaciones', kind: 'boxes',
    columns: COLS_SINGLE,
    items: Object.freeze([
      row('box99', 'fm.m390.box.99', [99]),
      row('box103', 'fm.m390.box.103', [103]),
      row('box104', 'fm.m390.box.104', [104]),
      row('box105', 'fm.m390.box.105', [105]),
      row('box110', 'fm.m390.box.110', [110]),
      row('box125', 'fm.m390.box.125', [125]),
      row('box126', 'fm.m390.box.126', [126]),
      row('box127', 'fm.m390.box.127', [input(INPUT.OPS_SUJETAS_OSS, { box: 127 })]),
      row('box128', 'fm.m390.box.128', [input(INPUT.OPS_INTRAGRUPO, { box: 128 })]),
      row('box106', 'fm.m390.box.106', [106], { formula: '(−)' }),
      row('box107', 'fm.m390.box.107', [107], { formula: '(−)' }),
      row('box108', 'fm.m390.box.108', [108], { total: true }),
    ]),
  }),
  Object.freeze({
    id: 'operaciones_especificas', titleKey: 'fm.m390.block.operaciones_especificas', kind: 'boxes',
    columns: COLS_SINGLE,
    items: Object.freeze([
      row('box230', 'fm.m390.box.230', [230]),
      row('box109', 'fm.m390.box.109', [109]),
      row('box231', 'fm.m390.box.231', [231]),
      row('box232', 'fm.m390.box.232', [232]),
      row('box111', 'fm.m390.box.111', [input(INPUT.OPER_MONTHLY_RETURN, { box: 111 })]),
      row('box113', 'fm.m390.box.113', [113]),
      row('box523', 'fm.m390.box.523', [523]),
    ]),
  }),
]);

/**
 * The block layout for a tax-report design year (`taxReport.layoutYear` of the boxes payload).
 * One design today (the classic `AEAT390_2025_Y`, which the backend also uses for 2026 through its
 * year fallback); a later design plugs in here, keyed by year, without touching the renderer.
 */
export function getLayout390(_layoutYear) {
  return BLOCKS;
}

// ── Cell helpers ─────────────────────────────────────────────────────────────

/** The input descriptor of a cell, or `null` for a calculated / empty cell. */
export function cellInput(cell) {
  return cell && typeof cell === 'object' && cell.input ? cell : null;
}

/** The AEAT box number shown in a cell, or `null`. */
export function cellBox(cell) {
  if (cell == null) return null;
  if (typeof cell === 'number') return cell;
  return cell.box ?? null;
}

/** Every row of a block, rate rows flattened (each rate row gets an id `<group>.<rate>`). */
export function blockRows(block) {
  const out = [];
  for (const item of block.items ?? []) {
    if (item.type === 'rates') {
      for (const rate of item.rates) out.push({ id: `${item.id}.${rate.rate}`, labelKey: item.labelKey, rate: rate.rate, cells: rate.cells, groupId: item.id });
      if (item.total) out.push(item.total);
    } else {
      out.push(item);
    }
  }
  return out;
}

// ── Box search ("Buscar casilla") ────────────────────────────────────────────

/**
 * Flat index of every box shown in the tab: `{ box, blockId, labelKey }`, in layout order. A box
 * appears once (the first time the layout shows it).
 */
export function buildBoxIndex(blocks = BLOCKS) {
  const seen = new Set();
  const index = [];
  for (const block of blocks) {
    if (block.kind !== 'boxes') continue;
    for (const rw of blockRows(block)) {
      for (const cell of rw.cells) {
        const box = cellBox(cell);
        if (box == null || seen.has(box)) continue;
        seen.add(box);
        index.push({ box, blockId: block.id, labelKey: rw.labelKey });
      }
    }
  }
  return index;
}

/**
 * Resolves the search query typed in "Buscar casilla": a box number ("86", "[86]", "086") wins;
 * otherwise the first box whose translated concept contains the text (accent- and
 * case-insensitive). Returns the index entry, or `null`.
 */
export function findBox(query, index, t = (k) => k) {
  const raw = String(query ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[[\]\s]/g, '');
  if (/^\d+$/.test(digits)) {
    const n = Number(digits);
    return index.find(e => e.box === n) ?? null;
  }
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = norm(raw);
  return index.find(e => norm(t(e.labelKey)).includes(q)) ?? null;
}

// ── Amounts ──────────────────────────────────────────────────────────────────

/**
 * Parses a box value or a stored input to a number: accepts numbers and strings with a decimal
 * point or comma ("1500.00", "40,5"). Blank / invalid → `null`.
 */
export function parseAmount(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim().replace(',', '.');
  if (s === '' || !/^-?\d*(\.\d*)?$/.test(s) || s === '-' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const toCents = (n) => Math.round((n ?? 0) * 100);
const fromCents = (c) => c / 100;

/** The value of an input in cents (0 when absent). */
function inputCents(inputs, key) {
  return toCents(parseAmount(inputs?.[key]));
}

/**
 * Normalises what the user typed into the string stored in `manualData.aeatInputs`: two decimals,
 * decimal point. Blank → `null` (the key is removed).
 */
export function normalizeInputValue(raw) {
  const n = parseAmount(raw);
  if (n == null) return null;
  return fromCents(toCents(n)).toFixed(2);
}

/** True when any territory percentage ([87]-[91]) is positive — the backend's TERRITORY mode. */
export function isTerritoryMode(inputs) {
  return TERRITORY_PERCENT_INPUTS.some(k => (parseAmount(inputs?.[k]) ?? 0) > 0);
}

/** Sum of the territory percentages (for the "must add up to 100 %" check). */
export function territoryPercentSum(inputs) {
  return fromCents(TERRITORY_PERCENT_INPUTS.reduce((s, k) => s + inputCents(inputs, k), 0));
}

// ── Client-side derivation of the input-dependent boxes ──────────────────────
// Mirrors `Fiscal390DerivedBoxes.apply` (com.etendoerp.go) for the boxes that depend on the manual
// inputs, so an edit shows its effect on the totals immediately, before "Calcular". The backend
// stays authoritative: "Calcular" (and the generated file) recompute everything server-side.
//
//   echo boxes  [660] [661] [658] [659] [97] [98] [662] [101] [227] [228] [127] [128] [111]
//   [64] = deductible cuotas + [661]    [65] = [47] − [64]   (the file adds [661] to [64], page 4)
//   liquidation [84] = [65] + [658]   [85] = compensation (≥ 0,01)   [86] = [84] + [659] − compensation
//   territory   [84] = [65] + [661] + [658]  (classic prints the pre-[661] result here — a quirk of
//               the file, reproduced so screen = file)
//               [92] = round2([84] × [87] / 100)   [94] = [92] + [659] − [93]
//               plus the echoed [87]-[91] and [93]
//   [95] = Σ INGRESAR_xx    [96] = Σ DEVOLVER_xx
//   [108] = invoice volume + [127] + [128] + [101] + [227] + [228]

const ECHO_BOXES = Object.freeze({
  [INPUT.NO_CURRENT_TYPE_BASE]: 660,
  [INPUT.NO_CURRENT_TYPE_AMOUNT]: 661,
  [INPUT.REGULARIZATION]: 658,
  [INPUT.VAT_IMPORT]: 659,
  [INPUT.TOTAL_LASTPERIOD]: 97,
  [INPUT.TOTAL_LASTPERIOD_DEVOLVER]: 98,
  [INPUT.END_COMPENSATION]: 662,
  [INPUT.REAGYP]: 101,
  [INPUT.USED_GOODS]: 227,
  [INPUT.TRAVEL_AGENCY]: 228,
  [INPUT.OPS_SUJETAS_OSS]: 127,
  [INPUT.OPS_INTRAGRUPO]: 128,
  [INPUT.OPER_MONTHLY_RETURN]: 111,
});
const TERRITORY_ECHO_BOXES = Object.freeze({
  [INPUT.COMMON_TERRITORY]: 87,
  [INPUT.ALAVA]: 88,
  [INPUT.GUIPUZCOA]: 89,
  [INPUT.VIZCAYA]: 90,
  [INPUT.NAVARRA]: 91,
  [INPUT.COMMON_TERRITORY_COMPENSATION]: 93,
});
const VOLUME_INPUTS = Object.freeze([
  INPUT.OPS_SUJETAS_OSS, INPUT.OPS_INTRAGRUPO, INPUT.REAGYP, INPUT.USED_GOODS, INPUT.TRAVEL_AGENCY,
]);

/** `{ "<box>": "1.00" }` (strings or numbers) → `{ <box>: number }`, dropping unparsable values. */
export function toBoxMap(boxes) {
  const out = {};
  for (const [k, v] of Object.entries(boxes ?? {})) {
    const n = parseAmount(v);
    if (n != null) out[Number(k)] = n;
  }
  return out;
}

/**
 * Applies `currentInputs` to the boxes the backend computed with `computedInputs`.
 *
 * @param {object} computedBoxes  `boxes` of the last boxes payload (strings or numbers)
 * @param {object} computedInputs `inputs` of that payload (the inputs it was computed with)
 * @param {object} currentInputs  the inputs on screen (saved or not)
 * @returns {{ boxes: Object<number, number>, mode: 'liquidation'|'territory' }}
 */
export function deriveInputBoxes(computedBoxes, computedInputs, currentInputs) {
  const cents = {};
  for (const [k, v] of Object.entries(toBoxMap(computedBoxes))) cents[k] = toCents(v);
  const put = (box, c) => { cents[box] = c; };
  const putIfNonZero = (box, c) => { if (c !== 0) cents[box] = c; else delete cents[box]; };

  for (const [key, box] of Object.entries(ECHO_BOXES)) putIfNonZero(box, inputCents(currentInputs, key));

  // [64]/[65] carry [661]: back out the one they were computed with, apply the one on screen.
  const computedNoCurrentType = inputCents(computedInputs, INPUT.NO_CURRENT_TYPE_AMOUNT);
  const noCurrentType = inputCents(currentInputs, INPUT.NO_CURRENT_TYPE_AMOUNT);
  const resRegGeneral = (cents[65] ?? 0) + computedNoCurrentType; // classic ResRegGeneral
  put(64, (cents[64] ?? 0) - computedNoCurrentType + noCurrentType);
  const box65 = resRegGeneral - noCurrentType;
  put(65, box65);
  const regularization = inputCents(currentInputs, INPUT.REGULARIZATION);
  const vatImport = inputCents(currentInputs, INPUT.VAT_IMPORT);
  const territory = isTerritoryMode(currentInputs);
  if (territory) {
    for (const [key, box] of Object.entries(TERRITORY_ECHO_BOXES)) putIfNonZero(box, inputCents(currentInputs, key));
    const box84 = resRegGeneral + regularization;
    const box92 = Math.round(box84 * (parseAmount(currentInputs?.[INPUT.COMMON_TERRITORY]) ?? 0) / 100);
    put(84, box84);
    put(92, box92);
    put(94, box92 + vatImport - inputCents(currentInputs, INPUT.COMMON_TERRITORY_COMPENSATION));
    delete cents[85];
    delete cents[86];
  } else {
    for (const box of Object.values(TERRITORY_ECHO_BOXES)) delete cents[box];
    const compensation = inputCents(currentInputs, INPUT.COMPENSATION);
    const box84 = box65 + regularization;
    put(84, box84);
    if (compensation >= 1) put(85, compensation); else delete cents[85];
    put(86, box84 + vatImport - compensation);
    delete cents[92];
    delete cents[94];
  }

  putIfNonZero(95, MONTH_CODES.reduce((s, m) => s + inputCents(currentInputs, ingresarKey(m)), 0));
  putIfNonZero(96, MONTH_CODES.reduce((s, m) => s + inputCents(currentInputs, devolverKey(m)), 0));

  if (cents[108] != null || VOLUME_INPUTS.some(k => inputCents(currentInputs, k) !== 0)) {
    const invoiceVolume = (cents[108] ?? 0) - VOLUME_INPUTS.reduce((s, k) => s + inputCents(computedInputs, k), 0);
    put(108, invoiceVolume + VOLUME_INPUTS.reduce((s, k) => s + inputCents(currentInputs, k), 0));
  }

  const boxes = {};
  for (const [k, c] of Object.entries(cents)) boxes[k] = fromCents(c);
  return { boxes, mode: territory ? 'territory' : 'liquidation' };
}

/**
 * The annual result shown on the "Resultado" card and in the list: [94] in territory mode, [86]
 * otherwise — the same choice as the backend's `summary.annualResult`.
 */
export function annualResultOf(boxes, mode) {
  const map = toBoxMap(boxes);
  const v = mode === 'territory' ? map[94] : map[86];
  return v ?? 0;
}

// ── "Resultado" badge ───────────────────────────────────────────────────────

/**
 * The 390 "Resultado" kind. Unlike the 303 (shared `deriveResultKind`: "A ingresar" /
 * "A compensar/devolver"), the 390 result [86] / [94] is INFORMATIVE: AEAT writes it "con el signo
 * que corresponda" and classic only signs it — the payment, offset or refund was already settled
 * by the last 303 ([97] / [98]). So only the sign is shown:
 *   > 0 'positive', < 0 'negative', 0 'zero' (the exercise had activity) or 'N' (no activity).
 * `null` when no finite result is available.
 */
export function resultKind390(result, { hasActivity = false } = {}) {
  const amount = Number(result);
  if (result == null || !Number.isFinite(amount)) return null;
  if (amount > 0) return 'positive';
  if (amount < 0) return 'negative';
  return hasActivity ? 'zero' : 'N';
}

/** i18n key of the badge of a `resultKind390` kind. */
export const RESULT_LABEL_KEY_390 = Object.freeze({
  positive: 'fm.m390.result.positive',
  negative: 'fm.m390.result.negative',
  zero: 'fm.result.zero',
  N: 'fm.result.N',
});

// ── Consistency of the manual inputs (classic checks at "Generar") ───────────

const hasAmount = (inputs, key) => (parseAmount(inputs?.[key]) ?? 0) !== 0;

/** True when the declarant is in the monthly refund register (ISMONTHLYRETURN = 'Y'). */
export function isMonthlyReturn(inputs) {
  return inputs?.[FLAG.MONTHLY_RETURN] === 'Y';
}

/** True when the declarant was declared in insolvency proceedings (ConcursoAcr = 'Y'). */
export function isConcurso(inputs) {
  return inputs?.[FLAG.CONCURSO] === 'Y';
}

/**
 * Drops the inputs that classic would reject together with the rest, so they are never stored:
 *   - [85] LIQANUAL_COMPENSATION in territory mode (classic BothTerritoryAndLiqAnual — the offset
 *     goes to [93] there);
 *   - DEVOLVER_01..12 without ISMONTHLYRETURN = 'Y' (classic AEAT390_MonthlyReturn_Check);
 *   - ConcursoUltPer = 'Y' without ConcursoAcr = 'Y' (classic rejects it) → 'N'.
 * Applied after every edit and on every save. Returns a new object.
 */
export function sanitizeAeatInputs390(inputs) {
  const next = { ...(inputs ?? {}) };
  OBSOLETE_INPUTS_390.forEach(k => { delete next[k]; });
  if (isTerritoryMode(next)) delete next[INPUT.COMPENSATION];
  if (!isMonthlyReturn(next)) MONTH_CODES.forEach(m => { delete next[devolverKey(m)]; });
  if (!isConcurso(next) && next[FLAG.CONCURSO_LAST_PERIOD] === 'Y') next[FLAG.CONCURSO_LAST_PERIOD] = 'N';
  return next;
}

/**
 * The input that blocks typing `key` because classic rejects the two together, or `null`:
 * [85] and [93] cannot coexist (classic BothAmtPrevious).
 */
export function conflictingInput390(key, inputs) {
  if (key === INPUT.COMPENSATION && hasAmount(inputs, INPUT.COMMON_TERRITORY_COMPENSATION)) {
    return INPUT.COMMON_TERRITORY_COMPENSATION;
  }
  if (key === INPUT.COMMON_TERRITORY_COMPENSATION && hasAmount(inputs, INPUT.COMPENSATION)) {
    return INPUT.COMPENSATION;
  }
  return null;
}

/**
 * Inline messages of the "Resultado de las liquidaciones" checks, `[{ id, blockId, level, key }]`:
 *   error    DEVOLVER_12 together with [97] (classic AEAT390_TotalLastPeriod_Check);
 *   warning  [98] together with [96] (any DEVOLVER_xx) or [97] — AEAT: "Si ha consignado alguna
 *            cantidad en las casillas 96 ó 97 no cumplimente la 98" (non-blocking).
 */
export function inputMessages390(inputs) {
  const out = [];
  const blockId = 'resultado_liquidaciones';
  const has97 = hasAmount(inputs, INPUT.TOTAL_LASTPERIOD);
  if (hasAmount(inputs, devolverKey('12')) && has97) {
    out.push({ id: 'devolver12_with_97', blockId, level: 'error', key: 'fm.m390.check.devolver12_with_97' });
  }
  const has96 = MONTH_CODES.some(m => hasAmount(inputs, devolverKey(m)));
  if (hasAmount(inputs, INPUT.TOTAL_LASTPERIOD_DEVOLVER) && (has96 || has97)) {
    out.push({ id: 'box98_with_96_97', blockId, level: 'warning', key: 'fm.m390.check.box98_with_96_97' });
  }
  return out;
}

// ── Origin of a manual value ─────────────────────────────────────────────────

/**
 * Origin of an input cell, for the legend ("Manual o precargado" / "Modificado"):
 *   'preloaded' the value came from a preload source (`preloaded[key]`) and is unchanged
 *   'modified'  a preloaded value the user changed — can be restored
 *   'manual'    no preload for this key
 * `preloaded` is `manualData.aeatPreloaded` (the values the 303 preload put in, preload390.js).
 */
export function inputOrigin(key, inputs, preloaded) {
  if (!preloaded || !Object.hasOwn(preloaded, key)) return 'manual';
  return toCents(parseAmount(inputs?.[key])) === toCents(parseAmount(preloaded[key])) ? 'preloaded' : 'modified';
}

// ── Substitute declaration ───────────────────────────────────────────────────

/** True for a substitute declaration (`identification.sustitutiva`). */
export function isSubstitutive(identification) {
  return identification?.sustitutiva === true || identification?.sustitutiva === 'Y';
}

/**
 * True when "Sustitutiva por rectificación de cuotas" applies: AEAT defines it only for a
 * declarant in insolvency proceedings (art. 80.Tres LIVA), so it needs ConcursoAcr = 'Y' in
 * `inputs` as well as the box marked in `identification`.
 */
export function isRectificationByQuotas(identification, inputs) {
  return identification?.rectificacionCuotas === true && isConcurso(inputs);
}

/**
 * The classic flag parameters derived from the header "Tipo" control, merged into
 * `manualData.aeatInputs` on every save: ordinary → no flags; substitute → ISSUPPLEMENTARY, or
 * ISRECTIFICATION when "Sustitutiva por rectificación de cuotas" applies (`isRectificationByQuotas`;
 * classic treats the two as exclusive), plus SUPPLEMENTARYNO = the former declaration's identifier.
 */
export function substitutiveFlags(identification, inputs) {
  if (!isSubstitutive(identification)) {
    return { [FLAG.SUPPLEMENTARY]: 'N', [FLAG.RECTIFICATION]: 'N', [FLAG.SUPPLEMENTARY_NO]: null };
  }
  const byQuotas = isRectificationByQuotas(identification, inputs);
  return {
    [FLAG.SUPPLEMENTARY]: byQuotas ? 'N' : 'Y',
    [FLAG.RECTIFICATION]: byQuotas ? 'Y' : 'N',
    [FLAG.SUPPLEMENTARY_NO]: String(identification?.formerStatement ?? '').trim() || null,
  };
}

/**
 * The `manualData` object persisted by "Guardar": the previous manualData (unknown keys kept), the
 * identification (Tipo control) and the inputs, sanitized (`sanitizeAeatInputs390`) and with the
 * substitute flags applied. A `null` input value removes the key. `aeatPreloaded` (the values the
 * 303 preload put in, preload390.js — origin "Modificado" and Restaurar) replaces the previous one
 * when given; omitted (or `null`), the previous one is kept.
 */
export function buildManualData390(previous, identification, aeatInputs, aeatPreloaded) {
  const sanitized = sanitizeAeatInputs390(aeatInputs);
  const merged = { ...sanitized, ...substitutiveFlags(identification, sanitized) };
  const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v]) => v != null && v !== ''));
  const out = { ...(previous ?? {}), identification: { ...(identification ?? {}) }, aeatInputs: cleaned };
  if (aeatPreloaded != null) out.aeatPreloaded = { ...aeatPreloaded };
  return out;
}
