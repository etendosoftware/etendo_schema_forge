import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useMenuLabel } from '@/i18n';
import { useLocaleSwitch } from '@/i18n';
import { formatDashboardAmount, formatDashboardNumber, localeFromUi } from '@/lib/dashboardNumberFormat.js';

/**
 * Format a KPI value according to the specified format type.
 *
 * Supported formats:
 * - 'currency': locale-formatted with $ symbol (e.g. $1,234.56)
 * - 'percent': one decimal place with % suffix (e.g. 12.3%)
 * - 'number': locale-formatted integer/decimal (e.g. 1,234)
 * - default: raw value as-is
 */
function formatValue(value, format, currencyLabel, locale) {
  if (value == null) return '-';

  switch (format) {
    case 'currency':
      return formatDashboardAmount(value, currencyLabel, locale);

    case 'percent':
      return `${Number(value).toFixed(1)}%`;

    case 'number':
      return formatDashboardNumber(value, locale);

    default:
      return String(value);
  }
}

const KPI_SCHEMES = {
  revenueThisMonth:  { bg: 'bg-emerald-50 dark:bg-emerald-950', icon: 'text-emerald-600' },
  expensesThisMonth: { bg: 'bg-red-50 dark:bg-red-950',         icon: 'text-red-500'     },
  netProfit:         { bg: 'bg-blue-50 dark:bg-blue-950',        icon: 'text-blue-600'    },
  pendingInvoices:   { bg: 'bg-amber-50 dark:bg-amber-950',      icon: 'text-amber-600'   },
};
const DEFAULT_SCHEME = { bg: 'bg-primary/10', icon: 'text-primary' };

/**
 * A single KPI metric card.
 */
export function KPICard({ label, value, format, trend, previousValue, icon: Icon, kpiKey, currencyLabel = '' }) {
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();
  const numberLocale = localeFromUi(locale);
  const hasTrend = trend != null && trend !== 0;
  const isPositive = trend > 0;
  const scheme = KPI_SCHEMES[kpiKey] || DEFAULT_SCHEME;

  return (
    <Card className="flex-1 min-w-[160px]" data-testid="Card__e18695">
      <CardContent className="p-4" data-testid="CardContent__e18695">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">
              {label}
            </p>
            <p className="text-2xl font-bold tracking-tight mt-1">
              {formatValue(value, format, currencyLabel, numberLocale)}
            </p>
          </div>
          {Icon && (
            <div className={`h-8 w-8 shrink-0 rounded-md ${scheme.bg} flex items-center justify-center`}>
              <Icon className={`h-4 w-4 ${scheme.icon}`} data-testid="Icon__e18695" />
            </div>
          )}
        </div>

        {hasTrend && (
          <div
            className={cn(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              isPositive ? 'text-emerald-600' : 'text-red-600'
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5" data-testid="TrendingUp__e18695" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" data-testid="TrendingDown__e18695" />
            )}
            <span>
              {isPositive ? '+' : ''}
              {Number(trend).toFixed(1)}%
            </span>
          </div>
        )}

        {previousValue != null && hasTrend && (
          <p className="text-xs text-muted-foreground mt-1">
            vs {formatValue(previousValue, format, currencyLabel, numberLocale)} {tMenu('prev. month')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * KPIHeader - A responsive row of KPI metric cards for module overview pages.
 *
 * Renders a horizontal row of cards that wraps on smaller screens.
 * Each card displays a label, large formatted value, optional icon,
 * and optional trend indicator with directional arrow.
 */
export function KPIHeader({ kpis = [], currencyLabel = '' }) {
  if (kpis.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4 mb-6" role="group" aria-label="Key performance indicators">
      {kpis.map((kpi, index) => (
        <KPICard
          key={kpi.label || index}
          kpiKey={kpi.key}
          label={kpi.label}
          value={kpi.value}
          format={kpi.format}
          trend={kpi.trend}
          previousValue={kpi.previousValue}
          icon={kpi.icon}
          currencyLabel={currencyLabel}
          data-testid="KPICard__e18695" />
      ))}
    </div>
  );
}
