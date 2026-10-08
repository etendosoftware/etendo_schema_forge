const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const MONTH = DAY * 30;

/** App locales look like `es_ES`; Intl wants BCP 47 (`es-ES`). */
export function toBcp47(locale) {
  return String(locale || 'es_ES').replace('_', '-');
}

/**
 * Formats an ISO instant as a localized relative time ("hace 54 segundos", "ayer").
 * Uses Intl.RelativeTimeFormat with `numeric: 'auto'`, so no per-unit i18n keys are needed.
 * Future instants (clock skew) are clamped to "now".
 *
 * @param {string|number|Date|null} iso    instant to describe
 * @param {string} locale                  app locale (`es_ES`) or BCP 47 tag
 * @param {number} [now=Date.now()]        reference instant in ms
 * @returns {string|null} null when `iso` is missing or not a valid date
 */
export function formatRelativeTime(iso, locale, now = Date.now()) {
  if (iso === null || iso === undefined || iso === '') return null;
  const ts = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;

  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  const rtf = new Intl.RelativeTimeFormat(toBcp47(locale), { numeric: 'auto' });

  if (diffSec < MINUTE) return rtf.format(-diffSec, 'second');
  if (diffSec < HOUR) return rtf.format(-Math.floor(diffSec / MINUTE), 'minute');
  if (diffSec < DAY) return rtf.format(-Math.floor(diffSec / HOUR), 'hour');
  if (diffSec < MONTH) return rtf.format(-Math.floor(diffSec / DAY), 'day');
  return rtf.format(-Math.floor(diffSec / MONTH), 'month');
}
