/**
 * The browser copy of the `structured-address-for-sepa` address rules (ETP-5806), shared by every
 * caller that builds a `locationAddress` payload: the Location editor (`LocationEditorModal.jsx`)
 * and the Contacts import (`contactsImportDescriptor.js`, ETP-6206).
 *
 * The backend (`StructuredAddressComposer.java` in com.etendoerp.go) is the source of truth and
 * recomputes everything here server-side for every channel, REST and MCP alike. This module exists
 * so the two browser callers cannot drift from each other — before ETP-6206 the composer lived
 * inside the modal, and the import, which could not reach it, kept sending a payload the server
 * rejected once the flag was on. Keep it in exact lockstep with the Java algorithm: same separators
 * (", " and " - "), same 60-char line length, same precedence of truncation cases.
 *
 * Plain module (no React, no `@/` imports) so a plain descriptor can use it.
 */

// ETP-5806 — length of C_Location.Address1/Address2, NOT the 70 of EM_OBSEPA_StrtNm.
export const ADDRESS_LINE_MAX_LENGTH = 60;

// ETP-5806 follow-up — DB column lengths of the 3 structured SEPA fields themselves
// (org.openbravo.sepa.iso20022's AD_COLUMN.FIELDLENGTH for EM_OBSEPA_StrtNm/BldgNb/BldgNm).
// The backend (StructuredAddressComposer#fieldsExceedingMaxLength) is the real source of truth
// and rejects an over-length value with a 400.
export const STREET_NAME_MAX_LENGTH = 70;
export const BUILDING_NUMBER_MAX_LENGTH = 16;
export const BUILDING_NAME_MAX_LENGTH = 35;

// ETP-5806 follow-up (UX redesign) — Number is not mandatory. When it is empty, this literal is
// used as the effective number both in the composed address and in the save payload, matching the
// Spanish addressing convention for "sin número" and `StructuredAddressComposer`'s own fallback.
// It is NOT translated — it is the same abbreviation in every locale.
export const EMPTY_BUILDING_NUMBER_FALLBACK = 's/n';

/**
 * The Building Number to persist, mirroring `StructuredAddressComposer.effectiveBuildingNumber`:
 * the trimmed number when there is one; "s/n" when it is blank but a street is present; `null`
 * otherwise (there is nothing to anchor "no number" to without a street).
 */
export function effectiveBuildingNumber(streetName, buildingNumber) {
  const number = String(buildingNumber ?? '').trim();
  if (number) return number;
  return String(streetName ?? '').trim() ? EMPTY_BUILDING_NUMBER_FALLBACK : null;
}

/** Concatenates two parts with `sep` only when BOTH are non-empty — mirrors Java's `append`. */
function appendPart(base, sep, part) {
  if (!base) return part;
  if (!part) return base;
  return `${base}${sep}${part}`;
}

/**
 * The composed Address1/Address2 for a structured address (ETP-5806).
 */
export function composeAddressLines(streetName, buildingNumber, buildingName) {
  const street = String(streetName ?? '').trim();
  const name = String(buildingName ?? '').trim();
  // ETP-5806 follow-up (bug fix) — a composed address line always needs a street as its
  // base, exactly like the backend (StructuredAddressComposer never composes a line without
  // one). Without this early return, an empty street + a typed Number ("1") produced
  // address1 = "1" (via appendPart treating the falsy `street` as "nothing before, return
  // the part"), which flipped the badge to "Completado" with no street ever entered.
  if (!street) {
    return {address1: '', address2: ''};
  }
  // Number is optional; an empty one composes as "s/n" rather than being dropped, so the
  // composed address (and the saved value) shows a number component once a street is present.
  const number = String(buildingNumber ?? '').trim() || EMPTY_BUILDING_NUMBER_FALLBACK;

  const streetAndNumber = appendPart(street, ', ', number);
  const wholeAddress = appendPart(streetAndNumber, ' - ', name);

  if (wholeAddress.length <= ADDRESS_LINE_MAX_LENGTH) {
    return {address1: wholeAddress, address2: ''};
  }
  if (streetAndNumber.length <= ADDRESS_LINE_MAX_LENGTH) {
    return {address1: streetAndNumber, address2: name.slice(0, ADDRESS_LINE_MAX_LENGTH)};
  }
  return {
    address1: street.slice(0, ADDRESS_LINE_MAX_LENGTH),
    address2: appendPart(number, ' - ', name).slice(0, ADDRESS_LINE_MAX_LENGTH),
  };
}
