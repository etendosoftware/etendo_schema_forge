import { Link } from 'react-router-dom';
import { useUI } from '@/i18n';
import { useLocaleSwitch } from '@/i18n';
import { formatDashboardAmount, localeFromUi } from '@/lib/dashboardNumberFormat.js';
import { createDashboardNavigation, resolveDashboardNavigation } from '@/lib/dashboardNavigation.js';
import { DashboardCard, DashboardEmptyState } from './_shared';

function CountBadge({ count }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        minWidth: '27px',
        height: '24px',
        padding: '0 8px',
        background: 'hsl(var(--muted))',
        borderRadius: '8px',
        fontFamily: 'Inter',
        fontWeight: 400,
        fontSize: '12px',
        lineHeight: '16px',
        color: 'hsl(var(--muted-foreground))',
        whiteSpace: 'nowrap',
      }}
    >
      {count}
    </span>
  );
}

/**
 * ETP-5088 — `visibility` gates each half independently: the role matrix gives Sales the collect
 * side only (sales-invoice) and Purchasing the pay side only (purchase-invoice), while
 * Finance/Admin see both. When neither half is visible the caller does not render this card at
 * all, so both flags default to `true` here and every existing caller keeps its behaviour.
 */
export function CollectionsPaymentsCard({ pendingAmounts = {}, currencyLabel = '', visibility }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const numberLocale = localeFromUi(locale);

  const { toCollect = { count: 0, amount: 0 }, toPay = { count: 0, amount: 0 } } = pendingAmounts;
  const showToCollect = visibility?.toCollect ?? true;
  const showToPay = visibility?.toPay ?? true;
  // Only the halves this role may actually see count towards the empty state — otherwise a Sales
  // role with pending collections but hidden payments could still be told there is nothing here.
  const hasNoData = (!showToCollect || toCollect.count === 0) && (!showToPay || toPay.count === 0);

  // ETP-5012: this card shows the TOTAL pending balance (any due date), so it
  // must drill down into 'pending', not the now-stricter 'overdue' filter —
  // otherwise the list opened here would show fewer rows than this count.
  const toCollectTarget = resolveDashboardNavigation(
    toCollect.navigation ?? createDashboardNavigation({ type: 'list', window: 'sales-invoice', filter: 'pending' })
  ) || '/sales-invoice?filter=pending';

  const toPayTarget = resolveDashboardNavigation(
    toPay.navigation ?? createDashboardNavigation({ type: 'list', window: 'purchase-invoice', filter: 'pending' })
  ) || '/purchase-invoice?filter=pending';

  return (
    <DashboardCard
      title={ui('collectionsPaymentsTitle')}
      data-testid="DashboardCard__6b3617">
      {hasNoData ? (
        <DashboardEmptyState
          title={ui('collectionsPaymentsEmptyTitle')}
          subtitle={ui('collectionsPaymentsEmptySubtitle')}
          textPadding="0px 20px"
          data-testid="DashboardEmptyState__6b3617" />
      ) : (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '12px',
          width: '100%',
          flex: 1,
        }}
      >
        {showToCollect && (
        <Link
          to={toCollectTarget}
          className="hover:opacity-80 transition-opacity"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            gap: '8px',
            width: '189.33px',
            height: '60px',
            textDecoration: 'none',
          }}
          data-testid="Link__6b3617">
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '0px',
              gap: '4px',
              width: '189.33px',
              height: '24px',
            }}
          >
            <span
              style={{
                width: '70px',
                height: '20px',
                fontFamily: 'Inter',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '14px',
                lineHeight: '20px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--status-success-fg)',
              }}
            >
              {ui('toCollectLabel')}
            </span>
            <CountBadge count={toCollect.count} data-testid="CountBadge__6b3617" />
          </div>
          <div
            style={{
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '4px 8px',
              width: 'max-content',
              height: '28px',
              background: 'var(--status-success-bg)',
              border: '1px solid var(--status-success-border)',
              borderRadius: '8px',
              flex: 'none',
              order: 1,
              flexGrow: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                padding: '0px 4px',
                width: 'max-content',
                height: '20px',
                borderRadius: '0px',
                flex: 'none',
                order: 1,
                flexGrow: 0,
              }}
            >
              <span
                style={{
                  width: 'max-content',
                  height: '20px',
                  fontFamily: 'Inter',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '14px',
                  lineHeight: '20px',
                  color: 'var(--status-success-fg)',
                  whiteSpace: 'nowrap',
                  flex: 'none',
                  order: 0,
                  flexGrow: 0,
                }}
              >
                {formatDashboardAmount(toCollect.amount, currencyLabel, numberLocale)}
              </span>
            </div>
          </div>
        </Link>
        )}

        {showToCollect && showToPay && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'stretch',
            padding: '16px 0px',
            width: '100%',
            height: '32px',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '0px',
              borderTop: '1px solid hsl(var(--border-subtle))',
            }}
          />
        </div>
        )}

        {showToPay && (
        <Link
          to={toPayTarget}
          className="hover:opacity-80 transition-opacity"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            gap: '8px',
            width: '189.33px',
            height: '60px',
            textDecoration: 'none',
          }}
          data-testid="Link__6b3617">
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '0px',
              gap: '4px',
              width: '189.33px',
              height: '24px',
            }}
          >
            <span
              style={{
                width: '65px',
                height: '20px',
                fontFamily: 'Inter',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '14px',
                lineHeight: '20px',
                display: 'flex',
                alignItems: 'center',
                color: 'hsl(var(--destructive))',
              }}
            >
              {ui('toPayLabel')}
            </span>
            <CountBadge count={toPay.count} data-testid="CountBadge__6b3617" />
          </div>
          <div
            style={{
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '4px 8px',
              width: 'max-content',
              height: '28px',
              background: 'var(--status-destructive-bg)',
              border: '1px solid hsl(var(--destructive) / 0.3)',
              borderRadius: '8px',
              flex: 'none',
              order: 1,
              flexGrow: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                padding: '0px 4px',
                width: 'max-content',
                height: '20px',
                borderRadius: '0px',
                flex: 'none',
                order: 1,
                flexGrow: 0,
              }}
            >
              <span
                style={{
                  width: 'max-content',
                  height: '20px',
                  fontFamily: 'Inter',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '14px',
                  lineHeight: '20px',
                  color: 'hsl(var(--destructive))',
                  whiteSpace: 'nowrap',
                  flex: 'none',
                  order: 0,
                  flexGrow: 0,
                }}
              >
                {formatDashboardAmount(toPay.amount, currencyLabel, numberLocale)}
              </span>
            </div>
          </div>
        </Link>
        )}
      </div>
      )}
    </DashboardCard>
  );
}
