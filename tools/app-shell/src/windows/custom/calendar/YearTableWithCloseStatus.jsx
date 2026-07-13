import { forwardRef, useEffect, useState } from 'react';
import { DataTable } from '@/components/contract-ui';
import { Tag } from '@/components/ui/tag';
import { useUI } from '@/i18n';

// `col.render` (checked first, before any type-based cell renderer — see
// DataTable.jsx's renderCellValue) receives `(row, { entity, token, apiBaseUrl })`, where
// `apiBaseUrl` is the SAME base the whole year list uses (`.../fiscal-calendar`), not the
// `end-year-close` spec this status check needs. Rewritten here, at render time, the same way
// index.jsx's `AccountingPanelForCalendar`/`YearCloseStatusBadgeForCalendar` rewrite it for
// their own components — no separate wrapper needed since this is a one-off derivation inside
// a single column, not a whole component's worth of API calls.
function rootApiBase(apiBaseUrl) {
  return apiBaseUrl.replace(/\/[^/]*$/, '');
}

// Reuses the exact same "closed iff the end-year-close accounting endpoint returns at least
// one row" derivation as YearCloseStatusBadge (the detail header's status pill) — never a
// second, different derivation — so the list column and the header can never disagree.
//
// Fired once per visible row. A true bulk "which of these year IDs are closed" check would
// need a new backend (com.etendoerp.go) endpoint — out of scope for this frontend-only fix.
// Each row's own effect fires independently, so the whole set resolves in parallel (never
// sequentially/one-at-a-time) as soon as the list renders. A client's fiscal-years list is
// inherently small and bounded (one row per calendar year, never paginated in practice), so
// N small parallel requests is an acceptable tradeoff against the added complexity of a
// dedicated bulk endpoint.
function YearCloseStatusCell({ yearId, token, apiBaseUrl }) {
  const ui = useUI();
  // `undefined` = loading, `null` = the request failed — both render nothing (an auxiliary
  // column cell showing a wrong/misleading state is worse than briefly showing nothing).
  const [closed, setClosed] = useState(undefined);

  useEffect(() => {
    if (!yearId) return;
    let cancelled = false;
    setClosed(undefined);
    fetch(`${apiBaseUrl}/accounting?year=${yearId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((body) => {
        if (!cancelled) setClosed((body.data ?? []).length > 0);
      })
      .catch(() => {
        if (!cancelled) setClosed(null);
      });
    return () => {
      cancelled = true;
    };
  }, [yearId, apiBaseUrl, token]);

  if (closed === undefined || closed === null) return null;

  // Reuses the exact same i18n keys as YearCloseStatusBadge (the detail header's pill) —
  // "yearClosedStatus"/"yearNotClosedStatus" — so the two never drift into different wording.
  return closed ? (
    <Tag variant="green" label={ui('yearClosedStatus')} />
  ) : (
    <Tag variant="neutral" label={ui('yearNotClosedStatus')} />
  );
}

// Same two AD-backed columns the generated YearTable declares, plus a synthetic
// `yearCloseStatus` column with no backing AD field — `col.render` bypasses normal
// field/type-based cell resolution entirely, so a missing/absent field on the row never
// matters. `labels` is the HIGHEST-priority source in resolveColumnLabel.js (checked before
// even the i18n dictionary), so no locale JSON changes are needed for the header text either.
const columns = [
  { key: 'fiscalYear', column: 'Year', type: 'string', label: 'Fiscal Year', required: true },
  { key: 'description', column: 'Description', type: 'string', label: 'Description' },
  {
    key: 'yearCloseStatus',
    column: 'YearCloseStatus',
    type: 'string',
    label: 'Estado',
    labels: { es_ES: 'Estado', es_AR: 'Estado', en_US: 'Status' },
    sortable: false,
    render: (row, { token, apiBaseUrl }) => (
      <YearCloseStatusCell
        yearId={row.id}
        token={token}
        apiBaseUrl={`${rootApiBase(apiBaseUrl)}/end-year-close`}
      />
    ),
  },
];

const filters = [];

const YearTableWithCloseStatus = forwardRef(function YearTableWithCloseStatus(props, ref) {
  return <DataTable ref={ref} columns={columns} filters={filters} {...props} />;
});

export default YearTableWithCloseStatus;
