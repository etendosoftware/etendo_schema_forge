// Vitest tests for two ETP-5187 additions to fm303Layouts.js — the required-field
// pre-flight validation gate used by FmModel303Page.jsx's handleGenerate/handlePresent:
//   - matchesVisibility — single source of truth for visibility matching (equals/in/anyOf),
//     also used internally by FmBoxes303's own `matchesSvw` closure (covered indirectly,
//     via a duplicated mock, in FmBoxes303.matchesSvw.vitest.jsx — this file covers the
//     real exported function directly instead).
//   - getMissingRequiredFields — walks the resolved layout for the currently-visible
//     required identification fields that are still blank.

import { getMissingRequiredFields, matchesVisibility } from '../fm303Layouts.js';

// ── matchesVisibility ─────────────────────────────────────────────────────────

describe('matchesVisibility', () => {
  describe('equals condition', () => {
    it('matches when the field equals the expected value', () => {
      expect(matchesVisibility({ field: 'concurso', equals: true }, { concurso: true })).toBe(true);
    });

    it('does not match when the field has a different value', () => {
      expect(matchesVisibility({ field: 'concurso', equals: true }, { concurso: false })).toBe(false);
    });

    it('does not match when the field is absent from identification', () => {
      expect(matchesVisibility({ field: 'concurso', equals: true }, {})).toBe(false);
    });
  });

  describe('in condition', () => {
    it('matches when the field value is in the list', () => {
      expect(matchesVisibility({ field: 'tipo_declaracion', in: ['D', 'X'] }, { tipo_declaracion: 'D' })).toBe(true);
    });

    it('does not match when the field value is not in the list', () => {
      expect(matchesVisibility({ field: 'tipo_declaracion', in: ['D', 'X'] }, { tipo_declaracion: 'I' })).toBe(false);
    });
  });

  describe('anyOf condition (OR-of-conditions)', () => {
    const svw = { anyOf: [
      { field: 'tipo_declaracion', in: ['U', 'D', 'X'] },
      { field: 'rectificativa', equals: true },
    ] };

    it('matches when the first branch matches', () => {
      expect(matchesVisibility(svw, { tipo_declaracion: 'D' })).toBe(true);
    });

    it('matches when the second branch matches (and the first does not)', () => {
      expect(matchesVisibility(svw, { tipo_declaracion: 'I', rectificativa: true })).toBe(true);
    });

    it('does not match when neither branch matches', () => {
      expect(matchesVisibility(svw, { tipo_declaracion: 'I', rectificativa: false })).toBe(false);
    });

    it('does not match against an empty identification object', () => {
      expect(matchesVisibility(svw, {})).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('treats a null/undefined identification as "no fields set" (equals branch)', () => {
      expect(matchesVisibility({ field: 'concurso', equals: true }, null)).toBe(false);
      expect(matchesVisibility({ field: 'concurso', equals: true }, undefined)).toBe(false);
    });

    it('treats a null/undefined identification as "no fields set" (in branch)', () => {
      expect(matchesVisibility({ field: 'tipo_declaracion', in: ['D'] }, null)).toBe(false);
    });
  });
});

// ── getMissingRequiredFields ────────────────────────────────────────────────
// Uses year 2026 / period 'T2' throughout — the current BASE layout (no year
// patch applies), whose `required`/`requiredWhen` fields are `tipo_declaracion`
// (always visible, identificacion section), the bank block (datos_bancarios
// section), and `fecha_concurso` (identificacion section, visible only when
// `concurso` is checked — ETP-5272 pt.7, see the dedicated describe block
// below).
//
// ETP-5393 follow-up (manual-QA fix): the bank block's requiredness is now
// split in two scopes, NOT uniform across all 7 fields:
//   - bank_iban: required for tipo U/D/X ALONE (condition A, AEAT EDID065 —
//     a plain devolución/domiciliación), OR for any tipo when rectificativa
//     is checked AND box 111 is non-zero (condition B).
//   - the other 6 (bank_swift_bic, bank_nombre, bank_direccion, bank_ciudad,
//     bank_pais, bank_sepa): required ONLY under condition B — a plain tipo
//     U/D/X devolución does NOT require the full block, only IBAN.
// An earlier version of this fix (superseded here) required the full block
// under condition A too; manual QA confirmed that was wrong.

const OTHER_BANK_FIELD_IDS = [
  'bank_swift_bic', 'bank_nombre', 'bank_direccion', 'bank_ciudad', 'bank_pais', 'bank_sepa',
];
const ALL_BANK_FIELD_IDS = ['bank_iban', ...OTHER_BANK_FIELD_IDS];

describe('getMissingRequiredFields', () => {
  it('reports nothing when every currently-required field is filled', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'I' });
    expect(missing).toEqual([]);
  });

  it('reports tipo_declaracion when it is blank', () => {
    const missing = getMissingRequiredFields(2026, 'T2', {});
    expect(missing.map(f => f.id)).toEqual(['tipo_declaracion']);
  });

  it('reports ONLY bank_iban (not the full block) for a plain devolución (tipo D, condition A alone) — manual-QA fix', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'D' });
    expect(missing.map(f => f.id)).toEqual(['bank_iban']);
  });

  // ETP-5393 Bug E — bank_iban's requiredWhen now ALSO needs box 111 (Rectificación - Importe)
  // to be non-zero when the only visibility path is 'rectificativa checked' (tipo not in
  // U/D/X). The synthetic `_box111NonZero` flag is what a real caller merges in via
  // `withBox111NonZeroFlag` (fiscalModelsUtils.js) — see fm303Layouts.bankIbanRequiredWhen.vitest.js
  // for the dedicated coverage of that flag/requiredWhen shape. Here we just set it directly to
  // keep these pre-existing scenarios intact. ETP-5393 follow-up — the same box-111 path now
  // makes ALL 7 bank fields required, not just bank_iban.
  it('reports the FULL bank block when rectificativa is checked AND box 111 is non-zero, even for a tipo not in U/D/X', () => {
    const missing = getMissingRequiredFields(2026, 'T2', {
      tipo_declaracion: 'I', rectificativa: true, _box111NonZero: true,
    });
    expect(missing.map(f => f.id).sort()).toEqual([...ALL_BANK_FIELD_IDS].sort());
  });

  it('does NOT report any bank field when rectificativa is checked but box 111 is zero (ETP-5393 Bug E)', () => {
    const missing = getMissingRequiredFields(2026, 'T2', {
      tipo_declaracion: 'I', rectificativa: true, _box111NonZero: false,
    });
    const missingIds = missing.map(f => f.id);
    ALL_BANK_FIELD_IDS.forEach(id => expect(missingIds).not.toContain(id));
  });

  it('does NOT report any bank field when the bank section is not visible at all', () => {
    // tipo_declaracion 'I' (Ingreso) is not U/D/X, and rectificativa is unset/false.
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'I', rectificativa: false });
    const missingIds = missing.map(f => f.id);
    ALL_BANK_FIELD_IDS.forEach(id => expect(missingIds).not.toContain(id));
  });

  it('reports multiple missing fields together (tipo_declaracion AND the full bank block)', () => {
    // rectificativa=true makes datos_bancarios visible without needing tipo_declaracion
    // set, so both required fields can be simultaneously blank — box 111 non-zero is what
    // makes the bank block required via the rectificativa path (ETP-5393 Bug E + follow-up).
    const missing = getMissingRequiredFields(2026, 'T2', { rectificativa: true, _box111NonZero: true });
    expect(missing.map(f => f.id).sort()).toEqual([...ALL_BANK_FIELD_IDS, 'tipo_declaracion'].sort());
  });

  it('does not report bank_iban as filled by whitespace/empty-string values', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'D', bank_iban: '' });
    expect(missing.map(f => f.id)).toContain('bank_iban');
  });

  it('treats a filled bank block as satisfying the requirement (ETP-5393 follow-up — all 7 fields, not just IBAN)', () => {
    const filledBankFields = Object.fromEntries(ALL_BANK_FIELD_IDS.map(id => [id, `${id}-value`]));
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'D', ...filledBankFields });
    expect(missing).toEqual([]);
  });

  it('handles a completely missing identification object without throwing', () => {
    const missing = getMissingRequiredFields(2026, 'T2', undefined);
    expect(missing.map(f => f.id)).toEqual(['tipo_declaracion']);
  });
});

