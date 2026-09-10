import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatSigned } from '../formatSigned.js';

// `formatSigned` now delegates entirely to the shared `formatCurrency()`
// (ETP-4314), which under the `es-ES` locale inserts a NON-BREAKING SPACE
// (U+00A0) between the amount and the currency symbol/word — not a regular
// space. All exact-match assertions below use the literal ` ` escape,
// consistent with formatCurrency.test.js.
const NBSP = ' ';

describe('formatSigned helpers', () => {
  describe('formatDate', () => {
    it('returns an em dash for falsy input', () => {
      assert.equal(formatDate(null, 'es-ES'), '—');
      assert.equal(formatDate('', 'es-ES'), '—');
      assert.equal(formatDate(undefined, 'es-ES'), '—');
    });

    it('returns an em dash for an invalid date string', () => {
      assert.equal(formatDate('not-a-date', 'es-ES'), '—');
    });

    it('formats a UTC-midnight date-only payload without timezone drift', () => {
      // 2026-04-27 must stay the 27th regardless of the host timezone.
      assert.equal(formatDate('2026-04-27T00:00:00Z', 'es-ES'), '27/04/2026');
    });

    it('honors the provided BCP locale ordering', () => {
      assert.equal(formatDate('2026-04-27T00:00:00Z', 'en-US'), '04/27/2026');
    });

    /**
     * ETP-5100 — the evening-timestamp regression.
     *
     * `formatDate` used to be:
     *
     *   const d = new Date(iso);
     *   new Intl.DateTimeFormat(bcpLocale, { ..., timeZone: 'UTC' }).format(d);
     *
     * i.e. two opposite assumptions that only cancel out for a payload that is
     * literally UTC midnight — which is what every pre-existing fixture in this
     * repo used, which is why 2105 green tests never noticed. Once NEO started
     * emitting a real wall-clock time, `new Date()` resolved it in the HOST's
     * zone while the formatter rendered it back in UTC, so the two offsets
     * stacked and the calendar day moved.
     *
     * Each case below states whether it is RED against that old body, and under
     * which host zone. `withTz` pins the zone per assertion so none of this
     * depends on the machine running the suite.
     */
    describe('ETP-5100 — a wall-clock time must not move the calendar day', () => {
      function withTz(tz, fn) {
        const previous = process.env.TZ;
        process.env.TZ = tz;
        try {
          fn();
        } finally {
          process.env.TZ = previous;
        }
      }

      it('zone-less evening value keeps its own day on a UTC-3 host', () => {
        // RED against the old body: `new Date('2026-09-01T22:59:10')` is LOCAL,
        // so on UTC-3 the instant is 2026-09-02T01:59:10Z and the UTC formatter
        // printed 02/09/2026. This is the exact shape reported live.
        withTz('America/Argentina/Buenos_Aires', () => {
          assert.equal(formatDate('2026-09-01T22:59:10', 'es-ES'), '01/09/2026');
        });
      });

      it('zone-less after-midnight value keeps its own day on a UTC+14 host', () => {
        // The mirror image, RED against the old body for the opposite reason:
        // local 2026-09-02 00:30 on UTC+14 is 2026-09-01T10:30Z, so the UTC
        // formatter printed 01/09/2026 for a movement dated the 2nd. Proves the
        // fix is offset-agnostic, not just "negative offsets patched".
        withTz('Pacific/Kiritimati', () => {
          assert.equal(formatDate('2026-09-02T00:30:00', 'es-ES'), '02/09/2026');
        });
      });

      it('offset-suffixed evening value keeps its own day under any host zone', () => {
        // RED against the old body under EVERY host zone: the offset is honored
        // on parse (→ 2026-09-02T01:59:10Z) and then rendered in UTC, so the day
        // moved no matter where the browser was. The only case here that needs
        // no TZ pinning at all.
        for (const tz of ['UTC', 'America/Argentina/Buenos_Aires', 'Europe/Madrid', 'Pacific/Kiritimati']) {
          withTz(tz, () => {
            assert.equal(formatDate('2026-09-01T22:59:10-03:00', 'es-ES'), '01/09/2026', `host zone ${tz}`);
          });
        }
      });

      it('Z-suffixed evening value renders its own day', () => {
        // NOT red against the old body (parsed as UTC, rendered as UTC → same
        // answer). Kept deliberately: the fix must remain correct for whichever
        // wire shape NEO ends up sending, and this pins the second one.
        for (const tz of ['UTC', 'America/Argentina/Buenos_Aires', 'Pacific/Kiritimati']) {
          withTz(tz, () => {
            assert.equal(formatDate('2026-09-01T22:59:10Z', 'es-ES'), '01/09/2026', `host zone ${tz}`);
          });
        }
      });

      it('bare date-only and UTC-midnight payloads keep working', () => {
        // Regression pin for the shapes that DID work before, so the fix cannot
        // be "corrected" back by trading one broken case for another.
        withTz('America/Argentina/Buenos_Aires', () => {
          assert.equal(formatDate('2026-09-01', 'es-ES'), '01/09/2026');
          assert.equal(formatDate('2026-09-01T00:00:00Z', 'es-ES'), '01/09/2026');
        });
      });
    });
  });

  describe('formatSigned', () => {
    it('prefixes "+" for positive amounts', () => {
      assert.equal(formatSigned(1234.5, 'EUR'), `+1.234,50${NBSP}€`);
    });

    it('prefixes "-" for negative amounts (absolute value formatted)', () => {
      assert.equal(formatSigned(-99.9, 'EUR'), `-99,90${NBSP}€`);
    });

    it('treats zero as positive', () => {
      assert.equal(formatSigned(0, 'EUR'), `+0,00${NBSP}€`);
    });

    it('coerces non-numeric amounts to 0 (positive)', () => {
      assert.equal(formatSigned('x', 'EUR'), `+0,00${NBSP}€`);
    });

    it('always uses es-ES decimal style and the given currency', () => {
      // narrowSymbol currencyDisplay renders USD as "$", not "US$".
      assert.equal(formatSigned(1000, 'USD'), `+1.000,00${NBSP}$`);
    });

    describe('useGrouping regression (ETP-4314) — thousands separator must survive delegation to formatCurrency', () => {
      // Regression coverage for the exact bug fixed here: formatSigned used to
      // build its own Intl.NumberFormat without `useGrouping: true`, so any
      // amount >= 1000 rendered without a thousands separator
      // (e.g. "+1234,50 €" instead of "+1.234,50 €"). It now delegates to
      // formatCurrency(), which sets useGrouping explicitly.
      it('EUR: 1234.5 includes the thousands separator', () => {
        const result = formatSigned(1234.5, 'EUR');
        assert.equal(result, `+1.234,50${NBSP}€`);
        assert.ok(result.includes('.'), `Expected a thousands separator in: ${result}`);
      });

      it('EUR: a negative amount >= 1000 also groups thousands', () => {
        const result = formatSigned(-2500.75, 'EUR');
        assert.equal(result, `-2.500,75${NBSP}€`);
        assert.ok(result.includes('.'), `Expected a thousands separator in: ${result}`);
      });

      it('EUR: 1,000,000 includes two grouped thousands separators', () => {
        const result = formatSigned(1_000_000, 'EUR');
        assert.equal(result, `+1.000.000,00${NBSP}€`);
        assert.equal((result.match(/\./g) || []).length, 2, `Expected two thousands separators in: ${result}`);
      });

      it('999.99 (just under the boundary) has no thousands separator', () => {
        const result = formatSigned(999.99, 'EUR');
        assert.equal(result, `+999,99${NBSP}€`);
      });
    });
  });
});
