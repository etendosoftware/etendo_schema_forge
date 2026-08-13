/**
 * IBAN helpers: normalisation, display chunking and ISO 13616 mod-97 validation.
 *
 * The app validates IBANs client-side before hitting the backend so the user
 * gets an inline error without a round-trip (offline account creation, ETP-4096).
 */

/** Strips whitespace and upper-cases an IBAN candidate. */
export function normalizeIban(value) {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Formats an IBAN into space-separated groups of 4 for display. */
export function chunkIban(value) {
  const iban = normalizeIban(value);
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Validates an IBAN using the ISO 13616 mod-97 checksum. Returns false for any
 * malformed input. An empty string is NOT valid (callers treat IBAN as optional
 * and only validate when the field is non-empty).
 */
export function isValidIban(value) {
  const iban = normalizeIban(value);
  if (iban.length < 15 || iban.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;

  // Move the 4 leading chars to the end, expand letters to numbers (A=10..Z=35),
  // then take mod 97 digit-by-digit to avoid BigInt-sized integers.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 1) {
    remainder = (remainder * 10 + (expanded.charCodeAt(i) - 48)) % 97;
  }
  return remainder === 1;
}
