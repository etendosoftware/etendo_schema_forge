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

// ETP-5431 — Nota 3's only exception (sheet `DP303DID` cell `A38` of `DR303e26v101.xlsx`): the
// box-111 obligation to supply bank data does NOT apply when the declaration marks
// "Rectificativa - Como consecuencia de la presentación de la autoliquidación rectificativa
// solicito dar de baja/modificar la domiciliación efectuada" (`baja_domiciliacion`, sent to AEAT
// as `Cancel_Modify_Debit`). Mirrors AEAT303Report2024's `isCancelOrModifyDebitRequested` guard.
//
// `matchesVisibility` supports only `{field, equals|in}`, `anyOf` and `allOf` — there is no
// `not`/`notEquals` operator, and this deliberately does NOT add one. The negation is expressed
// with the existing `in` operator by enumerating every "unchecked" representation the checkbox
// can hold: React state stores it as a strict boolean (`identification?.[f.id] ?? false` in
// FmBoxes303, `onToggle` passes a boolean) and it JSON-round-trips through
// `decl.manualData.identification` unchanged, so `false` and `undefined` (never touched) are the
// real cases; `null` is defensive. Unlike `_box111NonZero`, this needs no synthetic key — the
// field lives in `identification` already.
// `'N'`/`''` are in the list for the same reason `isCancelModifyDebitRequested`
// (fiscalModelsUtils.js) also accepts `'Y'`: a value persisted in that shape must still read as
// "not waived" here, or the bank section would vanish for a taxpayer who never marked anything.
const _BANK_NOT_WAIVED = { field: 'baja_domiciliacion', in: [false, undefined, null, '', 'N'] };

// The "condition B" branch shared by every bank gate below: a rectificativa carrying a non-zero
// box 111, with the direct-debit cancellation NOT requested. Single definition so visibility and
// requiredness cannot drift apart again (the ETP-5393 manual-QA lesson).
const _BANK_RECTIFICATIVA_BRANCH = { allOf: [
  { field: 'rectificativa', equals: true },
  { field: '_box111NonZero', equals: true },
  _BANK_NOT_WAIVED,
] };

// DESIGN DECISION, NOT A CITED AEAT RULE (ETP-5431) — which fields make up "los datos de cuenta
// bancaria" of Nota 3 is decided by this team; `DR303e26v101.xlsx` conditions no field on the
// marca SEPA (Nota 2, cells `DP303DID!A30:B35`, only enumerates its values). Adopted selection,
// mirroring AEAT303Report2024's `sepaMarkRequiresSwiftBic`/`sepaMarkRequiresForeignBankDetails`
// so screen and file agree:
//   marca 1 (Cuenta España)        → IBAN + marca SEPA
//   marca 2 (Unión Europea SEPA)   → + SWIFT-BIC
//   marca 3 (Resto Países)         → + Banco, Dirección, Ciudad, Código País
// Rationale (our reading): the record design attaches the Nota 3 pointer to exactly SWIFT-BIC,
// IBAN and marca SEPA, and to none of Banco/Dirección/Ciudad/Código País, which only route a
// rest-of-world transfer. Do not document or test this as an AEAT requirement.
// `bank_sepa` is a text input, so its value is a string; the numeric variants are defensive.
const _SEPA_MARK_NEEDS_SWIFT = { field: 'bank_sepa', in: ['2', '3', 2, 3] };
const _SEPA_MARK_NEEDS_FOREIGN_DETAILS = { field: 'bank_sepa', in: ['3', 3] };

// ETP-5431 — the marca-SEPA restriction is SCOPED TO THE NOTA 3 BRANCH. It lives inside the
// rectificativa branch, never as a sibling condition that would also narrow the tipo U/D/X one.
// Reason: the backend's blanking (AEAT303Report2024#patchBankSection) is scoped the same way, so
// screen and file agree. A plain D/V/X refund with no box 111 is untouched by this ticket -
// `AEAT303Report2021#generatePage3` still writes whatever bank data is stored for it, so hiding
// those fields on screen would send values the user can no longer see.
const _BANK_NOTA3_NEEDS_SWIFT = { allOf: [
  _BANK_RECTIFICATIVA_BRANCH,
  _SEPA_MARK_NEEDS_SWIFT,
] };
const _BANK_NOTA3_NEEDS_FOREIGN_DETAILS = { allOf: [
  _BANK_RECTIFICATIVA_BRANCH,
  _SEPA_MARK_NEEDS_FOREIGN_DETAILS,
] };

const _TIPO_IS_DVX = { field: 'tipo_declaracion', in: ['D', 'V', 'X'] };

