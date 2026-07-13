import { useEffect, useState } from 'react';
import { useUI } from '@/i18n';
import { Tag } from '@/components/ui/tag';

/**
 * `topbarRight` slot for the Calendar window's year detail (see DetailView.jsx's
 * `topbarRight` prop contract: `{ data, recordId, token, apiBaseUrl, api, onProcess,
 * onRefresh }`). Classic's End Year Close window shows an explicit "Status: Year Not Closed" /
 * "Status: Year Closed" header field; C_Year has no such boolean column, so — per the same
 * investigation that fixed YearAccountingHandler's missing type filter — a year is considered
 * closed iff it has at least one Fact_Acct row with a year-end closing type (O/C/D/R). This
 * component reuses the exact same `end-year-close` accounting endpoint AccountingPanel already
 * targets (not a re-derived boolean), so the status pill and the Contabilidad tab's own content
 * can never disagree with each other.
 */
export default function YearCloseStatusBadge({ data, recordId, token, apiBaseUrl }) {
  const ui = useUI();
  // `undefined` = loading/unknown, `null` = the request failed, boolean = resolved.
  // Loading and error states render nothing — this is an auxiliary status indicator, not core
  // functionality, so failing silently is preferable to a misleading placeholder.
  const [closed, setClosed] = useState(undefined);
  const yearId = recordId || data?.id;

  useEffect(() => {
    if (!yearId) return;
    setClosed(undefined);
    fetch(`${apiBaseUrl}/accounting?year=${yearId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((body) => setClosed((body.data ?? []).length > 0))
      .catch(() => setClosed(null));
  }, [yearId, apiBaseUrl, token]);

  if (closed === undefined || closed === null) {
    return null;
  }

  return (
    <span data-testid="year-close-status">
      {closed ? (
        <Tag variant="green" label={ui('yearClosedStatus')} />
      ) : (
        <Tag variant="neutral" label={ui('yearNotClosedStatus')} />
      )}
    </span>
  );
}
