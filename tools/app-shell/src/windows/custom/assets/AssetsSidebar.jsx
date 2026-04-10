import { useEffect, useState } from 'react';

function fmt(v, currency = true) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  if (currency) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return n.toLocaleString();
}

function ValueCard({ label, value, subtitle }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900 leading-none">€ {value}</div>
      <div className="text-xs text-gray-400 mt-1">{subtitle}</div>
    </div>
  );
}

function TintCard({ label, value, subtitle, tint }) {
  const styles = {
    green:  { bg: 'bg-emerald-50', label: 'text-emerald-700', value: 'text-emerald-800', sub: 'text-emerald-600' },
    amber:  { bg: 'bg-amber-50',   label: 'text-amber-700',   value: 'text-amber-800',   sub: 'text-amber-600' },
  };
  const s = styles[tint] ?? styles.green;
  return (
    <div className={`rounded-xl p-4 ${s.bg}`}>
      <div className={`text-sm mb-1 ${s.label}`}>{label}</div>
      <div className={`text-2xl font-bold leading-none ${s.value}`}>{value}</div>
      <div className={`text-xs mt-1 ${s.sub}`}>{subtitle}</div>
    </div>
  );
}

function ProgressCard({ total, completed, pct }) {
  const pending = total - completed;
  const isComplete = pct === 100;
  const barColor = isComplete ? 'bg-emerald-500' : 'bg-blue-500';
  const trackColor = isComplete ? 'bg-emerald-200' : 'bg-blue-100';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">Depreciation Progress</span>
        <span className="text-xs text-blue-600 font-medium">{completed} / {total} lines</span>
      </div>
      <div className={`h-2 ${trackColor} rounded-full overflow-hidden mb-3`}>
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <div>
          <span className="font-medium text-gray-700">Pending</span>
          <div>{pending} lines</div>
        </div>
        <div className="text-right">
          <span className="font-medium text-gray-700">Completed</span>
          <div>{completed} lines</div>
        </div>
      </div>
    </div>
  );
}

function countCompletedLines(lines, depreciatedValue) {
  if (!lines.length || depreciatedValue <= 0) return 0;
  let cumulative = 0;
  let completed = 0;
  for (const line of lines) {
    cumulative += Number(line.amortizationAmount ?? 0);
    if (cumulative <= depreciatedValue) {
      completed++;
    } else {
      break;
    }
  }
  return completed;
}

export default function AssetsSidebar({ data, recordId, token, apiBaseUrl }) {
  const [lineStats, setLineStats] = useState({ total: 0, completed: 0 });

  const depreciatedValue = Number(data?.depreciatedValue ?? 0);

  useEffect(() => {
    if (!recordId || !apiBaseUrl) return;

    const url = `${apiBaseUrl}/amortizationLine?parentId=${recordId}&_startRow=0&_endRow=500&_sortBy=sEQNoAsset+asc`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json) return;
        const lines = json?.response?.data ?? json?.data ?? json?.rows ?? [];
        const sorted = Array.isArray(lines) ? lines : [];
        const total = sorted.length;
        const completed = countCompletedLines(sorted, depreciatedValue);
        setLineStats({ total, completed });
      })
      .catch(() => {});
  }, [recordId, apiBaseUrl, token, depreciatedValue]);

  if (!data) return null;

  const assetValue = Number(data.assetValue ?? 0);
  const depreciatedPlan = Number(data.depreciatedPlan ?? 0);
  const pct = assetValue > 0 ? Math.min(100, Math.round((depreciatedValue / assetValue) * 100)) : 0;
  const isComplete = pct === 100;

  return (
    <div className="flex flex-col gap-3">
      <ValueCard
        label="Current Value"
        value={fmt(assetValue)}
        subtitle="Asset book value"
      />
      <TintCard
        label="Planned Depreciation"
        value={`€ ${fmt(depreciatedPlan)}`}
        subtitle="Total scheduled amount"
        tint="green"
      />
      <TintCard
        label="Depreciated"
        value={`${pct}%`}
        subtitle={isComplete ? 'Fully depreciated' : 'Still in progress'}
        tint="amber"
      />
      <ProgressCard
        total={lineStats.total}
        completed={lineStats.completed}
        pct={lineStats.total > 0 ? Math.round((lineStats.completed / lineStats.total) * 100) : 0}
      />
    </div>
  );
}