// ETP-5431 — the logical negation of `_BANK_RECTIFICATIVA_BRANCH`, by De Morgan: NOT (a AND b AND
// c) is (NOT a) OR (NOT b) OR (NOT c). Each negated clause is enumerated with the existing `in`
// operator, the same technique `_BANK_NOT_WAIVED` uses, so the matcher still needs no `not`.
//
// Why it exists: without it, the tipo U/D/X branch of a bank field's `visibleWhen` stays true
// even while the declaration IS in the Nota 3 case, so a tipo D rectificativa with a non-zero
// box 111 and marca 1 showed SWIFT-BIC and the four foreign-bank fields on screen while
// `AEAT303Report2024#patchBankSection` blanked those very positions in the file. ANDing the tipo
// branch with this makes the tipo branch step aside exactly when the marca gate takes over, so
// screen and file agree on BOTH sides of the scope boundary, not just one.
//
// The enumerations mirror how each field is actually stored. `rectificativa` is a checkbox
// (strict boolean, JSON-round-tripped) and `_box111NonZero` is synthetic — always a strict
// boolean from `withBox111NonZeroFlag`, `undefined` only if a caller forgot to merge it. The
// third clause is the POSITIVE test for the waiver, so it enumerates the same two shapes
// `isCancelModifyDebitRequested` (fiscalModelsUtils.js) accepts: the boolean the checkbox writes
// today, and the legacy `'Y'` string. It is the exact complement of `_BANK_NOT_WAIVED`.
const _NOT_NOTA3 = { anyOf: [
  { field: 'rectificativa', in: [false, undefined, null, '', 'N'] },
  { field: '_box111NonZero', in: [false, undefined, null] },
  { field: 'baja_domiciliacion', in: [true, 'Y'] },
] };

// The plain-refund branch: tipo D/V/X *and not* in the Nota 3 case. Unrestricted by the marca,
// exactly as before this ticket — `AEAT303Report2021#generatePage3` still writes the whole bank
// block for these, so hiding a field here would send a value the user can no longer see.
const _TIPO_DVX_OUTSIDE_NOTA3 = { allOf: [_TIPO_IS_DVX, _NOT_NOTA3] };

// visibleWhen shared by 6 of the 7 bank fields (all but bank_iban, which has no
// field-level gate of its own and relies solely on sectionVisibleWhen below).
// NOTE: widened the same way and for the same reason as datos_bancarios.sectionVisibleWhen
// (ETP-4456 follow-up fix). The original {D, V, X} tipo-only condition left these fields
// hidden for a rectificativa filed under any other tipo (e.g. 'I'), even though
// AEAT303Report's checkIsDeclarationRMandatoryParams / checkBox111MandatoryParams
// hard-require SWIFT_BIC/BANK/BANKADDRESS/BANKCITY/COUNTRYISO/SEPA whenever a
// rectificativa has a non-zero box 111 amount, independent of tipo_declaracion.
//
// ETP-5393 manual-QA fix (supersedes the ETP-4456 follow-up's "harmless UX-only
// over-show" call): the rectificativa branch now ALSO requires `_box111NonZero`. The
// earlier version showed these fields as soon as 'rectificativa' was checked, regardless
// of box 111 — intentionally, on the theory that gating visibility on box 111 too was
// unnecessary complexity since the required-mark already tracked it correctly. Manual QA
// confirmed this reads as a real bug from the user's seat: unchecking rectificativa, or
// clearing box 111 back to 0, left the whole bank block sitting on screen (just without
// the asterisk) instead of disappearing — so visibility must track the exact same
// condition as requiredness (`_BANK_FULL_BLOCK_REQUIRED_WHEN` below), not a looser one.
//
// ETP-5431 — the rectificativa branch now also demands that the taxpayer has NOT marked
// `baja_domiciliacion`; see `_BANK_NOT_WAIVED` / `_BANK_RECTIFICATIVA_BRANCH` below.
const _BANK_DVX_VW = { anyOf: [
  _TIPO_IS_DVX,
  _BANK_RECTIFICATIVA_BRANCH,
] };

