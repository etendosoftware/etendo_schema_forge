// ETP-5456 — "Casillas numéricas: revisar que no superen los caracteres permitidos" (Modelo 303).
//
// FINAL behavior (fiscal-advisory correction — supersedes an earlier clamp/truncate draft that
// was reverted mid-ticket, see git history and this file's own header comment on
// `NEGATIVE_NOT_ALLOWED_BOXES`/`buildValidatedBoxValue`): the AEAT record-length ceiling (Lon=17:
// 15 integer digits + 2 decimals for `Num`, 14+2 for a negative `N`) is a PRESENTATION-FORMAT
// constraint, not a fiscal rule. Nothing may round/truncate/saturate an out-of-range amount into
// a different (incorrect) declared value — ever, whether typed or computed:
//   - Manual input: structurally impossible to type out of range at all (hard-stop at the
//     keystroke, `exceedsTypedIntegerDigits`/`exceedsTypedDecimalDigits`, tested in
//     FmBoxes303.hardStop.vitest.jsx).
//   - A value that DOES reach `buildValidatedBoxValue`/`recomputeDerivedBoxes` out of range is
//     reported invalid/out-of-range and left alone — never adjusted.
//
// This file covers the pure functions in fiscalModelsUtils.js. End-to-end UI behavior (keystroke
// hard-stop, blocking toast, exact display) is covered in FmBoxes303.hardStop.vitest.jsx and
// FmModel303Page.outOfRange.vitest.jsx.
import { describe, it, expect } from 'vitest';
import {
  exceedsTypedIntegerDigits,
  exceedsTypedDecimalDigits,
  boxValueOutOfRange,
  buildValidatedBoxValue,
  recomputeDerivedBoxes,
  NEGATIVE_NOT_ALLOWED_BOXES,
} from '../fiscalModelsUtils.js';

describe('exceedsTypedIntegerDigits (ETP-5456)', () => {
  describe('Num box (unsigned, ceiling always 15) — box 77', () => {
    it('allows up to 15 integer digits', () => {
      expect(exceedsTypedIntegerDigits(77, '123456789012345')).toBe(false);
    });

    it('blocks the 16th integer digit', () => {
      expect(exceedsTypedIntegerDigits(77, '1234567890123456')).toBe(true);
    });

    it('does not restrict typing decimals once the integer ceiling is reached', () => {
      expect(exceedsTypedIntegerDigits(77, '123456789012345.3')).toBe(false);
      expect(exceedsTypedIntegerDigits(77, '123456789012345.35')).toBe(false);
    });
  });

  describe('N box (signed, ceiling 15 positive / 14 negative) — box 27', () => {
    it('allows the full 15 digits when non-negative', () => {
      expect(exceedsTypedIntegerDigits(27, '123456789012345')).toBe(false);
    });

    it('allows exactly 14 digits when negative (sign occupies one Lon slot)', () => {
      expect(exceedsTypedIntegerDigits(27, '-12345678901234')).toBe(false);
    });

    it('blocks the 15th digit once negative', () => {
      expect(exceedsTypedIntegerDigits(27, '-123456789012345')).toBe(true);
    });
  });

  describe('tolerant of a mid-edit, not-yet-complete string', () => {
    it.each(['', '-', '.', '-.'])('does not throw or misfire for %j', (raw) => {
      expect(() => exceedsTypedIntegerDigits(77, raw)).not.toThrow();
      expect(exceedsTypedIntegerDigits(77, raw)).toBe(false);
    });
  });
});

describe('exceedsTypedDecimalDigits (ETP-5456, manual QA follow-up)', () => {
  it('allows no decimal point at all', () => {
    expect(exceedsTypedDecimalDigits('9012345')).toBe(false);
  });

  it('allows 1 decimal digit', () => {
    expect(exceedsTypedDecimalDigits('9012345.2')).toBe(false);
  });

  it('allows exactly 2 decimal digits', () => {
    expect(exceedsTypedDecimalDigits('9012345.20')).toBe(false);
  });

  it('blocks the 3rd decimal digit', () => {
    expect(exceedsTypedDecimalDigits('9012345.205')).toBe(true);
  });

  it('blocks a 4th decimal digit too (the exact case manual QA caught on box 42)', () => {
    expect(exceedsTypedDecimalDigits('9012345.2057')).toBe(true);
  });

  it('accepts a comma decimal separator the same way as a dot', () => {
    expect(exceedsTypedDecimalDigits('9012345,20')).toBe(false);
    expect(exceedsTypedDecimalDigits('9012345,205')).toBe(true);
  });

  it('tolerates a trailing decimal point with nothing typed after it yet', () => {
    expect(exceedsTypedDecimalDigits('9012345.')).toBe(false);
  });

  it('is box/sign-independent — same 2-decimal ceiling regardless of boxNum', () => {
    // No boxNum parameter at all: the decimal ceiling never varies by box/sign, unlike the
    // integer ceiling.
    expect(exceedsTypedDecimalDigits('-9012345.205')).toBe(true);
  });
});

