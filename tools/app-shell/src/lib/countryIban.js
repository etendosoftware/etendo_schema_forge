import { isValidIban, normalizeIban } from './validateIban.js';

/**
 * Country-aware IBAN validation (ETP-4896), layered on top of the existing mod-97
 * `isValidIban()`. `country` objects here are entries of the `countryIbanRules` catalog served by
 * `financial-account/account/defaults` — `{ id, iso, name, ibanPrefix, ibanLength }` — NOT the
 * generic `C_Country_ID` selector rows (which only carry `{id, label}`). Only the countries with
 * IBAN metadata (~45 of 243) carry `ibanPrefix`/`ibanLength`; for every other country these two
 * extra checks are skipped, not failed, so the plain mod-97 result is the final word.
 */

/** The country's expected IBAN prefix (`ibanPrefix`), upper-cased. `null` when unknown. */
export function ibanPrefixFor(country) {
  const prefix = country?.ibanPrefix ?? country?.iso ?? '';
  return prefix ? String(prefix).toUpperCase() : null;
}

/** The country's expected total IBAN length (`ibanLength`). `null` when unknown/not a number. */
export function expectedIbanLength(country) {
  const length = Number(country?.ibanLength);
  return Number.isFinite(length) && length > 0 ? length : null;
}

/**
 * Validates `iban` against `country`, on top of the existing mod-97 check.
 *
 * @returns {{ ok: boolean, code: 'invalid'|'countryMismatch'|'lengthMismatch'|null }}
 *   `ok` is true when the IBAN is empty (still optional), passes with no country selected yet
 *   (nothing to cross-check), or passes every applicable check. `code` is null when `ok`.
 */
export function validateIbanForCountry(iban, country) {
  const normalized = normalizeIban(iban);
  if (normalized === '') {
    return { ok: true, code: null };
  }
  if (!isValidIban(normalized)) {
    return { ok: false, code: 'invalid' };
  }
  if (!country) {
    return { ok: true, code: null };
  }
  // Raw `ibanPrefix`, NOT `ibanPrefixFor()`'s iso-fallback: a country with zero IBAN metadata
  // (the ~198 majority) must skip this check entirely, not have one synthesized from its ISO
  // code — `ibanPrefixFor`'s fallback exists for other, non-validating consumers of this catalog.
  const prefix = country?.ibanPrefix ? ibanPrefixFor(country) : null;
  if (prefix && normalized.slice(0, 2) !== prefix) {
    return { ok: false, code: 'countryMismatch' };
  }
  const expectedLength = expectedIbanLength(country);
  if (expectedLength && normalized.length !== expectedLength) {
    return { ok: false, code: 'lengthMismatch' };
  }
  return { ok: true, code: null };
}
