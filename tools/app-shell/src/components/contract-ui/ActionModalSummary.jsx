import { MODAL_STYLES } from './modal-styles.js';

/**
 * The two content blocks every document action modal shares (ETP-5398).
 *
 * Both quotation modals declared these inline and byte-identically, and both had the
 * same defect: the `--status-info-*` family was on the SUMMARY card (document data,
 * which is not a status) while the informational message rendered as plain muted text
 * with no banner at all. The roles were simply swapped. Keeping the markup here means
 * the pairing cannot drift apart again in one modal but not the other.
 *
 * Presentational only — no state, no fetching, no handlers.
 */

/**
 * The document summary strip: N equal columns, each a label above its value.
 *
 * @param {{items: Array<{label: string, value: import('react').ReactNode, testId?: string}>}} props
 *   `items` is rendered in order. A falsy entry is skipped, so a caller can inline a
 *   conditional column without building the array by hand. `testId` lands on the VALUE,
 *   which is what assertions read.
 */
export function ActionModalSummary({ items }) {
  const columns = (items || []).filter(Boolean);
  if (columns.length === 0) return null;

  return (
    <div style={MODAL_STYLES.summaryCard}>
      {columns.map((item) => (
        <div key={item.label} style={MODAL_STYLES.summaryCell}>
          <span style={MODAL_STYLES.summaryLabel}>{item.label}</span>
          <span data-testid={item.testId} style={MODAL_STYLES.summaryValue}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The informational banner: the tinted strip that explains what the action will do.
 *
 * The icon inherits `currentColor`, so it always matches the banner text and cannot
 * drift to a different token.
 */
export function ActionModalBanner({ children }) {
  return (
    <div style={MODAL_STYLES.banner}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
