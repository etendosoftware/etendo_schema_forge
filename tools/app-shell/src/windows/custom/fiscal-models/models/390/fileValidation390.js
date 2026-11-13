// Modelo 390 — the AEAT validator's answer about the file "Generar fichero 390" produces
// (ETP-5716): the outcomes and the normalised shape the page and its notice read. Pure — the
// request lives in fm390Api.js (`generate390File`), the result step in FileGenModal390.jsx.

/** `validation.outcome` of the generated file (backend `FiscalAeatValidationOutcome`). */
export const FILE_VALIDATION = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CONNECTION_FAILURE: 'connection_failure',
  NOT_VALIDATED: 'not_validated',
});

function validationEntries(list) {
  return (Array.isArray(list) ? list : [])
    .map(e => ({ code: String(e?.code ?? ''), message: String(e?.message ?? '') }))
    .filter(e => e.code || e.message);
}

/**
 * The AEAT validator's answer about the generated file, as `{ outcome, errors, warnings }` (each
 * entry `{ code, message }`). Anything that is not a known outcome — a missing block included —
 * reads as "not validated": the page must never present an unchecked file as a validated one.
 */
export function fileValidationOf(raw) {
  const outcome = Object.values(FILE_VALIDATION).includes(raw?.outcome) ? raw.outcome : FILE_VALIDATION.NOT_VALIDATED;
  return { outcome, errors: validationEntries(raw?.errors), warnings: validationEntries(raw?.warnings) };
}
