// ETP-5393 Bug E — bank_iban used to be `required: true` unconditionally inside the
// `datos_bancarios` section, which made it mandatory even for a rectificativa whose box 111
// (Rectificación - Importe) is 0 — a case AEAT303Report's checkBox111MandatoryParams does NOT
// require bank data for. `bank_iban` now carries a `requiredWhen` condition (fm303Layouts.js):
// required unconditionally for tipo U/D/X (AEAT error EDID065, condition A — a plain
// devolución/domiciliación), OR for ANY tipo when `rectificativa` is checked AND box 111 is
// non-zero (condition B). The synthetic `_box111NonZero` flag callers must merge into
// `identification` comes from `withBox111NonZeroFlag` (fiscalModelsUtils.js).
//
// ETP-5393 follow-up (manual-QA fix) — an earlier version of this fix applied the SAME
// requiredWhen (condition A OR B) to all 7 bank fields, on the theory that AEAT303Report
// requires the full bank block under the same condition as IBAN. Manual QA caught that this is
// wrong: for a plain devolución (condition A, tipo U/D/X with no rectificativa), AEAT error
// EDID065 requires ONLY the IBAN — not the full block. The full block (BANK/SWIFT/SEPA/ADDRESS/
// CITY/COUNTRY) is only mandatory under condition B (rectificativa + non-zero box 111), per
// AEAT303Report's checkIsDeclarationRMandatoryParams. So the other 6 fields (bank_swift_bic,
// bank_nombre, bank_direccion, bank_ciudad, bank_pais, bank_sepa) now carry
// `_BANK_FULL_BLOCK_REQUIRED_WHEN` — condition B ONLY — while bank_iban keeps the wider
// `_BANK_IBAN_REQUIRED_WHEN` (A OR B). This file exercises both scopes separately, plus the
// field-level visibility asymmetry: bank_iban has no `visibleWhen` of its own (only the section
// gate), while the other 6 are also gated by `_BANK_DVX_VW` (visible for tipo D/V/X or
// rectificativa checked — NOT tipo U). So for tipo U, only bank_iban is visible/required; the
// other 6 stay hidden and are correctly never reported as missing.
import { describe, it, expect } from 'vitest';
import { getMissingRequiredFields, isFieldRequired, matchesVisibility } from '../fm303Layouts.js';
import { withBox111NonZeroFlag } from '../../../fiscalModelsUtils.js';

const OTHER_BANK_FIELD_IDS = [
  'bank_swift_bic', 'bank_nombre', 'bank_direccion', 'bank_ciudad', 'bank_pais', 'bank_sepa',
];
const ALL_BANK_FIELD_IDS = ['bank_iban', ...OTHER_BANK_FIELD_IDS];
// Every field except bank_iban is additionally gated by _BANK_DVX_VW (tipo D/V/X or
// rectificativa checked) — bank_iban has no visibleWhen and follows only the section gate
// (tipo U/D/X or rectificativa checked), so it alone stays visible for tipo U.
const DVX_GATED_FIELD_IDS = OTHER_BANK_FIELD_IDS;

function findField(missing, id) {
  return missing.find((f) => f.id === id);
}

describe('bank_iban — required under condition A (tipo U/D/X alone) OR condition B (rectificativa + non-zero box 111)', () => {
  it('is required for tipo D (Devolución) regardless of rectificativa/box 111 — condition A alone', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'D', rectificativa: false }, [{ num: 111, value: 0 }],
    );
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, 'bank_iban')).toBeDefined();
  });

  it('is required for tipo U (Domiciliación) even with rectificativa unchecked and box 111 empty', () => {
    const identification = withBox111NonZeroFlag({ tipo_declaracion: 'U' }, null);
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, 'bank_iban')).toBeDefined();
  });

  it('is NOT required for tipo I with rectificativa checked but box 111 == 0', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'I', rectificativa: true }, [{ num: 111, value: 0 }],
    );
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, 'bank_iban')).toBeUndefined();
  });

  it('IS required for tipo I with rectificativa checked AND box 111 non-zero — condition B', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'I', rectificativa: true }, [{ num: 111, value: 500 }],
    );
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, 'bank_iban')).toBeDefined();
  });

  it('is NOT required for tipo I with rectificativa unchecked (section itself hidden)', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'I', rectificativa: false }, [{ num: 111, value: 500 }],
    );
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, 'bank_iban')).toBeUndefined();
  });

  it('is not reported as missing once it has a value', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'I', rectificativa: true, bank_iban: 'ES00 0000 0000 0000 0000 0000' },
      [{ num: 111, value: 500 }],
    );
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, 'bank_iban')).toBeUndefined();
  });
});

describe.each(OTHER_BANK_FIELD_IDS)('fm303Layouts — %s requiredWhen (ETP-5393 follow-up, condition B ONLY)', (fieldId) => {
  it('is NOT required for a plain devolución (tipo D, condition A alone) — manual-QA fix', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'D', rectificativa: false }, [{ num: 111, value: 0 }],
    );
    // The section (and this field, via _BANK_DVX_VW) is visible for tipo D, but it must NOT be
    // required — only bank_iban is required under condition A alone.
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, fieldId)).toBeUndefined();
  });

  it('is NOT required for tipo I with rectificativa checked but box 111 == 0', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'I', rectificativa: true }, [{ num: 111, value: 0 }],
    );
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, fieldId)).toBeUndefined();
  });

  it('IS required for tipo I with rectificativa checked AND box 111 non-zero — condition B', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'I', rectificativa: true }, [{ num: 111, value: 500 }],
    );
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, fieldId)).toBeDefined();
  });

  it('is NOT required for tipo I with rectificativa unchecked (section itself hidden)', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'I', rectificativa: false }, [{ num: 111, value: 500 }],
    );
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, fieldId)).toBeUndefined();
  });

  it('is not reported as missing once it has a value', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'I', rectificativa: true, [fieldId]: 'some-value' },
      [{ num: 111, value: 500 }],
    );
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, fieldId)).toBeUndefined();
  });
});

describe.each(DVX_GATED_FIELD_IDS)('%s stays hidden (and thus not missing) for tipo U', (fieldId) => {
  it('is NOT reported as missing for tipo U (field-level visibleWhen excludes it)', () => {
    const identification = withBox111NonZeroFlag({ tipo_declaracion: 'U' }, null);
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, fieldId)).toBeUndefined();
  });
});

describe('withBox111NonZeroFlag', () => {
  it('treats a missing box 111 as zero (not required via the rectificativa path)', () => {
    const identification = withBox111NonZeroFlag({ tipo_declaracion: 'I', rectificativa: true }, null);
    expect(identification._box111NonZero).toBe(false);
  });
});

describe('matchesVisibility — allOf support (added for this requiredWhen)', () => {
  it('matches only when every condition in allOf is true', () => {
    const cond = { allOf: [{ field: 'a', equals: true }, { field: 'b', equals: true }] };
    expect(matchesVisibility(cond, { a: true, b: true })).toBe(true);
    expect(matchesVisibility(cond, { a: true, b: false })).toBe(false);
    expect(matchesVisibility(cond, {})).toBe(false);
  });
});

describe('isFieldRequired', () => {
  it('falls back to the static `required` flag when there is no requiredWhen', () => {
    expect(isFieldRequired({ required: true }, {})).toBe(true);
    expect(isFieldRequired({ required: false }, {})).toBe(false);
    expect(isFieldRequired({}, {})).toBe(false);
  });
});
