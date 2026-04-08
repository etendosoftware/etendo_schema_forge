import { TrendingDown, CheckCircle2 } from 'lucide-react';

function fmt(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ icon: Icon, label, value, color }) {
  const COLORS = {
    blue:   { bg: 'bg-blue-50',    label: 'text-blue-600',    value: 'text-blue-700',    icon: 'text-blue-500' },
    teal:   { bg: 'bg-teal-50',    label: 'text-teal-600',    value: 'text-teal-700',    icon: 'text-teal-500' },
    orange: { bg: 'bg-orange-50',  label: 'text-orange-600',  value: 'text-orange-700',  icon: 'text-orange-500' },
    green:  { bg: 'bg-emerald-50', label: 'text-emerald-600', value: 'text-emerald-700', icon: 'text-emerald-500' },
  };
  const c = COLORS[color] ?? COLORS.blue;
  return (
    <div className={`rounded-xl p-4 ${c.bg}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={15} className={c.icon} />
        <span className={`text-sm font-semibold ${c.label}`}>{label}</span>
      </div>
      <div className={`text-2xl font-bold leading-none ${c.value}`}>{value}</div>
    </div>
  );
}

export default function AssetsSidebar({ data }) {
  if (!data) return null;

  const depreciate = data.depreciate === true || data.depreciate === 'Y';
  if (!depreciate) return null;

  const depreciatedValue = Number(data.depreciatedValue ?? 0);
  const depreciatedPlan = Number(data.depreciatedPlan ?? 0);
  const assetValue = Number(data.assetValue ?? 0);
  const pct = assetValue > 0
    ? Math.min(100, Math.round((depreciatedValue / assetValue) * 100))
    : null;
  const isComplete = pct === 100;

  return (
    <div className="flex flex-col gap-3">
      <StatCard
        icon={TrendingDown}
        label="Depreciated Value"
        value={fmt(depreciatedValue)}
        color="blue"
      />
      <StatCard
        icon={TrendingDown}
        label="Depreciated Plan"
        value={fmt(depreciatedPlan)}
        color="teal"
      />
      {pct !== null && (
        <div className={`rounded-xl p-4 ${isComplete ? 'bg-emerald-50' : 'bg-orange-50'}`}>
          <div className="flex items-center gap-1.5 mb-2">
            {isComplete
              ? <CheckCircle2 size={15} className="text-emerald-500" />
              : <TrendingDown size={15} className="text-orange-500" />}
            <span className={`text-sm font-semibold ${isComplete ? 'text-emerald-600' : 'text-orange-600'}`}>
              Depreciation
            </span>
          </div>
          <div className={`text-2xl font-bold leading-none ${isComplete ? 'text-emerald-700' : 'text-orange-700'}`}>
            {pct}%
          </div>
          <div className={`mt-2.5 h-2 ${isComplete ? 'bg-emerald-200' : 'bg-orange-200'} rounded-full overflow-hidden`}>
            <div
              className={`h-full ${isComplete ? 'bg-emerald-500' : 'bg-orange-500'} rounded-full transition-all`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
