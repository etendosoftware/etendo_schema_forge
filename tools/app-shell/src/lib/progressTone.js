/**
 * Map a 0..1 completion fraction to a status-tone token.
 * Mirrors the four-tone palette used by DocumentStatusPill so progress
 * indicators (Delivered, Received, Invoiced…) read with the same color
 * vocabulary as document status. Only 'neutral' and 'success' are produced.
 *
 * - 1.0 → 'success' (everything done)
 * - (0, 1) → 'neutral' (in progress; the header badge conveys partial progress with its
 *   ring, not with an amber tone)
 * - 0 / non-finite → 'neutral'
 */
const FULL_THRESHOLD = 0.999;

export function getProgressTone(pct) {
  const value = Number(pct);
  if (!Number.isFinite(value) || value <= 0) return 'neutral';
  if (value >= FULL_THRESHOLD) return 'success';
  return 'neutral';
}
