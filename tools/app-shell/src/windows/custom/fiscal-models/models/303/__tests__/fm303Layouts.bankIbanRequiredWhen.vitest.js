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
import {
  getLayout303, getMissingRequiredFields, isFieldRequired, matchesVisibility,
} from '../fm303Layouts.js';
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

// ── ETP-5431 helpers ──────────────────────────────────────────────────────────
// Within condition B (the "Nota 3 case"), requiredness AND visibility now escalate with the
// marca SEPA: marca 1 asks for IBAN + marca only, marca 2 adds SWIFT-BIC, marca 3 adds the
// Banco/Dirección/Ciudad/País block. A DESIGN DECISION, NOT A CITED AEAT RULE — it mirrors
// AEAT303Report2024#patchBankSection so screen and file demand the same fields.

/** Lowest marca SEPA at which each field becomes required/visible inside the Nota 3 case. */
const MIN_MARCA = {
  bank_sepa: null, // the selector itself — condition B alone, never gated by its own value
  bank_swift_bic: '2',
  bank_nombre: '3',
  bank_direccion: '3',
  bank_ciudad: '3',
  bank_pais: '3',
};
const FOREIGN_DETAIL_IDS = ['bank_nombre', 'bank_direccion', 'bank_ciudad', 'bank_pais'];

/**
 * Identification inside the Nota 3 case: a rectificativa with a non-zero box 111 and the
 * cancel/modify-direct-debit flag NOT marked. `marca` of `undefined` leaves bank_sepa unset.
 */
function identInNota3({ tipo = 'I', marca, extra = {} } = {}) {
  const base = { tipo_declaracion: tipo, rectificativa: true, ...extra };
  if (marca !== undefined) base.bank_sepa = marca;
  return withBox111NonZeroFlag(base, [{ num: 111, value: 500 }]);
}

