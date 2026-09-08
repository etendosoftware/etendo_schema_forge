/**
 * Format a byte size into a short, locale-agnostic string ("281 B", "1.5 KB", "1.2 MB").
 *
 * Lives in `lib/` with **no imports** on purpose. It used to be exported from
 * `components/attachments/useAttachments.js`, which pulls in the `@/i18n` barrel (and through
 * it `.jsx`), so anything wanting just this formatter had to drag a React hook module along —
 * and could not be exercised under plain `node --test` at all. `useAttachments` re-exports it,
 * so its own consumers and tests are unaffected.
 *
 * A whole number below 10 units keeps one decimal (1.5 KB), 10 and above drops it (10 KB), and
 * raw bytes never carry one — a file size with three significant digits reads as noise.
 *
 * @param {number} bytes - Raw size in bytes.
 * @returns {string} the formatted size, or an em dash when the size is unknown.
 */
export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}
