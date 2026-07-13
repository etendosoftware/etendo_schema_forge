import { useEffect, useState } from 'react';
import { useUI } from '@/i18n';

export default function AccountingPanel({ parentId, token, apiBaseUrl }) {
  const ui = useUI();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!parentId) return;
    fetch(`${apiBaseUrl}/accounting?year=${parentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body) => setRows(body.data ?? []));
  }, [parentId, apiBaseUrl, token]);

  if (rows === null) return null;
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
          <tr key={row.id}>
            <td className="p-2">{row.account}</td>
            <td className="p-2 text-right">{row.debit}</td>
            <td className="p-2 text-right">{row.credit}</td>
            <td className="p-2">{row.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
