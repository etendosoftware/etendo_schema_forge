import { useNavigate } from 'react-router-dom';
import { Check, ArrowUp, ArrowDown, Plus } from 'lucide-react';
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

  const metrics = [
    { key: 'revenueThisMonth',  kpi: revenue,  labelKey: 'financialSummaryIncome' },
    { key: 'expensesThisMonth', kpi: expenses, labelKey: 'financialSummaryExpenses' },
    { key: 'netProfit',         kpi: profit,   labelKey: 'financialSummaryProfit' },
  ];

  return (
    <div
      className="flex flex-col items-start overflow-hidden bg-white"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        minWidth: 0,
        padding: '0px',
        border: '1px solid #E8EAEF',
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
          backgroundColor: '#F5F7F9',
          borderBottom: '1px solid #E8EAEF',
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
            color: '#282833',
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
              <p style={{ width: '340px', fontSize: '20px', fontWeight: 600, lineHeight: '28px', textAlign: 'center', color: '#121217' }}>
                {ui('financialSummaryEmptyTitle')}
              </p>
              <p style={{ fontSize: '12px', fontWeight: 400, lineHeight: '16px', textAlign: 'center', color: '#282833' }}>
                {ui('financialSummaryEmptySubtitle')}
              </p>
            </div>
            <div className="flex flex-row items-center" style={{ gap: '12px' }}>
              <button
                type="button"
                onClick={() => navigate('/purchase-invoice/new')}
                className="flex items-center justify-center"
                style={{ padding: '4px 8px', height: '32px', background: '#121217', borderRadius: '8px', gap: '4px', cursor: 'pointer', border: 'none' }}
              >
                <Plus
                  style={{ width: '20px', height: '20px', color: 'rgba(255,255,255,0.9)' }}
                  data-testid="Plus__81e75f" />
                <span style={{ fontSize: '14px', fontWeight: 500, lineHeight: '24px', color: '#FFFFFF' }}>
                  {ui('newPurchase')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/sales-invoice/new')}
                className="flex items-center justify-center"
                style={{ padding: '4px 8px', height: '32px', background: '#121217', borderRadius: '8px', gap: '4px', cursor: 'pointer', border: 'none' }}
              >
                <Plus
                  style={{ width: '20px', height: '20px', color: 'rgba(255,255,255,0.9)' }}
                  data-testid="Plus__81e75f" />
                <span style={{ fontSize: '14px', fontWeight: 500, lineHeight: '24px', color: '#FFFFFF' }}>
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
              backgroundColor: '#EEFBF4',
              borderRadius: '10px',
            }}
          >
            <Check
              style={{ width: '12.5px', height: '12.5px', color: '#17663A' }}
              data-testid="Check__81e75f" />
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
              color: '#17663A',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ui('financialSummaryPositive')}
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
              ? { backgroundColor: '#EEFBF4', color: '#17663A' }
              : { backgroundColor: '#FEF0F4', color: '#D50B3E' };

            return (
              <div
                key={key}
                className="flex flex-col justify-center items-start self-stretch"
                style={{
                  minWidth: 0,
                  height: '130px',
                  padding: '0px',
                  gap: '8px',
                  filter: 'drop-shadow(0px 1px 2px rgba(18, 18, 23, 0.05))',
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
                      color: '#3F3F50',
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
                      color: '#121217',
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
