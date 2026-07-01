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

// ── Shared field definitions (declared before BASE to avoid TDZ) ─────

// visibleWhen shared by bank fields that only apply to devolucion/transferencia (not domiciliacion U).
const _BANK_DVX_VW = { field: 'tipo_declaracion', in: ['D', 'V', 'X'] };

const TIPO_DECLARACION_FIELD = {
  id: 'tipo_declaracion', labelKey: 'fm.ident.tipo_declaracion', type: 'select', readOnly: false, required: true,
  options: [
    { value: 'C', labelKey: 'fm.ident.decl.compensacion' },
    { value: 'D', labelKey: 'fm.ident.decl.devolucion' },
    { value: 'I', labelKey: 'fm.ident.decl.ingreso' },
    { value: 'U', labelKey: 'fm.ident.decl.domiciliacion' },
    { value: 'N', labelKey: 'fm.ident.decl.resultado_cero' },
    { value: 'V', labelKey: 'fm.ident.decl.dev_cta_corriente' },
    { value: 'X', labelKey: 'fm.ident.decl.dev_transferencia_ext' },
  ],
};

// ── Base layout (current / default form) ─────────────────────────
// Row ids are stable references for patches — use the leading box number
// or a descriptive key for labeled rows.

// BASE reflects the full 2026 AEAT Modelo 303 form (source: official PDF, May 2026).
const BASE = {
  sectionOrder: ['identificacion', 'datos_bancarios', 'iva_devengado', 'iva_deducible', 'resultado', 'info_adicional', 'resultado_final', 'sin_actividad', 'rectificativa'],
  sections: {
    identificacion: {
      sectionType: 'identificacion',
      titleKey: 'fm.box.section.identificacion',
      colHeaderKeys: [],
      fields: [
        { id: 'nif',             labelKey: 'fm.ident.nif',             type: 'text',     readOnly: true  },
        { id: 'nombre',          labelKey: 'fm.ident.nombre',          type: 'text',     readOnly: true  },
        { id: 'dep_aduanero',    labelKey: 'fm.ident.dep_aduanero',    type: 'checkbox', readOnly: false },
        { id: 'redeme',          labelKey: 'fm.ident.redeme',          type: 'checkbox', readOnly: false },
        { id: 'concurso',        labelKey: 'fm.ident.concurso',        type: 'checkbox', readOnly: false },
        { id: 'fecha_concurso',  labelKey: 'fm.ident.fecha_concurso',  type: 'date',     readOnly: false, visibleWhen: { field: 'concurso', equals: true } },
        { id: 'postconcursal',   labelKey: 'fm.ident.postconcursal',   type: 'checkbox', readOnly: false, visibleWhen: { field: 'concurso', equals: true } },
        TIPO_DECLARACION_FIELD,
      ],
      rows: [],
    },
    datos_bancarios: {
      sectionType: 'identificacion',
      titleKeyFrom: 'tipo_declaracion',
      titleKeyMap: {
        D: 'fm.section.devolucion', V: 'fm.section.devolucion', X: 'fm.section.devolucion',
        U: 'fm.section.domiciliacion',
      },
      sectionVisibleWhen: { field: 'tipo_declaracion', in: ['D', 'V', 'X', 'U'] },
      fieldLayout: 'aligned',
      colHeaderKeys: [],
      fields: [
        { id: 'bank_iban',      labelKey: 'fm.ident.bank.iban',      type: 'text', readOnly: false, required: true },
        { id: 'bank_swift_bic', labelKey: 'fm.ident.bank.swift_bic', type: 'text', readOnly: false, visibleWhen: _BANK_DVX_VW },
        { id: 'bank_nombre',    labelKey: 'fm.ident.bank.nombre',    type: 'text', readOnly: false, visibleWhen: _BANK_DVX_VW },
        { id: 'bank_direccion', labelKey: 'fm.ident.bank.direccion', type: 'text', readOnly: false, visibleWhen: _BANK_DVX_VW },
        { id: 'bank_ciudad',    labelKey: 'fm.ident.bank.ciudad',    type: 'text', readOnly: false, visibleWhen: _BANK_DVX_VW },
        { id: 'bank_pais',      labelKey: 'fm.ident.bank.pais',      type: 'text', readOnly: false, visibleWhen: _BANK_DVX_VW },
        { id: 'bank_sepa',      labelKey: 'fm.ident.bank.sepa',      type: 'text', readOnly: false, visibleWhen: _BANK_DVX_VW },
      ],
      rows: [],
    },
    iva_devengado: {
      titleKey: 'fm.box.section.iva_devengado',
      colHeaderKeys: IVA_DEV_COLS,
      colTypes: ['amount', 'percent', 'amount'],
      rows: [
        { id: '150',             cells: [150, 151, 152], fixedValues: { 151: 0    }, group: true },
        { id: '165',             cells: [165, 166, 167], fixedValues: { 166: 2    }, group: true },
        { id: 'regimen_general', labelKey: 'fm.box.row.regimen_general',  cells: [1,    2,    3   ], fixedValues: { 2:  4    }, group: true },
        { id: '153',             cells: [153, 154, 155], fixedValues: { 154: 7.50 }, group: true },
        { id: '4',               cells: [4,   5,   6  ], fixedValues: { 5:  10   }, group: true },
        { id: '7',               cells: [7,   8,   9  ], fixedValues: { 8:  21   }, group: true },
        { id: 'adq_intracom',    labelKey: 'fm.box.row.adq_intracom',     cells: [10,   null, 11  ] },
        { id: 'otras_inversion', labelKey: 'fm.box.row.otras_inversion',  cells: [12,   null, 13  ] },
        { id: 'mod_bases',       labelKey: 'fm.box.row.mod_bases',        cells: [14,   null, 15  ] },
        { id: '156',             cells: [156, 157, 158], fixedValues: { 157: 1.75 }, group: true },
        { id: '168',             cells: [168, 169, 170], fixedValues: { 169: 0.50 }, group: true },
        { id: 'recargo_equiv',   labelKey: 'fm.box.row.recargo_equiv',    cells: [16,   17,   18  ], fixedValues: { 17: 1.00 }, group: true },
        { id: '19',              cells: [19,  20,  21 ], fixedValues: { 20: 1.40 }, group: true },
        { id: '22',              cells: [22,  23,  24 ], fixedValues: { 23: 5.20 }, group: true },
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
        { id: 'compensaciones_reag',labelKey: 'fm.box.row.compensaciones_reag', cells: [null, 42], editable: true },
        { id: 'reg_bienes_inv',     labelKey: 'fm.box.row.reg_bienes_inv',      cells: [null, 43], editable: true },
        { id: 'prorrata_definitiva',labelKey: 'fm.box.row.prorrata_definitiva', cells: [null, 44], editable: true },
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
        { id: 'op_vu_sujetas',       labelKey: 'fm.box.row.op_vu_sujetas',      cells: [124], editable: true },
        { id: 'caja_heading', type: 'heading', titleKey: 'fm.box.row.caja_heading', separator: true },
        { id: 'criterio_caja_dev', labelKey: 'fm.box.row.criterio_caja_dev', cells: [62, 63],
          rowColHeaders: ['fm.box.colHeader.base', 'fm.box.colHeader.cuota'] },
        { id: 'criterio_caja_ded', labelKey: 'fm.box.row.criterio_caja_ded', cells: [74, 75],
          rowColHeaders: ['fm.box.colHeader.base', 'fm.box.colHeader.cuota_soportada'] },
      ],
    },
    resultado_final: {
      titleKey: 'fm.box.section.resultado_final',
      colHeaderKeys: [],
      rows: [
        { id: 'reg_cuotas_art80',        labelKey: 'fm.box.row.reg_cuotas_art80',        cells: [76], editable: true },
        { id: 'suma_resultados',         labelKey: 'fm.box.row.suma_resultados',          cells: [64] },
        { id: 'atribuible_estado',       labelKey: 'fm.box.row.atribuible_estado',        cells: [65, 66], defaultValues: { 65: 100 }, cellTypes: ['percent', 'amount'], cellUnits: ['%', null], editableCells: [65] },
        { id: 'iva_importacion',         labelKey: 'fm.box.row.iva_importacion',          cells: [77], editable: true },
        { id: 'cuotas_compensar',        labelKey: 'fm.box.row.cuotas_compensar',         cells: [110], editable: true },
        { id: 'cuotas_compensar_aplic',  labelKey: 'fm.box.row.cuotas_compensar_aplic',  cells: [78], editable: true },
        { id: 'cuotas_compensar_post',   labelKey: 'fm.box.row.cuotas_compensar_post',   cells: [87] },
        { id: 'bicolumn_resultado', type: 'bicolumn',
          infoboxes: [
            { id: 'reg_anual',     labelKey: 'fm.box.row.reg_anual',     cells: [68],  editable: true },
            { id: 'otros_ajustes', labelKey: 'fm.box.row.otros_ajustes', cells: [108], editableWhen: [{ field: 'rectificativa', equals: true }, { field: 'motivo_rectificacion', equals: 'D' }] },
          ],
          rows: [
            { id: 'resultado_69',          labelKey: 'fm.box.row.resultado_69',          cells: [69],  total: true },
            { id: 'a_deducir',             labelKey: 'fm.box.row.a_deducir',             cells: [70], editable: true },
            { id: 'devoluciones_at',       labelKey: 'fm.box.row.devoluciones_at',       cells: [109], editable: true },
            { id: 'resultado_declaracion', labelKey: 'fm.box.row.resultado_declaracion', cells: [71],  total: true },
            { id: 'importe_devolucion',    labelKey: 'fm.box.row.importe_devolucion',    cells: [null], rowVisibleWhen: { field: 'tipo_declaracion', in: ['D', 'V', 'X', 'C'] }, derivedValue: { box: 71, abs: true, subtractBox: 70, clampMin: 0 } },
            { id: 'rectificacion_importe', labelKey: 'fm.box.row.rectificacion_importe', cells: [111] },
          ],
        },
      ],
    },
    sin_actividad: {
      sectionType: 'identificacion',
      titleKey: 'fm.section.sin_actividad',
      colHeaderKeys: [],
      fields: [
        { id: 'sin_actividad', labelKey: 'fm.ident.sin_actividad', type: 'checkbox', readOnly: false },
      ],
      rows: [],
    },
    rectificativa: {
      sectionType: 'identificacion',
      titleKey: 'fm.section.rectificativa',
      colHeaderKeys: [],
      fields: [
        { id: 'rectificativa',         labelKey: 'fm.ident.rectificativa',         type: 'checkbox', readOnly: false },
        { id: 'nro_justificante',      labelKey: 'fm.ident.nro_justificante',      type: 'text',     readOnly: false,
          visibleWhen: { field: 'rectificativa', equals: true } },
        { id: 'baja_domiciliacion',    labelKey: 'fm.ident.baja_domiciliacion',    type: 'checkbox', readOnly: false,
          visibleWhen: { field: 'rectificativa', equals: true } },
        { id: 'motivo_rectificacion',  labelKey: 'fm.ident.motivo_heading',        type: 'select',   readOnly: false,
          visibleWhen: { field: 'rectificativa', equals: true },
          options: [
            { value: 'R', labelKey: 'fm.ident.motivo_rectificaciones' },
            { value: 'D', labelKey: 'fm.ident.motivo_discrepancia' },
          ],
        },
      ],
      rows: [],
    },
  },
};

