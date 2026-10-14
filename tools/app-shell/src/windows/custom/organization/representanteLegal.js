// Pure helpers for the "Representante legal / Modelo 390" section (ETP-5716).
//
// Kept apart from the hook and the component so the ordering, payload and validation rules can
// be read (and tested) without React. Field limits mirror the AD columns of
// `OREP_Representative_Info` (see artifacts/organization/contract.json, `representanteLegal`)
// and the `AD_OrgInfo.EM_AEAT390_*` columns.

import { parseCalendarDate } from '@/lib/dateOnly.js';
import { getTaxIdError } from '@/lib/taxIdValidation.js';

/** The Modelo 390 reads the first N representatives ordered by line. */
export const MODELO_390_REPRESENTATIVE_LIMIT = 3;

/** Editable representative fields, in form order. */
export const REPRESENTATIVE_FIELDS = ['taxID', 'firstName', 'lastname1', 'lastname2', 'powerDate', 'notaryName'];

/** Required by the AD (`OREP_Representative_Info` mandatory flags). `lastname2` is optional. */
export const REPRESENTATIVE_REQUIRED_FIELDS = ['taxID', 'firstName', 'lastname1', 'powerDate', 'notaryName'];

/** AD column lengths. `powerDate` is a date and has none. */
export const REPRESENTATIVE_MAX_LENGTH = {
  taxID: 20,
  firstName: 60,
  lastname1: 60,
  lastname2: 60,
  notaryName: 60,
};

/** AD column lengths of the `information` (AD_OrgInfo) Modelo 390 identity fields. */
export const AEAT390_INFO_MAX_LENGTH = {
  aeat390Firstname: 60,
  aeat390Surname1: 60,
  aeat390Surname2: 60,
  aeat390RepNif: 20,
  aeat390RepName: 60,
};

export const EMPTY_REPRESENTATIVE = {
  taxID: '',
  firstName: '',
  lastname1: '',
  lastname2: '',
  powerDate: '',
  notaryName: '',
};

/** Etendo booleans arrive as `true` or `'Y'` depending on the path. */
export function isEtendoTrue(value) {
  return value === true || value === 'Y';
}

/**
 * Rows ordered by `lineNo` ascending — the order the Modelo 390 reads them in. The list request
 * already asks the server for it (`_sortBy=lineNo`), this keeps the UI right regardless. A row
 * without a line sorts last; ties keep their server order (Array#sort is stable).
 */
export function sortByLineNo(rows) {
  if (!Array.isArray(rows)) return [];
  const line = (r) => {
    const n = Number(r?.lineNo);
    return Number.isFinite(n) && r?.lineNo !== null && r?.lineNo !== '' ? n : Number.POSITIVE_INFINITY;
  };
  return [...rows].sort((a, b) => line(a) - line(b));
}

/**
 * A date-only value as `yyyy-MM-dd`, built from LOCAL calendar getters so the day never shifts
 * with the host timezone (see CLAUDE.md "Date-Only Parsing & Formatting"). Accepts the server
 * value (`2026-01-15` or `2026-01-15T00:00:00…`) or what DateField emits. Empty → `''`.
 */
export function toCalendarISO(raw) {
  const date = parseCalendarDate(raw);
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Form state for editing an existing row. */
export function representativeToForm(row) {
  return {
    taxID: row?.taxID ?? '',
    firstName: row?.firstName ?? '',
    lastname1: row?.lastname1 ?? '',
    lastname2: row?.lastname2 ?? '',
    powerDate: toCalendarISO(row?.powerDate),
    notaryName: row?.notaryName ?? '',
  };
}

/**
 * The create/update body. `lineNo` is deliberately never sent: on create the server assigns
 * `MAX(line)+10` (AD default resolved by NEO), and the UI does not edit it.
 */
export function buildRepresentativePayload(form) {
  const trimmed = (v) => String(v ?? '').trim();
  return {
    taxID: trimmed(form.taxID),
    firstName: trimmed(form.firstName),
    lastname1: trimmed(form.lastname1),
    lastname2: trimmed(form.lastname2) || null,
    powerDate: toCalendarISO(form.powerDate) || null,
    notaryName: trimmed(form.notaryName),
  };
}

/**
 * Inline errors for a representative form: `{ [field]: { key, params? } }`, empty when valid.
 * Required first, then length, then the NIF format (the same validator the Organización NIF
 * uses — `taxIdValidation.js`, the mirror of the server's `SpanishTaxIdValidator`).
 */
export function getRepresentativeErrors(form) {
  const errors = {};
  for (const field of REPRESENTATIVE_FIELDS) {
    const value = String(form?.[field] ?? '').trim();
    if (REPRESENTATIVE_REQUIRED_FIELDS.includes(field) && value === '') {
      errors[field] = { key: 'fieldRequired' };
      continue;
    }
    const max = REPRESENTATIVE_MAX_LENGTH[field];
    if (max && value.length > max) {
      errors[field] = { key: 'fieldMaxLengthError', params: { maxLength: max } };
    }
  }
  if (!errors.taxID) {
    const taxIdKey = getTaxIdError(form?.taxID);
    if (taxIdKey) errors.taxID = { key: taxIdKey };
  }
  return errors;
}

/** The full name shown in the grid ("Nombre Apellido1 Apellido2"). */
export function representativeFullName(row) {
  return [row?.firstName, row?.lastname1, row?.lastname2]
    .map(v => String(v ?? '').trim())
    .filter(Boolean)
    .join(' ');
}
