// Modelo 303 box layout engine.
//
// BASE defines the canonical (current) form structure.
// PATCHES[year] (or PATCHES['year_period']) is an ordered list of ops
// applied on top of BASE to produce that year's layout.
//
// Ops: deleteRow | insertRow | patchRow | reorderRows |
//      deleteSection | insertSection | patchSection
//
// getLayout303(year, period) resolves: '{year}_{period}' → '{year}' → BASE as-is.
// The renderer (FmBoxes303) only sees the final {sections} shape — ids are internal.

// ── Column header sets ────────────────────────────────────────────

const IVA_DEV_COLS = [
  'fm.box.colHeader.base',
  'fm.box.colHeader.tipo',
  'fm.box.colHeader.cuota',
];

const IVA_DED_COLS = [
  'fm.box.colHeader.base',
  'fm.box.colHeader.cuota_ded',
];

// ── Base layout (current / default form) ─────────────────────────
// Row ids are stable references for patches — use the leading box number
// or a descriptive key for labeled rows.

// BASE reflects the full 2026 AEAT Modelo 303 form (source: official PDF, May 2026).
const BASE = {
  sectionOrder: ['iva_devengado', 'iva_deducible', 'resultado', 'info_adicional', 'resultado_final'],
  sections: {
    iva_devengado: {
      titleKey: 'fm.box.section.iva_devengado',
      colHeaderKeys: IVA_DEV_COLS,
      rows: [
        { id: '150',             cells: [150, 151, 152], fixedValues: { 151: 0    } },
        { id: '165',             cells: [165, 166, 167] },
        { id: 'regimen_general', labelKey: 'fm.box.row.regimen_general',  cells: [1,    2,    3   ], fixedValues: { 2:  4    } },
        { id: '153',             cells: [153, 154, 155] },
        { id: '4',               cells: [4,   5,   6  ], fixedValues: { 5:  10   } },
        { id: '7',               cells: [7,   8,   9  ], fixedValues: { 8:  21   } },
        { id: 'adq_intracom',    labelKey: 'fm.box.row.adq_intracom',     cells: [10,   null, 11  ] },
        { id: 'otras_inversion', labelKey: 'fm.box.row.otras_inversion',  cells: [12,   null, 13  ] },
        { id: 'mod_bases',       labelKey: 'fm.box.row.mod_bases',        cells: [14,   null, 15  ] },
        { id: '156',             cells: [156, 157, 158], fixedValues: { 157: 1.75 } },
        { id: '168',             cells: [168, 169, 170], fixedValues: { 169: 0.50 } },
        { id: 'recargo_equiv',   labelKey: 'fm.box.row.recargo_equiv',    cells: [16,   17,   18  ] },
        { id: '19',              cells: [19,  20,  21 ], fixedValues: { 20: 1.40 } },
        { id: '22',              cells: [22,  23,  24 ], fixedValues: { 23: 5.20 } },
        { id: 'mod_recargo',     labelKey: 'fm.box.row.mod_recargo',      cells: [25,   null, 26  ] },
        { id: 'total_devengada', labelKey: 'fm.box.row.total_devengada',  cells: [null, null, 27  ], total: true },
      ],
    },
    iva_deducible: {
      titleKey: 'fm.box.section.iva_deducible',
      colHeaderKeys: IVA_DED_COLS,
      rows: [
        { id: 'op_int_corrientes',  labelKey: 'fm.box.row.op_int_corrientes',  cells: [28,   29] },
        { id: 'op_int_bienes_inv',  labelKey: 'fm.box.row.op_int_bienes_inv',  cells: [30,   31] },
        { id: 'importaciones',      labelKey: 'fm.box.row.importaciones',       cells: [32,   33] },
        { id: 'imp_bienes_inv',     labelKey: 'fm.box.row.imp_bienes_inv',      cells: [34,   35] },
        { id: 'adq_intracom_corr',  labelKey: 'fm.box.row.adq_intracom_corr',  cells: [36,   37] },
        { id: 'adq_intracom_inv',   labelKey: 'fm.box.row.adq_intracom_inv',   cells: [38,   39] },
        { id: 'regularizacion',     labelKey: 'fm.box.row.regularizacion',      cells: [40,   41] },
        { id: 'compensaciones_reag',labelKey: 'fm.box.row.compensaciones_reag', cells: [null, 42] },
        { id: 'reg_bienes_inv',     labelKey: 'fm.box.row.reg_bienes_inv',      cells: [null, 43] },
        { id: 'prorrata_definitiva',labelKey: 'fm.box.row.prorrata_definitiva', cells: [null, 44] },
        { id: 'total_deducir',      labelKey: 'fm.box.row.total_deducir',       cells: [null, 45], formula: '(29 + 31 + 33 + 35 + 37 + 39 + 41 + 42 + 43 + 44)', total: true },
      ],
    },
    resultado: {
      titleKey: 'fm.box.section.resultado',
      colHeaderKeys: [],
      rows: [
        { id: 'diferencia', labelKey: 'fm.box.row.diferencia', cells: [46], formula: '(27 − 45)', total: true },
      ],
    },
    info_adicional: {
      titleKey: 'fm.box.section.info_adicional',
      colHeaderKeys: [],
      rows: [
        { id: 'entregas_intracom',   labelKey: 'fm.box.row.entregas_intracom',   cells: [59] },
        { id: 'exportaciones',       labelKey: 'fm.box.row.exportaciones',       cells: [60] },
        { id: 'op_no_sujetas_loc',   labelKey: 'fm.box.row.op_no_sujetas_loc',  cells: [120] },
        { id: 'op_sujetas_inv',      labelKey: 'fm.box.row.op_sujetas_inv',     cells: [122] },
        { id: 'op_vu_no_sujetas',    labelKey: 'fm.box.row.op_vu_no_sujetas',   cells: [123] },
        { id: 'op_vu_sujetas',       labelKey: 'fm.box.row.op_vu_sujetas',      cells: [124] },
        { id: 'criterio_caja_dev',   labelKey: 'fm.box.row.criterio_caja_dev',  cells: [62, 63] },
        { id: 'criterio_caja_ded',   labelKey: 'fm.box.row.criterio_caja_ded',  cells: [74, 75] },
      ],
    },
    resultado_final: {
      titleKey: 'fm.box.section.resultado_final',
      colHeaderKeys: [],
      rows: [
        { id: 'reg_cuotas_art80',        labelKey: 'fm.box.row.reg_cuotas_art80',        cells: [76] },
        { id: 'suma_resultados',         labelKey: 'fm.box.row.suma_resultados',          cells: [64] },
        { id: 'atribuible_estado',       labelKey: 'fm.box.row.atribuible_estado',        cells: [65, 66] },
        { id: 'iva_importacion',         labelKey: 'fm.box.row.iva_importacion',          cells: [77] },
        { id: 'cuotas_compensar',        labelKey: 'fm.box.row.cuotas_compensar',         cells: [110] },
        { id: 'cuotas_compensar_aplic',  labelKey: 'fm.box.row.cuotas_compensar_aplic',  cells: [78] },
        { id: 'cuotas_compensar_post',   labelKey: 'fm.box.row.cuotas_compensar_post',   cells: [87] },
        { id: 'reg_anual',               labelKey: 'fm.box.row.reg_anual',               cells: [68] },
        { id: 'otros_ajustes',           labelKey: 'fm.box.row.otros_ajustes',            cells: [108] },
        { id: 'resultado_69',            labelKey: 'fm.box.row.resultado_69',             cells: [69] },
        { id: 'a_deducir',               labelKey: 'fm.box.row.a_deducir',               cells: [70] },
        { id: 'devoluciones_at',         labelKey: 'fm.box.row.devoluciones_at',          cells: [109] },
        { id: 'resultado_declaracion',   labelKey: 'fm.box.row.resultado_declaracion',   cells: [71] },
        { id: 'rectificacion_importe',   labelKey: 'fm.box.row.rectificacion_importe',   cells: [111] },
        { id: 'trib_territorial',        labelKey: 'fm.box.row.trib_territorial',         cells: [89, 90, 91, 92] },
        { id: 'op_regimen_general',      labelKey: 'fm.box.row.op_regimen_general',       cells: [80] },
        { id: 'op_criterio_caja',        labelKey: 'fm.box.row.op_criterio_caja',         cells: [81] },
        { id: 'entregas_intracom_exent', labelKey: 'fm.box.row.entregas_intracom_exent',  cells: [93] },
        { id: 'exportaciones_exentas',   labelKey: 'fm.box.row.exportaciones_exentas',    cells: [94] },
        { id: 'op_exentas_sin_ded',      labelKey: 'fm.box.row.op_exentas_sin_ded',       cells: [83] },
        { id: 'op_no_sujetas_inv',       labelKey: 'fm.box.row.op_no_sujetas_inv',        cells: [84] },
        { id: 'entregas_instalacion',    labelKey: 'fm.box.row.entregas_instalacion',      cells: [85] },
        { id: 'op_reg_simplificado',     labelKey: 'fm.box.row.op_reg_simplificado',       cells: [86] },
        { id: 'op_agricultura',          labelKey: 'fm.box.row.op_agricultura',            cells: [95] },
        { id: 'op_recargo_equiv_vol',    labelKey: 'fm.box.row.op_recargo_equiv_vol',      cells: [96] },
        { id: 'op_bienes_usados',        labelKey: 'fm.box.row.op_bienes_usados',          cells: [97] },
        { id: 'op_agencias_viajes',      labelKey: 'fm.box.row.op_agencias_viajes',        cells: [98] },
        { id: 'entregas_inmuebles',      labelKey: 'fm.box.row.entregas_inmuebles',         cells: [79] },
        { id: 'entregas_bienes_inv_vol', labelKey: 'fm.box.row.entregas_bienes_inv_vol',    cells: [99] },
        { id: 'total_operaciones',       labelKey: 'fm.box.row.total_operaciones',          cells: [88] },
      ],
    },
  },
};