// ── Shared identificacion field arrays ───────────────────────────
// Declared before PATCHES so they can be referenced inside the object literal.

const _2024_IDENTIFICACION_FIELDS = [
  { id: 'nif',           labelKey: 'fm.ident.nif',           type: 'text',     readOnly: true  },
  { id: 'nombre',        labelKey: 'fm.ident.nombre',        type: 'text',     readOnly: true  },
  { id: 'dep_foral',     labelKey: 'fm.ident.dep_foral',     type: 'checkbox', readOnly: false },
  { id: 'redeme',        labelKey: 'fm.ident.redeme',        type: 'checkbox', readOnly: false },
  { id: 'concurso',      labelKey: 'fm.ident.concurso',      type: 'checkbox', readOnly: false },
  { id: 'fecha_concurso', labelKey: 'fm.ident.fecha_concurso', type: 'date',   readOnly: false, visibleWhen: { field: 'concurso', equals: true } },
  { id: 'postconcursal', labelKey: 'fm.ident.postconcursal', type: 'checkbox', readOnly: false, visibleWhen: { field: 'concurso', equals: true } },
  TIPO_DECLARACION_FIELD,
];

// ── Shared patch operations ───────────────────────────────────────
// Complementaria section (2021–2023): patches rectificativa → complementaria with 2 fields.
const _COMPLEMENTARIA_RECTIF_OP = { op: 'patchSection', section: 'rectificativa', patch: {
  titleKey: 'fm.section.complementaria',
  fields: [
    { id: 'complementaria',   labelKey: 'fm.ident.complementaria',   type: 'checkbox', readOnly: false },
    { id: 'nro_justificante', labelKey: 'fm.ident.nro_justificante', type: 'text',     readOnly: false,
      visibleWhen: { field: 'complementaria', equals: true } },
  ],
}};

