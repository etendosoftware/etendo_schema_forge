import { useNavigate } from 'react-router-dom';
import { Check, ArrowUp, ArrowDown, X, Plus, Minus } from 'lucide-react';
import { useUI } from '@/i18n';
import { useLocaleSwitch } from '@/i18n';
import { formatDashboardCompact, localeFromUi } from '@/lib/dashboardNumberFormat.js';
import { formatTrendPct, trendDirection } from '@/lib/dashboardTrendPct.js';
import { resolveRangeCopySuffix } from '@/lib/dashboardRangeCopy.js';

// ETP-5493: the card follows the dashboard period selector. The range -> copy suffix mapping is
// shared with the trend chart (`lib/dashboardRangeCopy.js`). Mirrors the backend
// (`WidgetKpisHandler`): a missing/blank range means year-to-date (the default), while an unknown
// non-blank value is resolved like the other widgets, i.e. the rolling last 12 months.

// ETP-5493: amounts below half a cent are floating noise, not a real profit or loss.
const ZERO_EPSILON = 0.005;
const isZero = (value) => Math.abs(value ?? 0) < ZERO_EPSILON;

// Headline variants. `tone` drives icon + colours; `neutral` is used when net is zero, where
// neither the green check nor the red X would be truthful.
const HEADLINES = {
  positive: { key: 'financialSummaryPositive', tone: 'positive' },
  negative: { key: 'financialSummaryNegative', tone: 'negative' },
  noActivity: { key: 'financialSummaryNoActivity', tone: 'neutral' },
  breakEven: { key: 'financialSummaryBreakEven', tone: 'neutral' },
};

const HEADLINE_TONES = {
  positive: { bg: 'var(--status-success-bg)', fg: 'var(--status-success-fg)', Icon: Check, testId: 'Check__81e75f' },
  negative: { bg: 'var(--status-destructive-bg)', fg: 'hsl(var(--destructive))', Icon: X, testId: 'X__81e75f' },
  neutral: { bg: 'hsl(var(--muted))', fg: 'hsl(var(--muted-foreground))', Icon: Minus, testId: 'Minus__81e75f' },
};

/**
 * ETP-5011 + ETP-5493: picks the headline from the real net (`netProfit`). Zero is its own
 * state: no income/expenses at all, or income equal to expenses.
 */
function pickHeadline({ revenue, expenses, profit }) {
  // The netProfit KPI is the source of truth; if it is absent, derive net from the other two.
  const net = profit?.value ?? ((revenue?.value ?? 0) - (expenses?.value ?? 0));
  if (isZero(net)) {
    return isZero(revenue?.value) && isZero(expenses?.value) ? HEADLINES.noActivity : HEADLINES.breakEven;
  }
  return net < 0 ? HEADLINES.negative : HEADLINES.positive;
}

/**
 * ETP-5493 — `range` is the period the `kpis` were fetched for; it only selects the copy
 * ("this month", "vs previous 30 days"). A KPI with `hasPrevious === false` has an empty
 * comparison period, so its trend badge is hidden rather than showing a meaningless "0%".
 *
 * ETP-5088 — `canCreatePurchase`/`canCreateSale` gate the two creation buttons in the empty state.
 * They are creation actions like the quick actions, so they need the WRITE tier on their target
 * window, not mere visibility: a role holding purchase-invoice read-only must not be offered
 * "new purchase" and then land on a form it cannot submit.
 *
 * Both default to `true` so every existing caller and test keeps its behaviour; `DashboardPage`
 * passes the resolved values.
 */
export function FinancialSummaryCard({
  kpis = [], currencyLabel = '', canCreatePurchase = true, canCreateSale = true, range,
}) {
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

  const rangeSuffix = resolveRangeCopySuffix(range);
  const periodText = ui(`financialSummaryPeriod${rangeSuffix}`);
  const comparisonText = ui(`financialSummaryComparison${rangeSuffix}`);

  const revenue  = kpis.find((k) => k.key === 'revenueThisMonth');
  const expenses = kpis.find((k) => k.key === 'expensesThisMonth');
  const profit   = kpis.find((k) => k.key === 'netProfit');

  // ETP-5011: the headline (icon + color + copy) used to be hardcoded to the
  // "positive" state regardless of the actual profit sign — a client whose
  // expenses exceeded revenue still saw a green checkmark saying revenue beat
  // expenses. Drive it off the real netProfit value instead.
  const headline = pickHeadline({ revenue, expenses, profit });
  const headlineTone = HEADLINE_TONES[headline.tone];
  const HeadlineIcon = headlineTone.Icon;

  const metrics = [
    { key: 'revenueThisMonth',  kpi: revenue,  labelKey: 'financialSummaryIncome' },
    { key: 'expensesThisMonth', kpi: expenses, labelKey: 'financialSummaryExpenses', lowerIsBetter: true },
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
              {canCreatePurchase && (
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
              )}
              {canCreateSale && (
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
              )}
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
              backgroundColor: headlineTone.bg,
              borderRadius: '10px',
            }}
          >
            <HeadlineIcon
              style={{ width: '12.5px', height: '12.5px', color: headlineTone.fg }}
              data-testid={headlineTone.testId} />
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
              color: headlineTone.fg,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ui(headline.key, { period: periodText })}
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
          {metrics.map(({ key, kpi, labelKey, lowerIsBetter = false }) => {
            const trend = kpi?.trend ?? 0;
            // Direction (arrow + yoyUp/yoyDown copy) follows the sign of the number; tone
            // (green/red) is inverted for lower-is-better KPIs such as expenses, where a
            // decrease is the good outcome. A flat trend (rounded 0, see `trendDirection`) keeps
            // the neutral (positive) tone and the "up" arrow/copy.
            const direction = trendDirection(trend);
            const trendPositive = direction !== 'down';
            const toneGood = lowerIsBetter && direction !== 'flat' ? !trendPositive : trendPositive;
            const pct = formatTrendPct(trend);
            const showTrend = kpi?.hasPrevious !== false;
            const trendLabel = ui(trendPositive ? 'yoyUp' : 'yoyDown', { pct, comparison: comparisonText })
              .replace(/^[↑↓]\s*/, '');
            const TrendIcon = trendPositive ? ArrowUp : ArrowDown;
            const formattedValue = kpi ? formatDashboardCompact(kpi.value, { currencyLabel, locale: numberLocale }) : '—';
            const valueTypography = getMetricValueTypography(formattedValue);
            const badgeStyle = toneGood
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
                  {showTrend ? (
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
                  ) : (
                    // Empty comparison period: neutral muted text, same box as the badge so the
                    // card height stays constant. No pill background, no arrow.
                    <span
                      data-testid="financial-summary-no-trend"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        height: '24px',
                        padding: '4px 8px',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        fontSize: '12px',
                        lineHeight: '16px',
                        fontWeight: 400,
                        color: 'hsl(var(--muted-foreground))',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ui('financialSummaryNoPrevious')}
                    </span>
                  )}
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