// ── Year patches ──────────────────────────────────────────────────
// Each entry is an ordered array of ops applied to BASE.
// Keys: 'YYYY' or 'YYYY_period' (period-level takes priority).

const PATCHES = {
  // 2024: rows 165/166/167 and 168/169/170 not yet present (introduced in 2025).
  '2024': [
    { op: 'deleteRow', section: 'iva_devengado', row: '165' },
    { op: 'deleteRow', section: 'iva_devengado', row: '168' },
  ],

  // Pre-2024: simpler form — no high-box rows, no recargo equiv., fewer deductible lines.
  '2023': [
    // iva_devengado — remove extended rows added in later years
    { op: 'deleteRow', section: 'iva_devengado', row: '150' },
    { op: 'deleteRow', section: 'iva_devengado', row: '165' },
    { op: 'deleteRow', section: 'iva_devengado', row: '153' },
    { op: 'deleteRow', section: 'iva_devengado', row: '156' },
    { op: 'deleteRow', section: 'iva_devengado', row: '168' },
    { op: 'deleteRow', section: 'iva_devengado', row: 'recargo_equiv' },
    { op: 'deleteRow', section: 'iva_devengado', row: '19' },
    { op: 'deleteRow', section: 'iva_devengado', row: '22' },
    { op: 'deleteRow', section: 'iva_devengado', row: 'mod_recargo' },
    { op: 'deleteRow', section: 'iva_devengado', row: 'total_devengada' },
    // iva_deducible — only basic lines in 2023
    { op: 'deleteRow', section: 'iva_deducible', row: 'op_int_bienes_inv' },
    { op: 'deleteRow', section: 'iva_deducible', row: 'importaciones' },
    { op: 'deleteRow', section: 'iva_deducible', row: 'imp_bienes_inv' },
    { op: 'deleteRow', section: 'iva_deducible', row: 'adq_intracom_corr' },
    { op: 'deleteRow', section: 'iva_deducible', row: 'adq_intracom_inv' },
    { op: 'deleteRow', section: 'iva_deducible', row: 'regularizacion' },
    { op: 'deleteRow', section: 'iva_deducible', row: 'compensaciones_reag' },
    { op: 'deleteRow', section: 'iva_deducible', row: 'reg_bienes_inv' },
    { op: 'deleteRow', section: 'iva_deducible', row: 'prorrata_definitiva' },
    // resultado — no diferencia row in 2023
    { op: 'deleteRow', section: 'resultado',     row: 'diferencia' },
  ],
};