// Pre-2023 bicolumn resultado (2021–2022): no otros_ajustes/devoluciones_at, has importe_devolucion.
const _PRE2023_BICOLUMN_OP = { op: 'patchRow', section: 'resultado_final', row: 'bicolumn_resultado', patch: {
  infoboxes: [
    { id: 'reg_anual', labelKey: 'fm.box.row.reg_anual', cells: [68], editable: true },
  ],
  rows: [
    { id: 'resultado_69',          labelKey: 'fm.box.row.resultado_69_pre2023',          cells: [69],  total: true },
    { id: 'a_deducir',             labelKey: 'fm.box.row.a_deducir',                      cells: [70], editable: true },
    { id: 'resultado_declaracion', labelKey: 'fm.box.row.resultado_declaracion_pre2023',  cells: [71],  total: true },
    { id: 'importe_devolucion',    labelKey: 'fm.box.row.importe_devolucion',              cells: [null], rowVisibleWhen: { field: 'tipo_declaracion', in: ['D', 'V', 'X', 'C'] }, derivedValue: { box: 71, abs: true, subtractBox: 70, clampMin: 0 } },
  ],
}};

// 2023 / pre-Oct 2024 complementaria ops — identical layout, shared array.
// Used by PATCHES['2023'] and PATCHES['2024_T1'] … PATCHES['2024_M9'].
const _2024_COMPLEMENTARIA_OPS = [
  { op: 'patchSection', section: 'identificacion', patch: { fields: _2024_IDENTIFICACION_FIELDS } },
  { op: 'deleteRow', section: 'iva_devengado', row: '165' },
  { op: 'deleteRow', section: 'iva_devengado', row: '168' },
  // Pre-Oct 2024: box 17 (RE rate) comes from backend (dominant rate among 0%, 0.50%, 0.62%).
  // Clear BASE's fixedValues so backend value shows through; defaultValues provides 0.50 until first compute.
  { op: 'patchRow',  section: 'iva_devengado', row: 'recargo_equiv', patch: { fixedValues: {}, defaultValues: { 17: 0.50 } } },
  { op: 'patchRow',  section: 'iva_devengado', row: '153',            patch: { fixedValues: { 154: 5.00 } } },
  { op: 'patchRow',  section: 'iva_devengado', row: 'total_devengada', patch: { labelKey: 'fm.box.row.total_devengada_2023' } },
  // resultado_final — no otros_ajustes (108), no importe_devolucion, no rectificacion_importe (111)
  { op: 'patchRow', section: 'resultado_final', row: 'bicolumn_resultado', patch: {
    infoboxes: [
      { id: 'reg_anual', labelKey: 'fm.box.row.reg_anual', cells: [68], editable: true },
    ],
    rows: [
      { id: 'resultado_69',          labelKey: 'fm.box.row.resultado_69_pre2023', cells: [69],  total: true },
      { id: 'a_deducir',             labelKey: 'fm.box.row.a_deducir',            cells: [70],  editable: true },
      { id: 'devoluciones_at',       labelKey: 'fm.box.row.devoluciones_at',      cells: [109], editable: true },
      { id: 'resultado_declaracion', labelKey: 'fm.box.row.resultado_declaracion', cells: [71], total: true },
    ],
  }},
  _COMPLEMENTARIA_RECTIF_OP,
];

