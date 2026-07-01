import { useUI } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';

function MetricCard({ label, value, subtitle, tint = null }) {
  if (tint === 'green') {
    return (
      <div className="rounded-xl bg-emerald-50 p-3">
        <div className="text-xs text-emerald-600 mb-0.5">{label}</div>
        <div className="text-lg font-bold leading-none text-emerald-800">{value}</div>
        {subtitle && <div className="text-xs text-emerald-600 mt-1">{subtitle}</div>}
      </div>
    );
  }
  if (tint === 'amber') {
    return (
      <div className="rounded-xl bg-amber-50 p-3">
        <div className="text-xs text-amber-600 mb-0.5">{label}</div>
        <div className="text-lg font-bold leading-none text-amber-800">{value}</div>
        {subtitle && <div className="text-xs text-amber-600 mt-1">{subtitle}</div>}
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-blue-50 p-3">
      <div className="text-xs text-blue-600 mb-0.5">{label}</div>
      <div className="text-lg font-bold leading-none text-blue-900">{value}</div>
      {subtitle && <div className="text-xs text-blue-500 mt-1">{subtitle}</div>}
    </div>
  );
}

export default function AssetsSidebar({ data }) {
  const ui = useUI();
  const orgCurrency = useCurrency() ?? 'USD';

  const hasData = !!data;
  const assetValue = Number(data?.assetValue ?? 0);
  const residualAssetValue = Number(data?.residualAssetValue ?? 0);
  const depreciatedPlan = Number(data?.depreciatedPlan ?? 0);
  const pct = Number(data?.etgoAmortizationStatus ?? 0);
  const isComplete = pct === 100;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="pb-3">
          <span className="text-sm font-semibold text-gray-800">{ui('assetsDepreciationSummary')}</span>
        </div>
        <div className="flex flex-col gap-3">
          <MetricCard
            label={ui('assetsCurrentValue')}
            value={hasData ? formatCurrency(orgCurrency, assetValue) : '—'}
            subtitle={ui('assetsBookValue')}
            data-testid="MetricCard__b651ab" />
          <MetricCard
            label={ui('assetsResidualValueLabel')}
            value={hasData ? formatCurrency(orgCurrency, residualAssetValue) : '—'}
            data-testid="MetricCard__b651ab" />
          <MetricCard
            label={ui('assetsPlannedDepreciation')}
            value={hasData ? formatCurrency(orgCurrency, depreciatedPlan) : '—'}
            subtitle={ui('assetsTotalScheduled')}
            tint="green"
            data-testid="MetricCard__b651ab" />
          <MetricCard
            label={ui('assetsDepreciated')}
            value={hasData ? `${pct}%` : '—'}
            subtitle={hasData ? (isComplete ? ui('assetsFullyDepreciated') : ui('assetsStillInProgress')) : null}
            tint="amber"
            data-testid="MetricCard__b651ab" />
        </div>
      </div>
    </div>
  );
}