describe('boxValueOutOfRange (ETP-5456)', () => {
  it('reports false for a value within range', () => {
    expect(boxValueOutOfRange(77, 123456789012345, '123456789012345')).toBe(false);
  });

  it('reports true for a value whose raw digits overflow the ceiling', () => {
    expect(boxValueOutOfRange(77, 1234567890123456, '1234567890123456')).toBe(true);
  });

  it('decides off the RAW STRING, not off a possibly float64-corrupted `value`', () => {
    // "999999999999999.99" is a legitimate 15-integer-digit amount (in range), but `Number(...)`
    // on it alone already rounds up to 1e15 (16 digits) with no clamp involved — deciding off
    // `value`'s own digit count would misreport this as out-of-range. Deciding off the raw
    // string's digit count does not.
    const corruptedValue = Number('999999999999999.99');
    expect(Math.trunc(corruptedValue).toString().length).toBe(16); // confirms the corruption exists
    expect(boxValueOutOfRange(27, corruptedValue, '999999999999999.99')).toBe(false);
  });

  it('is false for null/non-finite values (nothing to range-check)', () => {
    expect(boxValueOutOfRange(77, null, null)).toBe(false);
    expect(boxValueOutOfRange(77, NaN, 'not-a-number')).toBe(false);
  });
});

describe('buildValidatedBoxValue (ETP-5456)', () => {
  it('returns a normal in-range value unchanged, valid: true', () => {
    expect(buildValidatedBoxValue(77, 500.25, '500.25')).toEqual({ value: 500.25, valid: true });
  });

  it('preserves a boundary value EXACTLY (15 integer digits + 2 decimals) rather than corrupting it via float64', () => {
    // This is the exact case manual QA flagged: `Number('123456789012345.35')` alone rounds to
    // "...34" — a legitimate, fully in-range value must never be silently altered.
    const result = buildValidatedBoxValue(77, 123456789012345.35, '123456789012345.35');
    expect(result.valid).toBe(true);
    expect(String(result.value)).toBe('123456789012345.35');
  });

  it('reports invalid (never a truncated stand-in) for a value whose integer part overflows', () => {
    const result = buildValidatedBoxValue(77, 1234567890123456, '1234567890123456');
    expect(result).toEqual({ value: null, valid: false });
  });

  it('reports invalid for a negative N-box value at 15 integer digits (over its 14-digit ceiling)', () => {
    const result = buildValidatedBoxValue(27, -123456789012345, '-123456789012345');
    expect(result).toEqual({ value: null, valid: false });
  });

  it('is a no-op for null/non-finite value (blank input is always valid)', () => {
    expect(buildValidatedBoxValue(77, null, null)).toEqual({ value: null, valid: true });
  });

  it('never truncates decimals beyond rounding what was actually typed (no forced ".00")', () => {
    // In-range, 3 typed decimals -> rounds to 2 via the same string-safe rounding as roundEur,
    // NOT the old "force to .00 on any overflow" behavior (which only ever applied to the
    // discarded truncate path).
    const result = buildValidatedBoxValue(77, 123.456, '123.456');
    expect(result).toEqual({ value: 123.46, valid: true });
  });
});

describe('recomputeDerivedBoxes — outOfRangeBoxes (ETP-5456, autocalculated boxes)', () => {
  it('attaches an empty outOfRangeBoxes array when every derived box is in range', () => {
    const result = recomputeDerivedBoxes([{ num: 27, value: 1000 }], {});
    expect(result.outOfRangeBoxes).toEqual([]);
  });

  it('flags a derived box (and everything that cascades from it) when the computed result overflows its range, WITHOUT altering the computed value', () => {
    // box46 = box27 - box45(0) = -100000000000000 (15 digits, negative N -> ceiling 14 ->
    // out of range). box64/66/69/71 all chain off box46 and inherit the same violation.
    const result = recomputeDerivedBoxes([{ num: 27, value: -100000000000000 }], {});
    const box46 = result.find(b => b.num === 46);
    expect(box46.value).toBe(-100000000000000); // NOT rounded/truncated — the real computed value
    expect(result.outOfRangeBoxes).toEqual(expect.arrayContaining([46, 64, 66, 69, 71]));
  });

  it('does not flag box111 or any other box when nothing overflows', () => {
    const result = recomputeDerivedBoxes(
      [{ num: 27, value: 1000 }, { num: 70, value: 100 }],
      { rectificativa: true },
    );
    expect(result.outOfRangeBoxes).toEqual([]);
  });

  it('every NEGATIVE_NOT_ALLOWED_BOXES member is treated as unsigned (ceiling 15) even in this derived-box check', () => {
    // Sanity: the set driving both the manual hard-stop and this autocalculated check is the
    // same single source of truth.
    expect([...NEGATIVE_NOT_ALLOWED_BOXES].sort((a, b) => a - b)).toEqual([70, 77, 78, 109, 110, 111]);
  });
});
