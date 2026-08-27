import { useEffect, useState } from 'react';
import { useUI } from '@/i18n';

import { useApiFetch } from '@/auth/useApiFetch.js';
export default function AccountingPanel({ parentId, token, apiBaseUrl }) {
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
    apiFetch(`/accounting?year=${parentId}`, { token, on401: 'ignore' })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((body) => setRows(body.data ?? []))
      .catch(() => setRows(null));
  }, [parentId, apiFetch, token]);

  if (rows === undefined) {
    return <div data-testid="accounting-panel-loading" className="p-4 text-sm text-muted-foreground">{ui('loading')}</div>;
  }
  if (rows === null) {
    return <div data-testid="accounting-panel-error" className="p-4 text-sm text-destructive">{ui('accountingLoadError')}</div>;
  }
  if (rows.length === 0) {
    return <div data-testid="accounting-panel-empty" className="p-4 text-sm text-muted-foreground">{ui('accountingNoEntries')}</div>;
  }

  return (
    <table data-testid="accounting-panel-table" className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left p-2">{ui('account')}</th>
          <th className="text-right p-2">{ui('debit')}</th>
          <th className="text-right p-2">{ui('credit')}</th>
          <th className="text-left p-2">{ui('description')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} data-testid={`accounting-row-${row.id}`}>
            <td className="p-2" data-testid={`accounting-account-${row.id}`}>{row.account}</td>
            <td className="p-2 text-right">{row.debit}</td>
            <td className="p-2 text-right">{row.credit}</td>
            <td className="p-2">{row.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
