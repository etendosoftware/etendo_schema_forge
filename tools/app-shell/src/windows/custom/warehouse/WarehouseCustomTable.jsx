import { useState, useEffect, forwardRef } from 'react';
import { DataTable } from '@/components/contract-ui';
import { aggregateProducts } from './warehouseUtils';

const inFlightCounts = new Map();

async function fetchProductCount(warehouseId, token, apiBaseUrl) {
  const key = `${apiBaseUrl}|${warehouseId}`;
  if (inFlightCounts.has(key)) return inFlightCounts.get(key);

  const promise = (async () => {
    const res = await fetch(
      `${apiBaseUrl}/storageBin?parentId=${warehouseId}&_startRow=0&_endRow=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const binsJson = await res.json();
    const bins = binsJson?.response?.data ?? binsJson?.data ?? [];
    if (bins.length === 0) return 0;

    const allContents = await Promise.all(
      bins.map(b =>
        fetch(
          `${apiBaseUrl}/binContents?parentId=${b.id}&_startRow=0&_endRow=1000`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
          .then(r => (r.ok ? r.json() : null))
          .then(data => data?.response?.data ?? data?.data ?? [])
          .catch(() => []),
      ),
    ).then(results => results.flat());

    return aggregateProducts(allContents).length;
  })()
    .catch(() => null)
    .finally(() => inFlightCounts.delete(key));

  inFlightCounts.set(key, promise);
  return promise;
}

function WarehouseProductCountCell({ row, token, apiBaseUrl }) {
  const [count, setCount] = useState(undefined);

  useEffect(() => {
    if (!row.id) return;
    let active = true;
    fetchProductCount(row.id, token, apiBaseUrl).then(n => {
      if (active) setCount(n);
    });
    return () => { active = false; };
  }, [row.id, token, apiBaseUrl]);

  if (count === undefined || count === null) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return <span className="text-sm text-[#121217]">{count}</span>;
}

const columns = [
  {
    key: 'name',
    column: 'Name',
    labels: { en_US: 'Name', es_ES: 'Nombre' },
    type: 'custom',
    required: true,
    render: (row) => (
      <span className="text-sm font-semibold text-[#121217]">{row.name}</span>
    ),
  },
  {
    key: 'searchKey',
    column: 'Value',
    labels: { en_US: 'Identifier', es_ES: 'Identificador' },
    type: 'custom',
    required: true,
    render: (row) => {
      if (!row.searchKey) return <span className="text-muted-foreground text-sm">—</span>;
      return (
        <span className="inline-flex items-center px-2 py-1 bg-[#F5F7F9] rounded-lg text-xs font-normal text-[#3F3F50] whitespace-nowrap">
          {row.searchKey}
        </span>
      );
    },
  },
  {
    key: 'locationAddress',
    labels: { en_US: 'Location', es_ES: 'Ubicación' },
    type: 'custom',
    sortable: false,
    render: (row) => {
      const label = row['locationAddress$_identifier'] ?? row.locationAddress ?? null;
      if (!label) return <span className="text-muted-foreground text-sm">—</span>;
      return <span className="text-sm text-[#121217]">{label}</span>;
    },
  },
  {
    key: 'productCount',
    labels: { en_US: 'Products', es_ES: 'Productos' },
    type: 'custom',
    sortable: false,
    render: (row, { token, apiBaseUrl }) => (
      <WarehouseProductCountCell
        row={row}
        token={token}
        apiBaseUrl={apiBaseUrl}
        data-testid="WarehouseProductCountCell__warehouse" />
    ),
  },
];

const filters = ['searchKey', 'name'];

const WarehouseCustomTable = forwardRef(function WarehouseCustomTable(props, ref) {
  return (
    <DataTable
      ref={ref}
      columns={columns}
      filters={filters}
      {...props}
      data-testid="DataTable__df578c" />
  );
});

export default WarehouseCustomTable;