// ETP-5431 — inside the Nota 3 branch, a field the marca SEPA does not call for is HIDDEN, not
// merely un-required, so the user cannot leave a stray value on screen in a block whose unused
// positions the file must carry blank (AEAT303Report2024#patchBankSection blanks them).
//
// Read the shape as "plain refund, unrestricted — OR — Nota 3 case, per the marca". The two
// branches are mutually exclusive by construction (`_TIPO_DVX_OUTSIDE_NOTA3` carries
// `_NOT_NOTA3`), so a tipo D that IS in the Nota 3 case falls through to the marca gate instead
// of being shown unconditionally by its tipo. That mutual exclusivity is the whole point: it is
// what makes the frontend agree with the backend on both sides of the scope boundary.
//
// `bank_sepa` and `bank_iban` are never gated this way: the marca selector must stay reachable,
// and the position-23 field carries a value under every marca.
//
// Hiding does NOT clear the stored value, deliberately: the backend blanking already guarantees
// the file is correct, so clearing would only destroy typed work. Switching marca 3 → 1 → 3 must
// bring the bank name/address/city/country back exactly as they were, and there is deliberately
// no dependent-field-clearing callout for these fields anywhere.
const _BANK_SWIFT_VW = { anyOf: [_TIPO_DVX_OUTSIDE_NOTA3, _BANK_NOTA3_NEEDS_SWIFT] };
const _BANK_FOREIGN_DETAILS_VW = {
  anyOf: [_TIPO_DVX_OUTSIDE_NOTA3, _BANK_NOTA3_NEEDS_FOREIGN_DETAILS],
};

// ETP-5393 Bug E — bank_iban's requiredness: mandatory unconditionally for tipo U/D/X
// (AEAT error EDID065, "devolución"/"domiciliación" case — condition A), OR for a
// rectificativa carrying a non-zero box 111 (rectificacion_importe) amount, independent of
// tipo_declaracion (AEAT303Report's checkBox111MandatoryParams — condition B). `_box111NonZero`
// is a synthetic key callers merge into `identification` via `withBox111NonZeroFlag`
// (fiscalModelsUtils.js) before this is evaluated — it does not come from the form itself.
// ETP-5431 — condition B additionally requires that `baja_domiciliacion` is not marked (Nota 3's
// exception). Keep in sync with `isBankIbanRequired` in fiscalModelsUtils.js, its imperative
// mirror used by the generate/submit pre-flight guards.
const _BANK_IBAN_REQUIRED_WHEN = { anyOf: [
  { field: 'tipo_declaracion', in: ['U', 'D', 'X'] },
  _BANK_RECTIFICATIVA_BRANCH,
] };

