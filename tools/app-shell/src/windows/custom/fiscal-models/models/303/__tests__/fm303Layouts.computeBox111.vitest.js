// Vitest tests for ETP-5431's `computeBox111` — casilla 111 (rectificacion_importe)
// autocompletion formula.
//
// REWRITTEN in `0d196b0c4` — REPLACES the earlier draft-formula matrix (which branched on the
// sign of casilla 69) with the CONFIRMED SPEC (closed with the user/PM, verified algebraically
// against 4 official AEAT examples — Manual Práctico IVA, capítulo 8, autoliquidación
// rectificativa):
//
//   SI es autoliquidación rectificativa Y casilla_71 < 0 Y casilla_70 > 0:
//       casilla 111 = MIN(casilla_70, ABS(casilla_71))
//   EN OTRO CASO:
//       casilla 111 = vacía
//
// The old draft's confirmed bug: a real ServValiDos submission was rejected (errors 35100,
// E030292, 35068) that landed exactly on `box69 = 0`, `box70 = 43,52` — AEAT's own official
// "Negativa/Saldo cero" example shows box 111 must still carry the full box 70 value there, not
// go blank. The new formula no longer reads casilla 69 AT ALL (it is already folded into
// casilla 71 via the official `71 = 69-70+109-112` formula — see `fm303Layouts.js`'s own doc
// comment above `computeBox111`), so `box69` is not part of this function's signature anymore —
// only `{ isRectificativa, box70, box71 }`.
//
// This is the exhaustive pure-function-level matrix. `FmModel303Page.box111Autocomplete.vitest.jsx`
// covers the INTEGRATION wiring (reactive typing, "Calcular", manualOverrides sync) on top of
// this formula.
import { computeBox111 } from '../fm303Layouts.js';

describe('computeBox111 (ETP-5431 pt.2 rewrite — MIN(box70, ABS(box71)) formula)', () => {
  describe('the full condition holds (isRectificativa, box71 < 0, box70 > 0)', () => {
    it('returns box70 when |box71| >= box70 (box70 is the smaller operand)', () => {
      // The confirmed real-world case from the AEAT rejection: box70=43,52, box71=-2,10
      // (|box71| < box70 here — see the next test for that branch). This one instead covers
      // the OPPOSITE MIN branch, |box71| >= box70, where the full box70 is returned verbatim —
      // the exact branch the old per-sign draft covered under "casilla_69 negative".
      expect(computeBox111({ isRectificativa: true, box70: 300, box71: -800 })).toBe(300);
    });

    it('returns |box71| when |box71| < box70 (box71 is the smaller operand)', () => {
      // Real user-confirmed case from ETP-5431: box69=41,42 (irrelevant now — not read),
      // box70=43,52, box71=-2,10 -> box111 expected 2,10.
      expect(computeBox111({ isRectificativa: true, box70: 43.52, box71: -2.10 })).toBeCloseTo(2.10, 10);
    });

    it('returns box70 exactly when |box71| === box70 (MIN ties on either operand)', () => {
      expect(computeBox111({ isRectificativa: true, box70: 20, box71: -20 })).toBe(20);
    });

    // THE case that motivated the rewrite: under the OLD draft, "casilla_69 === 0" fell through
    // to "111 queda vacía" — a confirmed bug (real ServValiDos rejection). The new formula
    // doesn't read box69 at all, so whatever box69 was (0, positive, negative) is irrelevant —
    // only box70/box71/isRectificativa matter. This reproduces the exact AEAT "Negativa/Saldo
    // cero" example shape: box69 = 0, box70 = 43,52 (folded into box71 = 0 - 43,52 = -43,52).
    it('AEAT "Negativa/Saldo cero" example — box69=0 no longer blanks box111 (the confirmed bug fix)', () => {
      expect(computeBox111({ isRectificativa: true, box70: 43.52, box71: -43.52 })).toBeCloseTo(43.52, 10);
    });
  });

  describe('isRectificativa is false — always empty, regardless of box70/box71', () => {
    it('returns null even when box71 < 0 and box70 > 0 would otherwise qualify', () => {
      expect(computeBox111({ isRectificativa: false, box70: 43.52, box71: -2.10 })).toBeNull();
    });

    it('returns null when isRectificativa is omitted (undefined)', () => {
      expect(computeBox111({ box70: 43.52, box71: -2.10 })).toBeNull();
    });
  });

  describe('box71 does not satisfy "< 0"', () => {
    it('returns null when box71 is exactly 0', () => {
      expect(computeBox111({ isRectificativa: true, box70: 20, box71: 0 })).toBeNull();
    });

    it('returns null when box71 is positive', () => {
      expect(computeBox111({ isRectificativa: true, box70: 300, box71: 50 })).toBeNull();
    });
  });

  describe('box70 does not satisfy "> 0"', () => {
    it('returns null when box70 is exactly 0', () => {
      expect(computeBox111({ isRectificativa: true, box70: 0, box71: -10 })).toBeNull();
    });

    it('returns null when box70 is negative', () => {
      expect(computeBox111({ isRectificativa: true, box70: -5, box71: -10 })).toBeNull();
    });

    it('returns null when box70 is null (no value at all)', () => {
      expect(computeBox111({ isRectificativa: true, box70: null, box71: -10 })).toBeNull();
    });

    it('returns null when box70 is undefined', () => {
      expect(computeBox111({ isRectificativa: true, box70: undefined, box71: -10 })).toBeNull();
    });
  });

  describe('box69 is no longer part of the signature at all', () => {
    it('ignores an extra box69 property silently passed in by a stale caller', () => {
      // Confirms the formula does not accidentally read a `box69` key even if a caller (e.g. an
      // un-migrated test double) still passes one — the new formula must depend ONLY on
      // isRectificativa/box70/box71.
      expect(computeBox111({ isRectificativa: true, box69: 999999, box70: 43.52, box71: -2.10 }))
        .toBeCloseTo(2.10, 10);
      expect(computeBox111({ isRectificativa: true, box69: -999999, box70: 43.52, box71: -2.10 }))
        .toBeCloseTo(2.10, 10);
    });
  });
});
