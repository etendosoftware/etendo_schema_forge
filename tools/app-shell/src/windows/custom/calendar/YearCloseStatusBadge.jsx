import { useUI } from '@/i18n';
import { Tag } from '@/components/ui/tag';
import { useYearCloseStatus } from './useYearCloseStatus.js';

/**
 * `topbarRight` slot for the Calendar window's year detail (see DetailView.jsx's
 * `topbarRight` prop contract: `{ data, recordId, token, apiBaseUrl, api, onProcess,
 * onRefresh }`). Classic's End Year Close window shows an explicit "Status: Year Not Closed" /
 * "Status: Year Closed" header field; C_Year has no such boolean column, so this reuses
 * `useYearCloseStatus` — the single, canonical "is this year closed" derivation shared with
 * YearTableWithCloseStatus (list column) and index.jsx's menuActions override (Cerrar
 * Año/Deshacer Cierre de Año visibility) — so none of the three can ever disagree.
 */
export default function YearCloseStatusBadge({ data, recordId, apiBaseUrl }) {
  const ui = useUI();
  const yearId = recordId || data?.id;
  // `undefined` = loading/unknown, `null` = the request failed. Loading and error states render
  // nothing — this is an auxiliary status indicator, not core functionality, so failing
  // silently is preferable to a misleading placeholder.
  const closed = useYearCloseStatus(yearId, apiBaseUrl);

  if (closed === undefined || closed === null) {
    return null;
  }

  return (
    <span data-testid="year-close-status">
      {closed ? (
        <Tag variant="green" label={ui('yearClosedStatus')} data-testid="Tag__e5ebd4" />
      ) : (
        <Tag
          variant="neutral"
          label={ui('yearNotClosedStatus')}
          data-testid="Tag__e5ebd4" />
      )}
    </span>
  );
}