// ── Year patches ──────────────────────────────────────────────────
// Each entry is an ordered array of ops applied to BASE.
// Keys: 'YYYY' or 'YYYY_period' (period-level takes priority).

const PATCHES = {
  // 2021: rows 150/153/156 (fractional-rate sub-groups) and 165/168 not yet introduced.
  //       identificacion: dep_foral replaces dep_aduanero (gasolinas).
  //       info_adicional: box 61 instead of 120/122/123/124 (OSS boxes introduced in later years).
  //       resultado_final bicolumn lacks boxes 108 (otros_ajustes), 109 (devoluciones_at), 111 (rectificacion_importe).
  //       Source: official AEAT Modelo 303 2021 form.
  '2021': [
    { op: 'patchSection', section: 'identificacion', patch: { fields: _2024_IDENTIFICACION_FIELDS } },
    { op: 'deleteRow', section: 'iva_devengado', row: '150' },
    { op: 'deleteRow', section: 'iva_devengado', row: '165' },
    { op: 'deleteRow', section: 'iva_devengado', row: '153' },
    { op: 'deleteRow', section: 'iva_devengado', row: '156' },
    { op: 'deleteRow', section: 'iva_devengado', row: '168' },
    { op: 'patchRow',  section: 'iva_devengado', row: 'recargo_equiv', patch: { fixedValues: { 17: 0.50 } } },
    // info_adicional: replace 120/122/123/124 with box 61
    { op: 'deleteRow', section: 'info_adicional', row: 'op_no_sujetas_loc' },
    { op: 'deleteRow', section: 'info_adicional', row: 'op_sujetas_inv' },
    { op: 'deleteRow', section: 'info_adicional', row: 'op_vu_no_sujetas' },
    { op: 'deleteRow', section: 'info_adicional', row: 'op_vu_sujetas' },
    { op: 'insertRow', section: 'info_adicional', after: 'exportaciones',
      row: { id: '61', labelKey: 'fm.box.row.op_no_sujetas_derecho_ded', cells: [61] } },
    _PRE2023_BICOLUMN_OP,
    { op: 'patchRow', section: 'iva_devengado', row: 'total_devengada', patch: { labelKey: 'fm.box.row.total_devengada_pre2023' } },
    _COMPLEMENTARIA_RECTIF_OP,
  ],

  // 2022: rows 150/153/156 and 165/168 absent (same as 2021).
  //       identificacion: dep_foral replaces dep_aduanero (gasolinas).
  //       info_adicional unchanged from BASE (120/122/123/124 present — unlike 2021 which uses box 61).
  //       resultado_final bicolumn lacks boxes 108, 109, 111 (same as 2021).
  //       Source: official AEAT Modelo 303 2022 form.
  '2022': [
    { op: 'patchSection', section: 'identificacion', patch: { fields: _2024_IDENTIFICACION_FIELDS } },
    { op: 'deleteRow', section: 'iva_devengado', row: '150' },
    { op: 'deleteRow', section: 'iva_devengado', row: '165' },
    { op: 'deleteRow', section: 'iva_devengado', row: '153' },
    { op: 'deleteRow', section: 'iva_devengado', row: '156' },
    { op: 'deleteRow', section: 'iva_devengado', row: '168' },
    { op: 'patchRow',  section: 'iva_devengado', row: 'recargo_equiv', patch: { fixedValues: { 17: 0.50 } } },
    _PRE2023_BICOLUMN_OP,
    { op: 'patchRow', section: 'iva_devengado', row: 'total_devengada', patch: { labelKey: 'fm.box.row.total_devengada_pre2023' } },
    _COMPLEMENTARIA_RECTIF_OP,
  ],

  // 2025: structurally identical to BASE (2026) — all rows and bicolumn boxes present.
  //       Empty patch required so SUPPORTED_YEARS includes 2025 in the year selector.
  //       Source: official AEAT Modelo 303 2025 form.
  '2025': [],

  // 2024 T4/M10/M11 (Oct+): rows 165/166/167 and 168/169/170 ARE present (same as BASE 2025/2026).
  //       resultado_final: has reg_anual (68) + otros_ajustes (108) but no importe_devolucion / rectificacion_importe (111).
  //       Rows 165/168 deletions and total_devengada label patch are in _2024_COMPLEMENTARIA_OPS (T1–M9 only).
  '2024': [
    { op: 'patchSection', section: 'identificacion', patch: { fields: _2024_IDENTIFICACION_FIELDS } },
    { op: 'patchRow', section: 'resultado_final', row: 'bicolumn_resultado', patch: {
      infoboxes: [
        { id: 'reg_anual',     labelKey: 'fm.box.row.reg_anual',     cells: [68],  editable: true },
        { id: 'otros_ajustes', labelKey: 'fm.box.row.otros_ajustes', cells: [108], editableWhen: [{ field: 'rectificativa', equals: true }, { field: 'motivo_rectificacion', equals: 'D' }] },
      ],
      rows: [
        { id: 'resultado_69',          labelKey: 'fm.box.row.resultado_69',          cells: [69],  total: true },
        { id: 'a_deducir',             labelKey: 'fm.box.row.a_deducir',             cells: [70],  editable: true },
        { id: 'devoluciones_at',       labelKey: 'fm.box.row.devoluciones_at',       cells: [109], editable: true },
        { id: 'resultado_declaracion', labelKey: 'fm.box.row.resultado_declaracion', cells: [71],  total: true },
      ],
    }},
  ],

  // Pre-2024: simpler form — no high-box rows, no recargo equiv., fewer deductible lines.
  // Identical layout to pre-Oct 2024 (complementaria); shares _2024_COMPLEMENTARIA_OPS.
  '2023': _2024_COMPLEMENTARIA_OPS,
};