// ETP-5393 follow-up (manual-QA fix) — ONLY condition B (rectificativa + non-zero box 111)
// requires the FULL bank block (BANK/SWIFT/SEPA/ADDRESS/CITY/COUNTRY). Condition A (tipo
// U/D/X, i.e. a plain devolución/domiciliación) requires IBAN alone per AEAT error EDID065 —
// AEAT303Report's checkIsDeclarationRMandatoryParams only escalates to the full block when the
// declaration is ALSO a rectificativa with a non-zero box 111. An earlier version of this fix
// applied `_BANK_IBAN_REQUIRED_WHEN` (condition A OR B) to all 7 fields, which wrongly forced
// the full bank block on every plain devolución (manual QA caught this: only IBAN should be
// required there). Do NOT fold this back into `_BANK_IBAN_REQUIRED_WHEN` — the two are
// deliberately different in scope.
//
// ETP-5431 — this is no longer one condition for all 6 remaining fields. It stays the baseline
// (condition B, now also gated on `baja_domiciliacion` not being marked) and is what `bank_sepa`
// itself needs, but SWIFT-BIC and the Banco/Direccion/Ciudad/Pais block escalate with the marca
// SEPA - see `_SEPA_MARK_NEEDS_SWIFT`/`_SEPA_MARK_NEEDS_FOREIGN_DETAILS` above for the decision
// and its (non-normative) rationale.
const _BANK_FULL_BLOCK_REQUIRED_WHEN = _BANK_RECTIFICATIVA_BRANCH;
// Requiredness IS the Nota 3 branch plus the marca gate — the very same condition the visibility
// constants embed, reused rather than restated so the two cannot drift apart. (Requiredness has
// no tipo U/D/X branch at all: condition A requires IBAN only, per the ETP-5393 follow-up above.)
const _BANK_SWIFT_REQUIRED_WHEN = _BANK_NOTA3_NEEDS_SWIFT;
const _BANK_FOREIGN_DETAILS_REQUIRED_WHEN = _BANK_NOTA3_NEEDS_FOREIGN_DETAILS;

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
  sectionOrder: ['identificacion', 'datos_bancarios', 'iva_devengado', 'iva_deducible', 'resultado', 'info_adicional', 'resultado_final', 'tributacion_territorial', 'info_adicional_ultimo_periodo', 'sin_actividad', 'rectificativa'],
  sections: {
    identificacion: {
      sectionType: 'identificacion',
      titleKey: 'fm.box.section.identificacion',
      colHeaderKeys: [],
      fields: [
        { id: 'nif',             labelKey: 'fm.ident.nif',             type: 'text',     readOnly: true  },
        { id: 'nombre',          labelKey: 'fm.ident.nombre',          type: 'text',     readOnly: true  },
        { id: 'redeme',          labelKey: 'fm.ident.redeme',          type: 'checkbox', readOnly: false },
        { id: 'concurso',        labelKey: 'fm.ident.concurso',        type: 'checkbox', readOnly: false },
        { id: 'fecha_concurso',  labelKey: 'fm.ident.fecha_concurso',  type: 'date',     readOnly: false, required: true, visibleWhen: { field: 'concurso', equals: true } },
        { id: 'postconcursal',   labelKey: 'fm.ident.postconcursal',   type: 'checkbox', readOnly: false, visibleWhen: { field: 'concurso', equals: true } },
        TIPO_DECLARACION_FIELD,
      ],
      rows: [],
    },
    datos_bancarios: {
      sectionType: 'identificacion',
      titleKeyFrom: 'tipo_declaracion',
      titleKeyMap: {
        D: 'fm.section.devolucion', X: 'fm.section.devolucion',
        U: 'fm.section.domiciliacion',
      },
      // Only U (Domiciliación), D (Devolución) and X (Devolución transferencia
      // extranjero) may carry IBAN per AEAT error EDID065 — see IBAN_REQUIRED_TIPOS.
      // ALSO shown whenever 'rectificativa' is checked AND box 111 (rectificacion_importe)
      // is non-zero, regardless of tipo_declaracion: AEAT303Report's
      // checkIsDeclarationRMandatoryParams hard-requires the bank fields
      // (BANK/IBAN/SWIFT/SEPA/ADDRESS/CITY/COUNTRY) when a rectificativa carries a non-zero
      // box 111 amount — a requirement that is independent of tipo_declaracion. Without this
      // OR branch, e.g. tipo 'I' (Ingreso) rectificativas had no UI at all to enter the
      // now-mandatory bank data, causing a submission-blocking backend hard-fail.
      //
      // ETP-5393 manual-QA fix — this used to gate on "rectificativa checked" alone (any
      // box 111 value), a deliberate UX-only over-show. Manual QA confirmed that reads as a
      // real bug: unchecking rectificativa, or clearing box 111 back to 0, left the section
      // visibly stuck on screen. It now requires `_box111NonZero` too, matching
      // `_BANK_FULL_BLOCK_REQUIRED_WHEN` exactly, so visibility and requiredness hide/show
      // together. See FmBoxes303's matchesSvw/anyOf+allOf support.
      //
      // ETP-5431 — the rectificativa branch is now `_BANK_RECTIFICATIVA_BRANCH`, which also
      // requires that `baja_domiciliacion` is NOT marked: per Nota 3's exception, a taxpayer
      // asking to cancel/modify the existing direct debit must not be asked for bank data, and
      // AEAT303Report2024 leaves the block blank in that case. Tipo U/D/X keeps showing the
      // section regardless of the flag - those types need an account by virtue of the type
      // itself, which is outside Nota 3's scope.
      sectionVisibleWhen: { anyOf: [
        { field: 'tipo_declaracion', in: ['U', 'D', 'X'] },
        _BANK_RECTIFICATIVA_BRANCH,
      ] },
      fieldLayout: 'aligned',
      colHeaderKeys: [],
      fields: [
        // ETP-5393 Bug E — bank_iban used to be `required: true` unconditionally within this
        // section, which made it mandatory even for a rectificativa whose box 111
        // (rectificacion_importe) is 0 — a case AEAT303Report's checkBox111MandatoryParams does
        // NOT require bank data for. Split into: always required for tipo U/D/X (AEAT EDID065,
        // unrelated to rectificativa), and — independently — required for ANY tipo when
        // rectificativa is checked AND box 111 is non-zero. `_box111NonZero` is a synthetic key
        // callers merge into `identification` via `withBox111NonZeroFlag` (fiscalModelsUtils.js)
        // before this is evaluated; it does not come from the form itself.
        // ETP-5393 follow-up (manual-QA fix) — the other 6 bank fields require the FULL block
        // (`_BANK_FULL_BLOCK_REQUIRED_WHEN`), which is ONLY true for condition B (rectificativa +
        // non-zero box 111). A plain devolución/domiciliación (tipo U/D/X, condition A) requires
        // IBAN alone per AEAT error EDID065 — it must NOT force the full bank block. bank_iban
        // keeps the wider `_BANK_IBAN_REQUIRED_WHEN` (A OR B); do not widen the other 6 to match.
        { id: 'bank_iban', labelKey: 'fm.ident.bank.iban', type: 'text', readOnly: false,
          requiredWhen: _BANK_IBAN_REQUIRED_WHEN },
        // ETP-5431 — visibility AND requiredness now escalate with the marca SEPA (`bank_sepa`):
        // SWIFT-BIC from marca 2, and Banco/Dirección/Ciudad/País only for marca 3. A DESIGN
        // DECISION, NOT an AEAT requirement - see `_SEPA_MARK_NEEDS_SWIFT` above. A field the
        // marca does not call for is hidden (its stored value is deliberately NOT cleared - see
        // `_BANK_SWIFT_VW`). `bank_sepa` stays visible for the whole section: it is the selector.
        { id: 'bank_swift_bic', labelKey: 'fm.ident.bank.swift_bic', type: 'text', readOnly: false, visibleWhen: _BANK_SWIFT_VW, requiredWhen: _BANK_SWIFT_REQUIRED_WHEN },
        { id: 'bank_nombre',    labelKey: 'fm.ident.bank.nombre',    type: 'text', readOnly: false, visibleWhen: _BANK_FOREIGN_DETAILS_VW, requiredWhen: _BANK_FOREIGN_DETAILS_REQUIRED_WHEN },
        { id: 'bank_direccion', labelKey: 'fm.ident.bank.direccion', type: 'text', readOnly: false, visibleWhen: _BANK_FOREIGN_DETAILS_VW, requiredWhen: _BANK_FOREIGN_DETAILS_REQUIRED_WHEN },
        { id: 'bank_ciudad',    labelKey: 'fm.ident.bank.ciudad',    type: 'text', readOnly: false, visibleWhen: _BANK_FOREIGN_DETAILS_VW, requiredWhen: _BANK_FOREIGN_DETAILS_REQUIRED_WHEN },
        { id: 'bank_pais',      labelKey: 'fm.ident.bank.pais',      type: 'text', readOnly: false, visibleWhen: _BANK_FOREIGN_DETAILS_VW, requiredWhen: _BANK_FOREIGN_DETAILS_REQUIRED_WHEN },
        { id: 'bank_sepa',      labelKey: 'fm.ident.bank.sepa',      type: 'text', readOnly: false, visibleWhen: _BANK_DVX_VW, requiredWhen: _BANK_FULL_BLOCK_REQUIRED_WHEN },
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
        // ETP-5393 Bug F — Modificación bases y cuotas [14][15]. No `editable`/`editableCells`
        // flag on purpose: these are backend-computed from corrective/credit-memo invoices
        // (see Fiscal303BoxesHandler#fillMemoCorrectiveBoxPair in com.etendoerp.go) — the row
        // used to render blank because the backend never populated 14/15 at all, which read as
        // "always empty", not as a deliberately editable cell. Do not add `editable: true` here.
        { id: 'mod_bases',       labelKey: 'fm.box.row.mod_bases',        cells: [14,   null, 15  ] },
        { id: '156',             cells: [156, 157, 158], fixedValues: { 157: 1.75 }, group: true },
        { id: '168',             cells: [168, 169, 170], fixedValues: { 169: 0.50 }, group: true },
        { id: 'recargo_equiv',   labelKey: 'fm.box.row.recargo_equiv',    cells: [16,   17,   18  ], fixedValues: { 17: 1.00 }, group: true },
        { id: '19',              cells: [19,  20,  21 ], fixedValues: { 20: 1.40 }, group: true },
        { id: '22',              cells: [22,  23,  24 ], fixedValues: { 23: 5.20 }, group: true },
        // ETP-5393 Bug F — Modificaciones bases y cuotas del recargo de equivalencia [25][26].
        // Same rationale as mod_bases above — backend-computed, no `editable` flag.
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
        // ETP-5393 Bug F — Rectificación de deducciones [40][41]. Backend-computed from
        // corrective/credit-memo purchase invoices (Fiscal303BoxesHandler#
        // fillMemoCorrectiveBoxPair); no `editable` flag, same rationale as mod_bases above.
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
        // ETP-5338 pt.2: box 87 is display-only — AEAT computes and validates 110-78 on their
        // side at submission time (the .303 file uploads correctly without this value), but the
        // UI previously showed it blank because no box in `recomputeDerivedBoxes` ever populated
        // it. `derivedValue` here mirrors `importe_devolucion`'s pattern below: box 110 minus box
        // 78, floored at 0 (box 87 represents "cuotas pendientes de compensar", which by AEAT
        // definition cannot be negative). This is purely a client-side rendering fallback (see
        // FmBoxes303.jsx's `renderBoxCell`) — it does not touch `manualData`, `recomputeDerivedBoxes`,
        // or anything sent in the submission payload.
        //
        // `treatMissingAsZero: true` — confirmed with the product owner (cycle 2, reversing the
        // cycle-1 QA rejection which assumed the wrong AEAT semantics): a missing box110 or box78
        // defaults to 0, EXCEPT when BOTH are missing, in which case the cell stays blank. This
        // flag is scoped to this row only — `importe_devolucion` below keeps its original
        // "missing operand blanks the result" behavior and must not be changed.
        { id: 'cuotas_compensar_post',   labelKey: 'fm.box.row.cuotas_compensar_post',   cells: [87], derivedValue: { box: 110, subtractBox: 78, clampMin: 0, treatMissingAsZero: true } },
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
            { id: 'rectificacion_importe', labelKey: 'fm.box.row.rectificacion_importe', cells: [111], editable: true },
          ],
        },
      ],
    },
    // ── Last-period-only sections (ETP-5391) ─────────────────────────
    // Classic's AEAT303Report2019/AEAT303Report2021 (`insertLastPeriodInfo`/`commonTerritory`)
    // only populate these boxes when the declared period is the last of the fiscal year
    // (quarterly T4 / monthly 12) — see isLastPeriodOfYear below, which getLayout303 uses to
    // strip these two sections out entirely for any other period. All values here are plain
    // AEAT-protocol request params forwarded verbatim by Fiscal303SubmissionSupport's
    // mergeAeatRequestParams — no backend change needed, same mechanism as every other
    // BOX_PARAM_MAP/IDENT_PARAM_MAP entry (see fiscalModelsUtils.js).
    // Casillas 89/90/91/92 (Álava, Gipuzkoa, Bizkaia, Navarra) map 1:1 to AEAT303Report2018LastPeriod's
    // ALAVA/GUIPUZCOA/VIZCAYA/NAVARRA inputParams keys. Casilla 107 (Territorio Común) is a READ-ONLY
    // mirror of box 65 (atribuible_estado, resultado_final section) — Classic's own commonTerritory()
    // computes 107 from the exact same "ToPublicTreasury" value box 65 carries, only gated behind
    // isLastPeriod + SII-installed-org + a persisted TaxReportGroup/Parameter pair seeded from this
    // module's own referencedata for the model-303 TaxReport. Two independently-editable UI fields for
    // the same underlying AEAT param let a user set them to conflicting values (fixed in ETP-5391) —
    // 107 is now a `derivedValue` (see FmBoxes303's renderDerivedCell, which reads box 65 live via
    // `valueMap`) instead of its own editable row. BOX_PARAM_MAP no longer carries a 107 entry; box 65
    // alone is forwarded to AEAT now (see fiscalModelsUtils.js).
    tributacion_territorial: {
      titleKey: 'fm.box.terr.title',
      colHeaderKeys: [],
      rows: [
        { id: 'territorio_alava',     labelKey: 'fm.box.terr.alava',     cells: [89],  cellTypes: ['percent'], cellUnits: ['%'], editable: true },
        { id: 'territorio_guipuzcoa', labelKey: 'fm.box.terr.guipuzcoa', cells: [90],  cellTypes: ['percent'], cellUnits: ['%'], editable: true },
        { id: 'territorio_vizcaya',   labelKey: 'fm.box.terr.vizcaya',   cells: [91],  cellTypes: ['percent'], cellUnits: ['%'], editable: true },
        { id: 'territorio_navarra',   labelKey: 'fm.box.terr.navarra',   cells: [92],  cellTypes: ['percent'], cellUnits: ['%'], editable: true },
        { id: 'territorio_comun',     labelKey: 'fm.box.terr.territorio_comun', cells: [107], cellTypes: ['percent'], cellUnits: ['%'],
          derivedValue: { box: 65, defaultValue: 100 } },
      ],
    },
    // Casillas 95 (REAGYP), 97 (bienes usados), 98 (agencias de viaje), 127 (OSS) and 128
    // (intragrupo) — all plain manual overrides read straight from inputParams by
    // AEAT303Report2018LastPeriod/AEAT303Report2021, exactly like box 44 (prorrata_definitiva)
    // above. Box 96 (always zero-filled) and box 99 (computed from DB) are NOT manual inputs and
    // are intentionally omitted — see docs/feedback.md discussion on ETP-5391.
    //
    // `declaracion_terceros` (the Modelo 347 filing-exemption checkbox) used to have its own
    // section with its own heading — merged in here as a leading inline checkbox (no separate
    // title of its own) to match Classic's actual popup layout, which groups it together with
    // these five boxes under one heading. FmBoxes303.jsx renders `fields` (if present) before
    // `rows` for a non-identificacion-typed section — see its "leading fields checkbox" support.
    info_adicional_ultimo_periodo: {
      titleKey: 'fm.box.section.info_adicional_ultimo_periodo',
      colHeaderKeys: [],
      fields: [
        { id: 'declaracion_terceros', labelKey: 'fm.ident.declaracion_terceros', type: 'checkbox', readOnly: false },
      ],
      rows: [
        { id: 'info_reagyp',         labelKey: 'fm.box.row.info_reagyp',         cells: [95],  editable: true },
        { id: 'info_bienes_usados',  labelKey: 'fm.box.row.info_bienes_usados',  cells: [97],  editable: true },
        { id: 'info_agencias_viaje', labelKey: 'fm.box.row.info_agencias_viaje', cells: [98],  editable: true },
        { id: 'info_oss',            labelKey: 'fm.box.row.info_oss',            cells: [127], editable: true },
        { id: 'info_intragrupo',     labelKey: 'fm.box.row.info_intragrupo',     cells: [128], editable: true },
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
  { id: 'redeme',        labelKey: 'fm.ident.redeme',        type: 'checkbox', readOnly: false },
  { id: 'concurso',      labelKey: 'fm.ident.concurso',      type: 'checkbox', readOnly: false },
  { id: 'fecha_concurso', labelKey: 'fm.ident.fecha_concurso', type: 'date',   readOnly: false, required: true, visibleWhen: { field: 'concurso', equals: true } },
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

// ── Selectable years (NEW declarations only) ───────────────────────
// SUPPORTED_YEARS above spans every year a layout can be RESOLVED for
// (historical declarations, 2021-2025, still need their original layout to
// open/edit correctly — see getLayout303). SELECTABLE_YEARS is the narrower
// list of years a user may pick when CREATING a new declaration — today just
// the current filing year. Keep this in sync manually (it is intentionally
// not derived from SUPPORTED_YEARS) whenever a new filing year opens up.
export const SELECTABLE_YEARS = [BASE_YEAR];

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

/**
 * True when `period` denotes the last period of the fiscal year: T4
 * (quarterly) or month 12 (monthly December) — accepts both the string and
 * numeric forms `getLayout303`'s callers have historically passed
 * (`'T4'`/`'4'`/`4` for quarterly, `'12'`/`12` for monthly). Shared with
 * `AeatSubmitFlow.jsx`'s pre-flight IAE-activity guard (ETP-4975) so both call
 * sites agree on exactly which periods count as "last" — this used to be an
 * inline check duplicated ad hoc, which is exactly the kind of drift that
 * survives review (see neo-headless.md's ETP-4838 lesson on re-deriving a
 * query instead of calling the one place that already computes the answer).
 */
export function isLastPeriodOfYear(period) {
  return period === 'T4' || period === '12' || period === 4 || period === 12 || period === '4';
}

// Section ids only meaningful in the last period of the fiscal year (ETP-5391) — see the
// tributacion_territorial/info_adicional_ultimo_periodo section definitions in BASE above
// (the latter also carries the declaracion_terceros checkbox as a leading field). getLayout303
// strips these out entirely for any other period.
const LAST_PERIOD_ONLY_SECTIONS = new Set([
  'tributacion_territorial',
  'info_adicional_ultimo_periodo',
]);

// Evaluates a visibility condition object ({ field, in: [...] | equals: ... }, an
// OR-of-conditions { anyOf: [...] }, or an AND-of-conditions { allOf: [...] }) against the
// current `identification` state. Single source of truth for visibility matching — mirrored
// from FmBoxes303.jsx's own `matchesSvw` (ETP-5187: extracted here so the required-field
// validation gate in FmModel303Page.jsx reads the exact same visibility rules the
// asterisk/section rendering already uses, instead of forking a second implementation).
// FmBoxes303.jsx re-exports its local `matchesSvw` as a thin wrapper around this function —
// do not re-implement visibility matching anywhere else.
// `allOf` was added for ETP-5393 Bug E (bank_iban is only required while a rectificativa
// ALSO carries a non-zero box 111) — see `isFieldRequired` below.
export function matchesVisibility(svw, identification) {
  if (Array.isArray(svw.anyOf)) return svw.anyOf.some(c => matchesVisibility(c, identification));
  if (Array.isArray(svw.allOf)) return svw.allOf.every(c => matchesVisibility(c, identification));
  const val = identification?.[svw.field];
  return svw.in ? svw.in.includes(val) : val === svw.equals;
}

// Section-level gate for getMissingRequiredFields below — split out purely to keep that
// function's cognitive complexity down (javascript:S3776); no behavior change.
function isSectionVisible(section, identification) {
  return !section.sectionVisibleWhen || matchesVisibility(section.sectionVisibleWhen, identification);
}

// Resolves whether a field is CURRENTLY required. Most fields use the static `required: true`
// flag (always required whenever the field/section is visible). ETP-5393 Bug E introduced
// `requiredWhen` for fields whose requiredness itself depends on OTHER state — e.g. `bank_iban`
// is required unconditionally for tipo U/D/X (AEAT error EDID065), but for a rectificativa filed
// under any other tipo it is only required when box 111 (Rectificación - Importe) is non-zero
// (AEAT303Report's checkBox111MandatoryParams). Callers must merge a `_box111NonZero` boolean
// into `identification` before calling this — see `withBox111NonZeroFlag` in
// fiscalModelsUtils.js — since box values live outside the identification/checkbox state this
// function otherwise reads. Shared by both `isRequiredFieldMissing` below and FmBoxes303.jsx's
// red-asterisk rendering, so both stay in sync automatically.
export function isFieldRequired(f, identification) {
  if (f.requiredWhen) return matchesVisibility(f.requiredWhen, identification);
  return Boolean(f.required);
}

// Field-level gate for getMissingRequiredFields below — same reasoning as isSectionVisible.
function isRequiredFieldMissing(f, identification) {
  if (!isFieldRequired(f, identification)) return false;
  if (f.visibleWhen && !matchesVisibility(f.visibleWhen, identification)) return false;
  const val = identification?.[f.id];
  return val === undefined || val === null || val === '';
}

/**
 * Returns the currently-visible `identificacion`-family fields (across `identificacion` and
 * `datos_bancarios`/meta sections) currently required (see `isFieldRequired`) in the resolved
 * layout whose value is empty in `identification` — e.g. `tipo_declaracion` (always visible) and
 * `bank_iban` (required for tipo U/D/X, or for a rectificativa whose box 111 is non-zero — see
 * `isFieldRequired`'s doc comment).
 *
 * ETP-5187: drives the "Generar fichero"/"Marcar como Presentado" pre-flight validation gate in
 * FmModel303Page.jsx. Reads the SAME requiredness FmBoxes303 already uses for the red asterisk
 * (`isFieldRequired(f, identification) && <span className="fm-aeat-required-mark">`), so a third
 * field marked `required`/`requiredWhen` in a future year's patch is automatically covered — no
 * gate-side change needed. A field/section gated by its own `visibleWhen`/`sectionVisibleWhen`
 * only counts as "required right now" when that condition currently matches; a hidden required
 * field is never reported. `identification` must already carry `_box111NonZero` when the layout
 * has any `requiredWhen` referencing it (see `withBox111NonZeroFlag`).
 */
export function getMissingRequiredFields(year, period, identification) {
  const layout = getLayout303(year, period);
  const missing = [];
  for (const section of layout.sections) {
    if (!Array.isArray(section.fields)) continue;
    if (!isSectionVisible(section, identification)) continue;
    for (const f of section.fields) {
      if (isRequiredFieldMissing(f, identification)) missing.push(f);
    }
  }
  return missing;
}

export function getLayout303(year, period) {
  const ops =
    PATCHES[`${year}_${period}`] ??
    PATCHES[String(year)] ??
    null;

  const sections = ops
    ? applyPatch(ops).sections
    : BASE.sectionOrder.map(id => ({ id, ...BASE.sections[id] })).filter(s => s.titleKey || s.titleKeyMap);

  // Box 44 (prorrata definitiva) and the two last-period-only sections (tributacion_territorial,
  // info_adicional_ultimo_periodo — ETP-5391) are only applicable in the last period of the
  // fiscal year (T4 quarterly / 12 monthly).
  const isLastPeriod = isLastPeriodOfYear(period);
  const filteredSections = sections
    .filter(sec => isLastPeriod || !LAST_PERIOD_ONLY_SECTIONS.has(sec.id))
    .map(sec => {
      if (isLastPeriod || sec.id !== 'iva_deducible' || !sec.rows) return sec;
      return { ...sec, rows: sec.rows.filter(r => r.id !== 'prorrata_definitiva') };
    });

  return { sections: filteredSections };
}