// ── Patch engine ──────────────────────────────────────────────────

function applyPatch(ops) {
  const sectionOrder = [...BASE.sectionOrder];
  const sections = {};
  for (const [id, sec] of Object.entries(BASE.sections)) {
    sections[id] = { ...sec, rows: sec.rows.map(r => ({ ...r })) };
  }

  for (const op of ops) {
    switch (op.op) {

      case 'deleteRow':
        if (sections[op.section]) {
          sections[op.section].rows = sections[op.section].rows.filter(r => r.id !== op.row);
        }
        break;

      case 'insertRow': {
        if (!sections[op.section]) break;
        const rows = sections[op.section].rows;
        let idx = rows.length;
        if (op.after  != null) idx = rows.findIndex(r => r.id === op.after)  + 1;
        if (op.before != null) idx = rows.findIndex(r => r.id === op.before);
        if (idx < 0) idx = rows.length;
        rows.splice(idx, 0, op.row);
        break;
      }

      case 'patchRow': {
        if (!sections[op.section]) break;
        const row = sections[op.section].rows.find(r => r.id === op.row);
        if (row) Object.assign(row, op.patch);
        break;
      }

      case 'reorderRows': {
        if (!sections[op.section]) break;
        const byId = Object.fromEntries(sections[op.section].rows.map(r => [r.id, r]));
        sections[op.section].rows = op.order.map(id => byId[id]).filter(Boolean);
        break;
      }

      case 'deleteSection':
        sectionOrder.splice(sectionOrder.indexOf(op.section), 1);
        break;

      case 'insertSection': {
        let idx = sectionOrder.length;
        if (op.after  != null) idx = sectionOrder.indexOf(op.after)  + 1;
        if (op.before != null) idx = sectionOrder.indexOf(op.before);
        sectionOrder.splice(Math.max(0, idx), 0, op.section);
        sections[op.section] = op.section_def;
        break;
      }

      case 'patchSection': {
        if (!sections[op.section]) break;
        const { rows: _rows, ...rest } = op.patch;
        Object.assign(sections[op.section], rest);
        break;
      }
    }
  }

  return { sections: sectionOrder.map(id => ({ id, ...sections[id] })).filter(s => s.titleKey) };
}

// ── Public API ────────────────────────────────────────────────────

export function getLayout303(year, period) {
  const ops =
    PATCHES[`${year}_${period}`] ??
    PATCHES[String(year)] ??
    null;

  if (!ops) {
    return { sections: BASE.sectionOrder.map(id => ({ id, ...BASE.sections[id] })) };
  }

  return applyPatch(ops);
}
