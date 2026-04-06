import { useState, useEffect, useRef } from 'react';
import { DataTable } from '@/components/contract-ui';

const BASE_COLUMNS = [
  { key: 'name', column: 'Name', type: 'string', label: 'Commercial Name' },
];

const ENRICHED_COLUMNS = [
  ...BASE_COLUMNS,
  { key: '__location', type: 'string', label: 'Location',  render: (row) => row.__location ?? '—' },
  { key: '__email',    type: 'string', label: 'Email',     render: (row) => row.__email    ?? '—' },
];

const filters = ['searchKey', 'name'];

export default function ContactsTable({ data = [], token, apiBaseUrl, ...rest }) {
  const [enrichedData, setEnrichedData] = useState(data);
  const lastDataRef = useRef(null);

  useEffect(() => {
    if (!token || !apiBaseUrl || !data.length) {
      setEnrichedData(data);
      return;
    }
    if (lastDataRef.current === data) return;
    lastDataRef.current = data;

    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${apiBaseUrl}/locationAddress?_startRow=0&_endRow=9999`, { headers })
        .then(r => r.ok ? r.json() : null),
      fetch(`${apiBaseUrl}/contact?_startRow=0&_endRow=9999`, { headers })
        .then(r => r.ok ? r.json() : null),
    ]).then(([locData, contactData]) => {
      // Index first location address per BP
      const locByBP = {};
      for (const rec of (locData?.response?.data ?? [])) {
        if (!locByBP[rec.businessPartner]) {
          locByBP[rec.businessPartner] = rec['locationAddress$_identifier'] ?? rec.name ?? '';
        }
      }
      // Index first contact email per BP
      const emailByBP = {};
      for (const rec of (contactData?.response?.data ?? [])) {
        if (!emailByBP[rec.businessPartner] && rec.email) {
          emailByBP[rec.businessPartner] = rec.email;
        }
      }
      setEnrichedData(data.map(row => ({
        ...row,
        __location: locByBP[row.id] ?? null,
        __email:    emailByBP[row.id] ?? null,
      })));
    }).catch(() => setEnrichedData(data));
  }, [data, token, apiBaseUrl]);

  return <DataTable columns={ENRICHED_COLUMNS} filters={filters} data={enrichedData} {...rest} />;
}
