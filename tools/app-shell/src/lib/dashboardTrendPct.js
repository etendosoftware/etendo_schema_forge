/**
 * ETP-5493: the percentage shown in the dashboard trend badges ("Resumen financiero" and
 * "Evolucion financiera"): absolute value rounded to an integer, so both cards print the same
 * figure for the same backend value (which carries one decimal).
 */
export function formatTrendPct(trend) {
  return Math.abs(Number(trend) || 0).toFixed(0);
}

/**
 * ETP-5493: direction of a trend badge, decided from the ROUNDED value so the arrow/icon/copy can
 * never disagree with the number printed by `formatTrendPct`. It uses the same rounding (the
 * magnitude, half away from zero: -0.5 prints "1%" and is `'down'`; a -0.4 prints "0%", so it is
 * `'flat'`, not `'down'`). `'flat'` is presented like an exact 0 always was: the "up" copy and a
 * neutral-positive tone.
 */
export function trendDirection(trend) {
  const n = Number(trend) || 0;
  const rounded = Math.sign(n) * Math.round(Math.abs(n));
  if (rounded > 0) return 'up';
  if (rounded < 0) return 'down';
  return 'flat';
}
