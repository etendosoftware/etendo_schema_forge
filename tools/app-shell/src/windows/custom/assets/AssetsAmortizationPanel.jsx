import { useEffect, useState, useCallback } from 'react';

function fmt(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ isProcessed }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
        ${isProcessed ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}
    >
      {isProcessed ? 'Processed' : 'Planned'}
    </span>
  );
}

function getLineStatuses(lines, depreciatedValue) {
  const statuses = new Map();
  let cumulative = 0;
  for (const line of lines) {
    cumulative += Number(line.amortizationAmount ?? 0);
    statuses.set(line.id ?? line.sEQNoAsset, cumulative <= depreciatedValue && depreciatedValue > 0);
  }
  return statuses;
}

export default function AssetsAmortizationPanel({ data, token, apiBaseUrl }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const recordId = data?.id;

  const fetchLines = useCallback(() => {
    if (!recordId || !apiBaseUrl) return;
    setLoading(true);
    const url = `${apiBaseUrl}/amortizationLine?parentId=${recordId}&_startRow=0&_endRow=500&_sortBy=sEQNoAsset+asc`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(json => {
        const rows = json?.response?.data ?? json?.data ?? json?.rows ?? [];
        setLines(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
  }, [recordId, apiBaseUrl, token]);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  const depreciatedValue = Number(data?.depreciatedValue ?? 0);
  const lineStatuses = getLineStatuses(lines, depreciatedValue);
  const plannedCount = [...lineStatuses.values()].filter(v => !v).length;
  const totalAmount = lines.reduce((sum, l) => sum + Number(l.amortizationAmount ?? 0), 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 mt-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-gray-800">Amortization Plan</div>
          <div className="text-xs text-gray-400 mt-0.5">
            This should be visible on first load because it answers what will happen to the asset over time.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plannedCount > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              {plannedCount} planned {plannedCount === 1 ? 'line' : 'lines'}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-gray-400 py-4 text-center">Loading...</div>
      ) : lines.length === 0 ? (
        <div className="text-xs text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">
          No amortization lines yet. Use &quot;Create Amortization&quot; to generate the plan.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide py-2 pr-4">Period</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide py-2 pr-4">Percentage</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide py-2 pr-4">Amount</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map((line) => (
                <tr key={line.id ?? line.sEQNoAsset} className="hover:bg-gray-50">
                  <td className="py-2.5 pr-4 text-gray-700">{line['amortization$_identifier'] ?? line.amortization ?? '—'}</td>
                  <td className="py-2.5 pr-4 text-gray-700">
                    {line.amortizationPercentage != null
                      ? `${Number(line.amortizationPercentage).toFixed(2)}%`
                      : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-700">€ {fmt(line.amortizationAmount)}</td>
                  <td className="py-2.5">
                    <StatusBadge isProcessed={lineStatuses.get(line.id ?? line.sEQNoAsset)} />
                  </td>
                </tr>
              ))}
            </tbody>
            {totalAmount > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={2} />
                  <td colSpan={2} className="py-2.5 text-right text-xs font-semibold text-gray-700 pr-4">
                    Total planned: € {fmt(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
