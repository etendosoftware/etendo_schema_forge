// Pure helpers for the "Representante legal / Modelo 390" section (ETP-5716).
//
// Kept apart from the hook and the component so the ordering, payload and validation rules can
// be read (and tested) without React. Field limits mirror the AD columns of
// `OREP_Representative_Info` (see artifacts/organization/contract.json, `representanteLegal`)
// and the `AD_OrgInfo.EM_AEAT390_*` columns.

import { parseCalendarDate } from '@/lib/dateOnly.js';
import { getTaxIdError, normalizeTaxId } from '@/lib/taxIdValidation.js';

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
    // Stored normalized (`normalizeTaxId`, the same normalization the validator judges): the
    // classic 390 generator uppercases, keeps only [A-Za-z0-9. ] and truncates to 9 characters, so
    // a raw "12.345.678-Z" that passes validation would reach the file as "12.345.67".
    taxID: normalizeTaxId(form.taxID),
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

/**
 * A legal representative row is active unless the server says otherwise (`active` false / 'N').
 * GO never deactivates a row (the field is system, default 'Y'), but a row deactivated in Classic
 * still comes back in the list.
 */
export function isActiveRepresentative(row) {
  return row?.active !== false && row?.active !== 'N';
}

/** The active rows, in the order given. */
export function activeRepresentatives(rows) {
  return (Array.isArray(rows) ? rows : []).filter(isActiveRepresentative);
}

/**
 * Whether a legal entity satisfies AEAT PAR012: among the representatives the Modelo 390 reads
 * (the first {@link MODELO_390_REPRESENTATIVE_LIMIT} active rows, `rows` already ordered by line)
 * at least one carries a NIF. Mirrors `Fiscal390IncidentRules.NO_LEGAL_REPRESENTATIVE`, which
 * blocks generating and submitting the 390 when this is `false`.
 */
export function hasDeclarableRepresentative(rows) {
  return activeRepresentatives(rows)
    .slice(0, MODELO_390_REPRESENTATIVE_LIMIT)
    .some(r => String(r?.taxID ?? '').trim() !== '');
}

/** `null` for a blank value (never `''`), the trimmed text otherwise. */
export function blankToNull(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

/** i18n key of the "both or neither" rule for the natural-person representative NIF / name. */
export const AEAT390_REP_PAIR_ERROR_KEY = 'org390RepPairRequired';

/**
 * Inline errors of the Modelo 390 natural-person identity (`{ [field]: i18nKey }`, empty when
 * valid). Only checked while "Persona física" is on — the fields are hidden otherwise, and an
 * error on a field the user cannot see would be unfixable. Mirrors the two classic DB checks of
 * `AD_OrgInfo` (module org.openbravo.module.aeat390.es), so the save never reaches them:
 *   EM_AEAT390_ISPERSON_MAND_CH  a natural person needs Nombre and Primer apellido;
 *   EM_AEAT390_REPR_FIS_CH       the representative NIF and name are both empty or both filled.
 * Plus the NIF format (same validator as the organization NIF) on a non-empty representative NIF.
 */
export function getAeat390IdentityErrors(form) {
  const errors = {};
  if (!form?.aeat390Isperson) return errors;
  if (blankToNull(form.aeat390Firstname) == null) errors.aeat390Firstname = 'fieldRequired';
  if (blankToNull(form.aeat390Surname1) == null) errors.aeat390Surname1 = 'fieldRequired';
  const hasNif = blankToNull(form.aeat390RepNif) != null;
  const hasName = blankToNull(form.aeat390RepName) != null;
  if (hasNif && !hasName) errors.aeat390RepName = AEAT390_REP_PAIR_ERROR_KEY;
  if (hasName && !hasNif) errors.aeat390RepNif = AEAT390_REP_PAIR_ERROR_KEY;
  if (hasNif) {
    const formatKey = getTaxIdError(form.aeat390RepNif);
    if (formatKey) errors.aeat390RepNif = formatKey;
  }
  return errors;
}

/**
 * The `information` (AD_OrgInfo) Modelo 390 identity part of the Organization save. Blank values
 * are sent as `null`, never `''` (an empty string would satisfy the classic NOT NULL checks and
 * then write an empty name into the 390 file); the representative NIF is stored normalized.
 */
export function buildAeat390InfoPayload(form) {
  return {
    aeat390Isperson: Boolean(form?.aeat390Isperson),
    aeat390Firstname: blankToNull(form?.aeat390Firstname),
    aeat390Surname1: blankToNull(form?.aeat390Surname1),
    aeat390Surname2: blankToNull(form?.aeat390Surname2),
    aeat390RepNif: blankToNull(normalizeTaxId(form?.aeat390RepNif)),
    aeat390RepName: blankToNull(form?.aeat390RepName),
  };
}
