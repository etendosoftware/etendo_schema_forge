import { useNavigate } from 'react-router-dom';
import { Check, ArrowUp, ArrowDown, X, Plus } from 'lucide-react';
import { useUI } from '@/i18n';
import { useLocaleSwitch } from '@/i18n';
import { formatDashboardCompact, localeFromUi } from '@/lib/dashboardNumberFormat.js';

export function FinancialSummaryCard({ kpis = [], currencyLabel = '' }) {
  const ui = useUI();
  const navigate = useNavigate();
  const { locale } = useLocaleSwitch();
  const numberLocale = localeFromUi(locale);

  function getMetricValueTypography(value) {
    const length = String(value ?? '').replace(/^-/, '').length;

    if (length >= 12) {
      return { fontSize: '20px', lineHeight: '24px' };
    }

    if (length >= 10) {
      return { fontSize: '24px', lineHeight: '28px' };
    }

    return { fontSize: '30px', lineHeight: '32px' };
  }

  const revenue  = kpis.find((k) => k.key === 'revenueThisMonth');
  const expenses = kpis.find((k) => k.key === 'expensesThisMonth');
  const profit   = kpis.find((k) => k.key === 'netProfit');

  // ETP-5011: the headline (icon + color + copy) used to be hardcoded to the
  // "positive" state regardless of the actual profit sign — a client whose
  // expenses exceeded revenue still saw a green checkmark saying revenue beat
  // expenses. Drive it off the real netProfit value instead.
  const isProfitNegative = (profit?.value ?? 0) < 0;

  const metrics = [
    { key: 'revenueThisMonth',  kpi: revenue,  labelKey: 'financialSummaryIncome' },
    { key: 'expensesThisMonth', kpi: expenses, labelKey: 'financialSummaryExpenses' },
    { key: 'netProfit',         kpi: profit,   labelKey: 'financialSummaryProfit' },
  ];

  return (
    <div
      className="flex flex-col items-start overflow-hidden bg-card"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        minWidth: 0,
        padding: '0px',
        border: '1px solid hsl(var(--border-subtle))',
        borderRadius: '8px',
      }}
    >
      <div
        className="flex flex-row items-center justify-between self-stretch"
        style={{
          boxSizing: 'border-box',
          width: '100%',
          height: '48px',
          padding: '8px 12px',
          gap: '16px',
          backgroundColor: 'hsl(var(--muted))',
          borderBottom: '1px solid hsl(var(--border-subtle))',
        }}
      >
        <span
          style={{
            height: '16px',
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fontWeight: 500,
            fontSize: '12px',
            lineHeight: '16px',
            color: 'hsl(var(--foreground))',
            whiteSpace: 'nowrap',
          }}
        >
          {ui('financialSummaryTitle')}
        </span>
      </div>
      {kpis.length === 0 ? (
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="flex flex-col items-center" style={{ gap: '12px' }}>
            <div className="flex flex-col items-center" style={{ gap: '4px' }}>
              <p style={{ width: '340px', fontSize: '20px', fontWeight: 600, lineHeight: '28px', textAlign: 'center', color: 'hsl(var(--foreground))' }}>
                {ui('financialSummaryEmptyTitle')}
              </p>
              <p style={{ fontSize: '12px', fontWeight: 400, lineHeight: '16px', textAlign: 'center', color: 'hsl(var(--foreground))' }}>
                {ui('financialSummaryEmptySubtitle')}
              </p>
            </div>
            <div className="flex flex-row items-center" style={{ gap: '12px' }}>
              <button
                type="button"
                onClick={() => navigate('/purchase-invoice/new')}
                className="flex items-center justify-center"
                style={{ padding: '4px 8px', height: '32px', background: 'hsl(var(--foreground))', borderRadius: '8px', gap: '4px', cursor: 'pointer', border: 'none' }}
              >
                <Plus
                  style={{ width: '20px', height: '20px', color: 'hsl(var(--background) / 0.9)' }}
                  data-testid="Plus__81e75f" />
                <span style={{ fontSize: '14px', fontWeight: 500, lineHeight: '24px', color: 'hsl(var(--card))' }}>
                  {ui('newPurchase')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/sales-invoice/new')}
                className="flex items-center justify-center"
                style={{ padding: '4px 8px', height: '32px', background: 'hsl(var(--foreground))', borderRadius: '8px', gap: '4px', cursor: 'pointer', border: 'none' }}
              >
                <Plus
                  style={{ width: '20px', height: '20px', color: 'hsl(var(--background) / 0.9)' }}
                  data-testid="Plus__81e75f" />
                <span style={{ fontSize: '14px', fontWeight: 500, lineHeight: '24px', color: 'hsl(var(--card))' }}>
                  {ui('newSale')}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
      <div
        className="flex flex-1 flex-col items-start justify-center"
        style={{
          width: '100%',
          height: '186px',
          padding: '12px 16px 20px',
          gap: '4px',
        }}
      >
        <div
          className="flex flex-row items-center"
          style={{
            width: '100%',
            height: '20px',
            padding: '0px',
            gap: '8px',
          }}
        >
          <div
            className="flex flex-row items-center justify-center"
            style={{
              width: '20px',
              height: '20px',
              flexShrink: 0,
              padding: '0px',
              backgroundColor: isProfitNegative ? 'var(--status-destructive-bg)' : 'var(--status-success-bg)',
              borderRadius: '10px',
            }}
          >
            {isProfitNegative ? (
              <X
                style={{ width: '12.5px', height: '12.5px', color: 'hsl(var(--destructive))' }}
                data-testid="X__81e75f" />
            ) : (
              <Check
                style={{ width: '12.5px', height: '12.5px', color: 'var(--status-success-fg)' }}
                data-testid="Check__81e75f" />
            )}
          </div>
          <span
            style={{
              flex: 1,
              height: '16px',
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '16px',
              color: isProfitNegative ? 'hsl(var(--destructive))' : 'var(--status-success-fg)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ui(isProfitNegative ? 'financialSummaryNegative' : 'financialSummaryPositive')}
          </span>
        </div>

        <div
          className="flex flex-col items-start lg:flex-row lg:items-center"
          style={{
            width: '100%',
            height: '130px',
            padding: '0px',
            gap: '20px',
          }}
        >
          {metrics.map(({ key, kpi, labelKey }) => {
            const trend = kpi?.trend ?? 0;
            const trendPositive = trend >= 0;
            const pct = Math.abs(trend).toFixed(0);
            const trendLabel = ui(trendPositive ? 'yoyUp' : 'yoyDown')
              .replace('{pct}', pct)
              .replace(/^[↑↓]\s*/, '');
            const TrendIcon = trendPositive ? ArrowUp : ArrowDown;
            const formattedValue = kpi ? formatDashboardCompact(kpi.value, { currencyLabel, locale: numberLocale }) : '—';
            const valueTypography = getMetricValueTypography(formattedValue);
            const badgeStyle = trendPositive
              ? { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success-fg)' }
              : { backgroundColor: 'var(--status-destructive-bg)', color: 'hsl(var(--destructive))' };

            return (
              <div
                key={key}
                className="flex flex-col justify-center items-start self-stretch"
                style={{
                  minWidth: 0,
                  height: '130px',
                  padding: '0px',
                  gap: '8px',
                  filter: 'drop-shadow(0px 1px 2px hsl(var(--foreground) / 0.05))',
                  borderRadius: '8px',
                  alignSelf: 'stretch',
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                }}
              >
                <div className="flex flex-row items-start self-stretch" style={{ width: '100%', height: '24px' }}>
                  <span
                    style={{
                      height: '20px',
                      fontSize: '14px',
                      fontWeight: 400,
                      lineHeight: '20px',
                      color: 'hsl(var(--muted-foreground))',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ui(labelKey)}
                  </span>
                </div>
                <div className="flex flex-col items-start" style={{ width: '100%', gap: '8px' }}>
                  <span
                    style={{
                      display: 'block',
                      height: '32px',
                      ...valueTypography,
                      fontWeight: 500,
                      color: 'hsl(var(--foreground))',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%',
                    }}
                  >
                    {formattedValue}
                  </span>
                  <span
                    className="inline-flex items-center gap-1"
                    style={{
                      height: '24px',
                      padding: '4px 8px',
                      borderRadius: '360px',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      ...badgeStyle,
                    }}
                  >
                    <TrendIcon
                      style={{ width: '16px', height: '16px', flexShrink: 0 }}
                      data-testid="TrendIcon__81e75f" />
                    <span
                      style={{
                        fontSize: '12px',
                        lineHeight: '16px',
                        color: badgeStyle.color,
                        fontWeight: 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0,
                      }}
                    >
                      {trendLabel}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
