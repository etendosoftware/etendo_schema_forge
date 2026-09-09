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
// patch applies), whose only `required: true` fields are `tipo_declaracion`
// (always visible, identificacion section) and `bank_iban` (datos_bancarios
// section, visible only for tipo U/D/X or rectificativa checked — see BASE's
// own comment in fm303Layouts.js).

describe('getMissingRequiredFields', () => {
  it('reports nothing when every currently-required field is filled', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'I' });
    expect(missing).toEqual([]);
  });

  it('reports tipo_declaracion when it is blank', () => {
    const missing = getMissingRequiredFields(2026, 'T2', {});
    expect(missing.map(f => f.id)).toEqual(['tipo_declaracion']);
  });

  it('reports bank_iban when the bank section is visible (tipo D) and it is blank', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'D' });
    expect(missing.map(f => f.id)).toEqual(['bank_iban']);
  });

  it('reports bank_iban when rectificativa is checked, even for a tipo not in U/D/X', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'I', rectificativa: true });
    expect(missing.map(f => f.id)).toEqual(['bank_iban']);
  });

  it('does NOT report bank_iban when the bank section is not visible at all', () => {
    // tipo_declaracion 'I' (Ingreso) is not U/D/X, and rectificativa is unset/false.
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'I', rectificativa: false });
    expect(missing.map(f => f.id)).not.toContain('bank_iban');
  });

  it('reports multiple missing fields together (tipo_declaracion AND bank_iban)', () => {
    // rectificativa=true makes datos_bancarios visible without needing tipo_declaracion
    // set, so both required fields can be simultaneously blank.
    const missing = getMissingRequiredFields(2026, 'T2', { rectificativa: true });
    expect(missing.map(f => f.id).sort()).toEqual(['bank_iban', 'tipo_declaracion']);
  });

  it('does not report bank_iban as filled by whitespace/empty-string values', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'D', bank_iban: '' });
    expect(missing.map(f => f.id)).toEqual(['bank_iban']);
  });

  it('treats a filled bank_iban as satisfying the requirement', () => {
    const missing = getMissingRequiredFields(2026, 'T2', { tipo_declaracion: 'D', bank_iban: 'ES1234567890123456789012' });
    expect(missing).toEqual([]);
  });

  it('handles a completely missing identification object without throwing', () => {
    const missing = getMissingRequiredFields(2026, 'T2', undefined);
    expect(missing.map(f => f.id)).toEqual(['tipo_declaracion']);
  });
});
