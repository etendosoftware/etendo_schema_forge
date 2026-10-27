import { useEffect, useMemo, useState } from 'react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { DataTable } from '@/components/contract-ui';

export default function AccountingPanel({ parentId, apiBaseUrl, onCount }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  // Three distinct states, not just null vs array: `undefined` = loading (initial/in-flight),
  // `null` = a request failed (network error or non-2xx response), an array = loaded rows
  // (possibly empty). Never conflate "failed" with "empty" — a server error must not be
  // silently mislabeled as "no accounting entries".
  const [rows, setRows] = useState(undefined);

  useEffect(() => {
    if (!parentId) return;
    setRows(undefined);
    apiFetch(`/accounting?year=${parentId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((body) => setRows(body.data ?? []))
      .catch(() => setRows(null));
  }, [parentId, apiFetch]);

  // Tab count, like every other secondary tab (see PeriodsExpandablePanel for the deps).
  useEffect(() => {
    if (Array.isArray(rows)) onCount?.(rows.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows?.length]);

  // `amount` cells format through the canonical currency utilities, with the accounting
  // schema's currency the backend sends as `currency$_identifier` (ETP-5592).
  const columns = useMemo(() => [
    {
      key: 'account',
      label: ui('account'),
      type: 'string',
      sortable: false,
      render: (row) => (
        <span data-testid={`accounting-account-${row.id}`}>
          {row.accountName ? `${row.account} - ${row.accountName}` : row.account}
        </span>
      ),
    },
    { key: 'debit', label: ui('debit'), type: 'amount', sortable: false },
    { key: 'credit', label: ui('credit'), type: 'amount', sortable: false },
    { key: 'description', label: ui('description'), type: 'string', sortable: false },
  ], [ui]);

  if (rows === null) {
    return <div data-testid="accounting-panel-error" className="p-4 text-sm text-destructive">{ui('accountingLoadError')}</div>;
  }

  return (
    <div data-testid={rows === undefined ? 'accounting-panel-loading' : 'accounting-panel-table'}>
      <DataTable
        columns={columns}
        data={rows ?? []}
        loading={rows === undefined}
        selectable={false}
        showFooterTotals={false}
        emptyState={{
          title: ui('accountingNoEntries'),
          description: ui('accountingEmptyDescription'),
          testId: 'accounting-panel-empty',
        }}
        data-testid="accounting-table" />
    </div>
  );
}