// ── getMissingRequiredFields — fecha_concurso (ETP-5272 pt.7) ────────────────
// `fecha_concurso` became `required: true` (still gated by
// `visibleWhen: { field: 'concurso', equals: true }`) so a blank bankruptcy
// date can never reach `applyIdentParams`'s ConcursoDate formatting — AEAT
// throws @AEAT303_Bad_Bankruptcy_Statement_Date_Format@ server-side otherwise.
describe('getMissingRequiredFields — fecha_concurso (ETP-5272 pt.7)', () => {
  it('reports fecha_concurso as missing when concurso is checked and the date is blank', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'I', concurso: true });
    expect(missing.map(f => f.id)).toContain('fecha_concurso');
  });

  it('does not report fecha_concurso when concurso is unchecked, even with no date set', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'I', concurso: false });
    expect(missing.map(f => f.id)).not.toContain('fecha_concurso');
  });

  it('does not report fecha_concurso when concurso is simply absent (undefined)', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'I' });
    expect(missing.map(f => f.id)).not.toContain('fecha_concurso');
  });

  it('treats a filled fecha_concurso as satisfying the requirement', () => {
    const missing = getMissingRequiredFields(2026, 'T2', {
      tipo_declaracion: 'I', concurso: true, fecha_concurso: '2026-03-05',
    });
    expect(missing.map(f => f.id)).not.toContain('fecha_concurso');
  });

  it('does not treat an empty-string fecha_concurso as filled', () => {
    const missing = getMissingRequiredFields(2026, 'T2', {
      tipo_declaracion: 'I', concurso: true, fecha_concurso: '',
    });
    expect(missing.map(f => f.id)).toContain('fecha_concurso');
  });

  it('reports both concurso and bank_iban together when both branches are visible and blank (tipo D, condition A alone)', () => {
    const missing = getMissingRequiredFields(2026, 'T2', {
      tipo_declaracion: 'D', concurso: true,
    });
    // Manual-QA fix — tipo D alone (condition A) requires only bank_iban, not the full block.
    expect(missing.map(f => f.id).sort()).toEqual(['bank_iban', 'fecha_concurso'].sort());
  });

  // A pre-2025 patched year (_2024_IDENTIFICACION_FIELDS) carries the exact
  // same `required: true` + `visibleWhen` pairing on fecha_concurso as BASE —
  // this must hold consistently across the year-patch chain, not just 2026.
  it('applies the same fecha_concurso requirement on a pre-2025 patched year (2022)', () => {
    const missingBlank = getMissingRequiredFields(2022, 'T2', { tipo_declaracion: 'I', concurso: true });
    expect(missingBlank.map(f => f.id)).toContain('fecha_concurso');

    const missingFilled = getMissingRequiredFields(2022, 'T2', {
      tipo_declaracion: 'I', concurso: true, fecha_concurso: '2022-06-01',
    });
    expect(missingFilled.map(f => f.id)).not.toContain('fecha_concurso');
  });
});
