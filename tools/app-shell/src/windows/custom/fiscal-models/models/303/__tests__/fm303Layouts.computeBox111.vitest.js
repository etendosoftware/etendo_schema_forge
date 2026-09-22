// Vitest tests for ETP-5431 pt.2's `computeBox111` — casilla 111 (rectificacion_importe)
// autocompletion formula. Pure-function coverage of the full CONFIRMED SPEC matrix (closed
// with the user/PM):
//
//   SI casilla_71 < 0 Y casilla_70 tiene valor:
//       SI casilla_69 es positiva: 111 = 70 - 69, SOLO SI el resultado es positivo (si no, vacía)
//       SI casilla_69 es negativa: 111 = mismo valor que 70
//       SI casilla_69 = 0: 111 vacía (implementation decision — falls through, not part of the
//         closed spec, which only enumerates "positiva"/"negativa")
//   SI NO se cumple la condición de arriba (71>=0, o 70 vacío/cero): 111 queda vacía
//
// This is the exhaustive-matrix layer. `FmModel303Page.box111Autocomplete.vitest.jsx` covers
// the subset of this matrix that's actually reachable by typing through the real UI (box69/71
// are themselves derived from other boxes, so not every {box69, box70, box71} combination below
// is independently reachable there — see that file's own header comment) plus the integration
// wiring (reactive typing, "Calcular", manualOverrides sync, the box70-clamp ordering guarantee).
import { computeBox111 } from '../fm303Layouts.js';

describe('computeBox111', () => {
  describe('casilla_71 < 0 and casilla_70 has a value', () => {
    describe('casilla_69 is positive', () => {
      it('returns 70 - 69 when the result is positive', () => {
        expect(computeBox111({ box69: 5, box70: 20, box71: -15 })).toBe(15);
      });

      it('returns null when 70 - 69 is exactly zero', () => {
        expect(computeBox111({ box69: 20, box70: 20, box71: -0.01 })).toBeNull();
      });

      it('returns null when 70 - 69 is negative', () => {
        expect(computeBox111({ box69: 20, box70: 5, box71: -100 })).toBeNull();
      });
    });

    describe('casilla_69 is negative', () => {
      it('returns the same value as casilla_70', () => {
        expect(computeBox111({ box69: -500, box70: 300, box71: -800 })).toBe(300);
      });

      it('returns casilla_70 even when casilla_70 is 0 (present but zero)', () => {
        expect(computeBox111({ box69: -500, box70: 0, box71: -500 })).toBe(0);
      });
    });

    describe('casilla_69 is exactly 0 (confirmed decision — neither branch fires)', () => {
      it('returns null', () => {
        expect(computeBox111({ box69: 0, box70: 10, box71: -10 })).toBeNull();
      });
    });
  });

  describe('the outer condition does not hold', () => {
    it('returns null when casilla_71 is exactly 0 (not < 0)', () => {
      expect(computeBox111({ box69: 5, box70: 20, box71: 0 })).toBeNull();
    });

    it('returns null when casilla_71 is positive', () => {
      expect(computeBox111({ box69: -500, box70: 300, box71: 50 })).toBeNull();
    });

    it('returns null when casilla_70 is null (no value at all), even with 71 < 0', () => {
      expect(computeBox111({ box69: -100, box70: null, box71: -100 })).toBeNull();
    });

    it('returns null when casilla_70 is undefined, even with 71 < 0', () => {
      expect(computeBox111({ box69: -100, box70: undefined, box71: -100 })).toBeNull();
    });

    // "casilla_70 tiene valor" is satisfied by a present 0 — only a MISSING box70 (null/
    // undefined) should short-circuit. A present box70 === 0 still reaches the inner branches.
    it('does NOT short-circuit on casilla_70 === 0 (0 is a present value, not "vacía")', () => {
      // box69 negative branch: 111 = box70 = 0.
      expect(computeBox111({ box69: -50, box70: 0, box71: -50 })).toBe(0);
    });
  });
});
