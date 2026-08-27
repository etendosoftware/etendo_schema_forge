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
 * `true` when `countryId` names a country that CANNOT carry an IBAN at all — the ~198 of 243
 * countries whose `C_COUNTRY.IBANCOUNTRY`/`IBANNODIGITS` are null (Argentina, the United States, …).
 *
 * The equivalence is exact by construction: the backend's `countryIbanRules` catalog is built with
 * `IBANCODE IS NOT NULL AND IBANLENGTH IS NOT NULL`, and `C_GET_IBAN_DISPLAYED_ACCOUNT` rejects an
 * IBAN whenever either column is null (folded into the same `@20259@` as a prefix/length
 * mismatch). So "absent from the catalog" ⟺ "the trigger will reject this IBAN".
 *
 * This is deliberately NOT folded into {@link validateIbanForCountry}: that function receives an
 * already-resolved catalog ROW and so cannot tell "no country picked yet" from "picked, but not in
 * the catalog" — both arrive as `null`. Callers synthesize a `noIbanConfig` code from this
 * predicate instead, the same out-of-band pattern `EditAccountModal` already uses for
 * `missingCountry`.
 *
 * **The empty-catalog guard is load-bearing, not defensive noise.** `countryIbanRules` legitimately
 * arrives empty in four situations (see `useAccountMutations.fetchDefaults`): a non-ok `/defaults`
 * response, a network throw, a payload without the key, and — the common one — every render before
 * the fetch resolves, since both consumers initialize the state to `[]`. Treating an empty catalog
 * as "every country lacks IBAN config" would block every valid save in all four. Empty means
 * "unknown", so we defer to the backend, which reads live data.
 */
export function countryLacksIbanConfig(countryId, countryIbanRules) {
  if (!countryId || !Array.isArray(countryIbanRules) || countryIbanRules.length === 0) {
    return false;
  }
  return !countryIbanRules.some((country) => country?.id === countryId);
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