// ── 2024 period-specific assignments ─────────────────────────────
// Pre-October 2024 periods use the same ops as 2023 (declared above as _2024_COMPLEMENTARIA_OPS).
// Oct+ 2024 (T4, M10, M11) falls through to PATCHES['2024'].
['T1', 'T2', 'T3', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'].forEach(p => {
  PATCHES[`2024_${p}`] = _2024_COMPLEMENTARIA_OPS;
});

// ── Supported years ───────────────────────────────────────────────
// Derived from PATCHES keys + BASE year so adding PATCHES['2027'] automatically
// expands this list — no change to consumers (e.g. FmOverlays) needed.
// Period-suffix keys (e.g. '2024_T1') map to NaN and are filtered out.

const BASE_YEAR = 2026;
export const SUPPORTED_YEARS = [...new Set([
  ...Object.keys(PATCHES).map(Number).filter(n => !isNaN(n)),
  BASE_YEAR,
])].sort((a, b) => a - b);

// ── Patch engine ──────────────────────────────────────────────────

function opDeleteRow(sections, op) {
  if (sections[op.section]) {
    sections[op.section].rows = sections[op.section].rows.filter(r => r.id !== op.row);
  }
}

function opInsertRow(sections, op) {
  if (!sections[op.section]) return;
  const rows = sections[op.section].rows;
  let idx = rows.length;
  if (op.after != null) {
    const pos = rows.findIndex(r => r.id === op.after);
    idx = pos === -1 ? rows.length : pos + 1;
  }
  if (op.before != null) {
    const pos = rows.findIndex(r => r.id === op.before);
    idx = pos === -1 ? rows.length : pos;
  }
  rows.splice(idx, 0, op.row);
}