function isVisible(fieldId, identification) {
  const sec = getLayout303(2026, 'T2').sections.find(s => s.id === 'datos_bancarios');
  const field = sec.fields.find(f => f.id === fieldId);
  return !field.visibleWhen || matchesVisibility(field.visibleWhen, identification);
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

  // ETP-5431 — condition B alone is no longer enough for the five marca-gated fields: the marca
  // SEPA must also call for them. Supplying the lowest marca that does is what makes this the
  // same assertion it always was. (`bank_sepa` itself has MIN_MARCA null — condition B alone.)
  it('IS required for tipo I with rectificativa checked AND box 111 non-zero, at the marca that calls for it — condition B', () => {
    const identification = identInNota3({ marca: MIN_MARCA[fieldId] ?? undefined });
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, fieldId)).toBeDefined();
  });

  it('is NOT required for tipo I with rectificativa unchecked (section itself hidden)', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'I', rectificativa: false, bank_sepa: '3' }, [{ num: 111, value: 500 }],
    );
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, fieldId)).toBeUndefined();
  });

  it('is not reported as missing once it has a value', () => {
    const identification = identInNota3({
      marca: MIN_MARCA[fieldId] ?? undefined, extra: { [fieldId]: 'some-value' },
    });
    const missing = getMissingRequiredFields(2026, 'T2', identification);
    expect(findField(missing, fieldId)).toBeUndefined();
  });

  // ETP-5431 — Nota 3's single stated exception. A taxpayer asking to cancel/modify the
  // existing direct debit must not be made to supply bank data at all.
  it('is NOT required when the cancel/modify-direct-debit flag is marked, even at marca 3', () => {
    const identification = identInNota3({ marca: '3', extra: { baja_domiciliacion: true } });
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

// ── ETP-5431 — marca SEPA escalation INSIDE the Nota 3 case ───────────────────
// The full matrix. Visibility and requiredness move together on purpose: a field the marca
// does not call for is HIDDEN, not merely un-required, because the file must carry those
// positions blank (AEAT303Report2024#patchBankSection blanks them) and a stray value on
// screen would contradict what is sent.

describe('marca SEPA escalation inside the Nota 3 case (tipo I — no tipo gate of its own)', () => {
  const EXPECTED = {
    // marca → { fieldId: calledFor }
    1: { bank_swift_bic: false, bank_nombre: false, bank_direccion: false, bank_ciudad: false, bank_pais: false },
    2: { bank_swift_bic: true, bank_nombre: false, bank_direccion: false, bank_ciudad: false, bank_pais: false },
    3: { bank_swift_bic: true, bank_nombre: true, bank_direccion: true, bank_ciudad: true, bank_pais: true },
  };

  for (const marca of ['1', '2', '3']) {
    for (const [fieldId, calledFor] of Object.entries(EXPECTED[marca])) {
      it(`marca ${marca}: ${fieldId} is ${calledFor ? 'required AND visible' : 'neither required nor visible'}`, () => {
        const identification = identInNota3({ marca });
        const missing = getMissingRequiredFields(2026, 'T2', identification);
        expect(Boolean(findField(missing, fieldId))).toBe(calledFor);
        expect(isVisible(fieldId, identification)).toBe(calledFor);
      });
    }

    it(`marca ${marca}: bank_iban and bank_sepa are always required — position 23 carries a value under every marca`, () => {
      const missing = getMissingRequiredFields(2026, 'T2', identInNota3({ marca }));
      expect(findField(missing, 'bank_iban')).toBeDefined();
      expect(findField(missing, 'bank_sepa')).toBeUndefined(); // it HAS a value (the marca itself)
    });
  }

  // ETP-5431 delta — the marca selector's placeholder (`<option value="">`) is the only empty
  // choice. An untouched field holds '', which must trigger NO escalation at all.
  it('placeholder (empty marca): neither the SWIFT nor the foreign-details escalation fires', () => {
    const identification = identInNota3({ marca: '' });
    for (const fieldId of ['bank_swift_bic', ...FOREIGN_DETAIL_IDS]) {
      expect(isVisible(fieldId, identification)).toBe(false);
      expect(findField(getMissingRequiredFields(2026, 'T2', identification), fieldId)).toBeUndefined();
    }
  });

  it('placeholder (empty marca): bank_sepa itself IS reported missing — condition B requires a marca', () => {
    const missing = getMissingRequiredFields(2026, 'T2', identInNota3({ marca: '' }));
    expect(findField(missing, 'bank_sepa')).toBeDefined();
  });

  // The marca is the only thing that changed between these two states, so this pins that the
  // escalation is driven by the selector and nothing else.
  it('raising the marca from 1 to 3 turns the four foreign-bank fields on', () => {
    const atOne = identInNota3({ marca: '1' });
    const atThree = identInNota3({ marca: '3' });
    for (const fieldId of FOREIGN_DETAIL_IDS) {
      expect(isVisible(fieldId, atOne)).toBe(false);
      expect(isVisible(fieldId, atThree)).toBe(true);
    }
  });
});

// ── ETP-5431 — the scope boundary (option (a)) ────────────────────────────────
// The marca restriction lives INSIDE the Nota 3 branch. Outside it, behaviour is exactly what
// it was before this ticket: AEAT303Report2021#generatePage3 still writes the whole bank block
// for a plain D/V/X refund, so hiding a field there would send a value the user cannot see.

describe('outside the Nota 3 case — plain D/V/X refund is untouched by the marca restriction', () => {
  for (const tipo of ['D', 'V', 'X']) {
    it(`tipo ${tipo} with marca 1 and NO box 111: all six marca-gated fields stay visible`, () => {
      const identification = withBox111NonZeroFlag(
        { tipo_declaracion: tipo, rectificativa: false, bank_sepa: '1' }, [{ num: 111, value: 0 }],
      );
      for (const fieldId of ['bank_swift_bic', ...FOREIGN_DETAIL_IDS, 'bank_sepa']) {
        expect(isVisible(fieldId, identification)).toBe(true);
      }
    });

    it(`tipo ${tipo} with marca 1 and NO box 111: only bank_iban is required (EDID065, condition A)`, () => {
      const identification = withBox111NonZeroFlag(
        { tipo_declaracion: tipo, rectificativa: false, bank_sepa: '1' }, [{ num: 111, value: 0 }],
      );
      const missing = getMissingRequiredFields(2026, 'T2', identification);
      const missingBankIds = missing.filter(f => f.id.startsWith('bank_')).map(f => f.id);
      // Tipo V is not in IBAN_REQUIRED_TIPOS (U/D/X), so it requires nothing here.
      expect(missingBankIds).toEqual(tipo === 'V' ? [] : ['bank_iban']);
    });
  }

  // The regression that protects the scope decision itself: if someone later widens the marca
  // restriction to apply outside Nota 3, this fails.
  it('a plain devolución with NO marca selected still shows every bank field', () => {
    const identification = withBox111NonZeroFlag(
      { tipo_declaracion: 'D', rectificativa: false }, null,
    );
    for (const fieldId of ['bank_swift_bic', ...FOREIGN_DETAIL_IDS, 'bank_sepa']) {
      expect(isVisible(fieldId, identification)).toBe(true);
    }
  });
});

// ── ETP-5431 — Nota 3's exception, and the tipo gate that survives it ─────────

describe('cancel/modify-direct-debit flag (Nota 3 exception)', () => {
  const sectionVisible = (identification) => {
    const sec = getLayout303(2026, 'T2').sections.find(s => s.id === 'datos_bancarios');
    return matchesVisibility(sec.sectionVisibleWhen, identification);
  };

  it('tipo C + rectificativa + box 111 non-zero + flag marked → the whole section disappears', () => {
    expect(sectionVisible(identInNota3({ tipo: 'C', marca: '3', extra: { baja_domiciliacion: true } })))
      .toBe(false);
  });

  it('tipo C + rectificativa + box 111 non-zero + flag NOT marked → the section is shown', () => {
    expect(sectionVisible(identInNota3({ tipo: 'C', marca: '3' }))).toBe(true);
  });

  // The flag removes the obligation DERIVED FROM BOX 111, not tipo D's own need for an account
  // to receive the refund into (the U/D/X gate of AEAT303Report2014, untouched). The backend
  // agrees: with the flag marked it returns early and keeps whatever the type gates wrote.
  it('tipo D + flag marked → the section STAYS visible, and with no marca restriction at all', () => {
    const identification = identInNota3({ tipo: 'D', marca: '1', extra: { baja_domiciliacion: true } });
    expect(sectionVisible(identification)).toBe(true);
    // marca 1 would hide these inside Nota 3 — but the waiver puts this declaration outside it.
    for (const fieldId of ['bank_swift_bic', ...FOREIGN_DETAIL_IDS]) {
      expect(isVisible(fieldId, identification)).toBe(true);
    }
  });

  it('the legacy string "Y" is honoured exactly like the boolean the checkbox writes', () => {
    const asBoolean = identInNota3({ tipo: 'C', marca: '3', extra: { baja_domiciliacion: true } });
    const asLegacyY = identInNota3({ tipo: 'C', marca: '3', extra: { baja_domiciliacion: 'Y' } });
    expect(sectionVisible(asBoolean)).toBe(false);
    expect(sectionVisible(asLegacyY)).toBe(false);
  });

  it('every "unmarked" shape keeps the section visible — a persisted \'N\'/\'\' must not waive it', () => {
    for (const unmarked of [false, undefined, null, '', 'N']) {
      const identification = identInNota3({ tipo: 'C', marca: '3', extra: { baja_domiciliacion: unmarked } });
      expect(sectionVisible(identification)).toBe(true);
    }
  });
});