function opPatchRow(sections, op) {
  if (!sections[op.section]) return;
  const row = sections[op.section].rows.find(r => r.id === op.row);
  if (row) Object.assign(row, op.patch);
}

function opReorderRows(sections, op) {
  if (!sections[op.section]) return;
  const byId = Object.fromEntries(sections[op.section].rows.map(r => [r.id, r]));
  sections[op.section].rows = op.order.map(id => byId[id]).filter(Boolean);
}

function opDeleteSection(sectionOrder, op) {
  const idx = sectionOrder.indexOf(op.section);
  if (idx !== -1) sectionOrder.splice(idx, 1);
}

function opInsertSection(sectionOrder, sections, op) {
  let idx = sectionOrder.length;
  if (op.after  != null) idx = sectionOrder.indexOf(op.after)  + 1;
  if (op.before != null) idx = sectionOrder.indexOf(op.before);
  sectionOrder.splice(Math.max(0, idx), 0, op.section);
  sections[op.section] = op.section_def;
}

function opPatchSection(sections, op) {
  if (!sections[op.section]) return;
  const patch = { ...op.patch };
  delete patch.rows;
  Object.assign(sections[op.section], patch);
}

export function applyPatch(ops) {
  const sectionOrder = [...BASE.sectionOrder];
  const sections = {};
  for (const [id, sec] of Object.entries(BASE.sections)) {
    sections[id] = { ...sec, rows: sec.rows.map(r => ({ ...r })) };
  }

  for (const op of ops) {
    switch (op.op) {
      case 'deleteRow':     opDeleteRow(sections, op);                    break;
      case 'insertRow':     opInsertRow(sections, op);                    break;
      case 'patchRow':      opPatchRow(sections, op);                     break;
      case 'reorderRows':   opReorderRows(sections, op);                  break;
      case 'deleteSection': opDeleteSection(sectionOrder, op);            break;
      case 'insertSection': opInsertSection(sectionOrder, sections, op);  break;
      case 'patchSection':  opPatchSection(sections, op);                 break;
    }
  }

  return { sections: sectionOrder.map(id => ({ id, ...sections[id] })).filter(s => s.titleKey || s.titleKeyMap) };
}

// ── Public API ────────────────────────────────────────────────────

export function getLayout303(year, period) {
  const ops =
    PATCHES[`${year}_${period}`] ??
    PATCHES[String(year)] ??
    null;

  if (!ops) {
    return { sections: BASE.sectionOrder.map(id => ({ id, ...BASE.sections[id] })).filter(s => s.titleKey || s.titleKeyMap) };
  }

  return applyPatch(ops);
}
