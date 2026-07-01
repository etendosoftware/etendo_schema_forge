import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Check, Minus, Sparkles, Plus } from 'lucide-react';
import { useUI } from '@/i18n';
import { useLocaleSwitch } from '@/i18n';
import { useCopilot } from '@/components/CopilotContext';
import { formatDashboardAmount, formatDashboardNumber, localeFromUi } from '@/lib/dashboardNumberFormat.js';
import { DASHBOARD_KPI_IDS, trackDashboardKpi } from '@/lib/dashboardKpiTelemetry.js';
import { DashboardCard, DashboardEmptyState, DashboardRowChevron } from './_shared';

function TrendPill({ pct }) {
  if (pct === null || pct === undefined) return null;
  const isUp = pct > 0;
  const isFlat = pct === 0;
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium"
      style={isFlat
        ? { backgroundColor: '#F5F7F9', color: '#6C6C89' }
        : isUp
          ? { backgroundColor: '#EEFBF4', color: '#17663A' }
          : { backgroundColor: '#FEF0F4', color: '#D50B3E' }}
    >
      <Icon className="h-3 w-3" data-testid="Icon__4d53b7" />
      {isUp ? '+' : ''}{pct}%
          </span>
  );
}

const BTN_SHADOW = '0px 1px 3px rgba(18, 18, 23, 0.1), 0px 1px 2px rgba(18, 18, 23, 0.06)';

function ViewToggle({ viewMode, onToggle, ui }) {
  const isQty = viewMode === 'quantity';
  const isRev = viewMode === 'revenue';
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '4px', gap: '4px', width: '175.33px', height: '40px', background: '#F5F7F9', borderRadius: '12px', flex: 'none', order: 1, flexGrow: 0 }}>
      <button type="button" onClick={() => onToggle('quantity')} style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: '4px 8px', width: '81.33px', height: '32px', background: isQty ? '#FFFFFF' : 'transparent', boxShadow: isQty ? BTN_SHADOW : 'none', borderRadius: '8px', flex: 'none', order: 0, flexGrow: 0, border: 'none', cursor: 'pointer' }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', padding: '0px 4px', width: '72px', height: '24px', flex: 'none', order: 1, flexGrow: 0 }}>
          <span style={{ width: '64px', height: '24px', fontFamily: 'Inter', fontStyle: 'normal', fontWeight: 500, fontSize: '14px', lineHeight: '24px', color: isQty ? '#121217' : '#6C6C89', flex: 'none', order: 0, flexGrow: 0 }}>
            {ui('bestProductsToggleUnits')}
          </span>
        </div>
      </button>
      <button type="button" onClick={() => onToggle('revenue')} style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: '4px 8px', width: '82px', height: '32px', background: isRev ? '#FFFFFF' : 'transparent', boxShadow: isRev ? BTN_SHADOW : 'none', borderRadius: '8px', flex: 'none', order: 1, flexGrow: 0, border: 'none', cursor: 'pointer' }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', padding: '0px 4px', width: '66px', height: '24px', flex: 'none', order: 1, flexGrow: 0 }}>
          <span style={{ width: '58px', height: '24px', fontFamily: 'Inter', fontStyle: 'normal', fontWeight: 500, fontSize: '14px', lineHeight: '24px', color: isRev ? '#121217' : '#6C6C89', flex: 'none', order: 0, flexGrow: 0 }}>
            {ui('bestProductsToggleRevenue')}
          </span>
        </div>
      </button>
    </div>
  );
}

export function BestProductsList({ sellers = [], products = [], currencyLabel = '' }) {
  const ui = useUI();
  const navigate = useNavigate();
  const { locale } = useLocaleSwitch();
  const numberLocale = localeFromUi(locale);
  const { open: openCopilot } = useCopilot();
  const [viewMode, setViewMode] = useState('quantity');

  const hasNoData = sellers.length === 0 && products.length === 0;
  const rows = viewMode === 'quantity' ? sellers : products;
  const hasPositiveTrend = rows.some((r) => (r.trendPct ?? 0) > 0);
  const hasNegativeTrend = !hasPositiveTrend && rows.some((r) => (r.trendPct ?? 0) < 0);

  return (
    <DashboardCard title={ui('bestProductsTitle')} data-testid="DashboardCard__4d53b7">
      {hasNoData ? (
        <DashboardEmptyState
          title={ui('bestProductsEmptyTitle')}
          subtitle={ui('bestProductsEmptySubtitle')}
          width="340px"
          actions={[
            { key: 'copilot', icon: Sparkles, label: ui('createWithCopilot'), onClick: openCopilot, variant: 'secondary' },
            { key: 'new', icon: Plus, label: ui('newSale'), onClick: () => navigate('/sales-invoice/new'), variant: 'primary' },
          ]}
          data-testid="DashboardEmptyState__4d53b7" />
      ) : (<>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px 0px',
          gap: '20px',
          width: '100%',
          height: '48px',
          flex: 'none',
          order: 1,
          alignSelf: 'stretch',
          flexGrow: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', height: '24px' }}>
          {hasPositiveTrend && (
            <div className="flex items-center gap-2 text-xs" style={{ color: '#1E874C' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '20px', height: '20px', background: '#EEFBF4', borderRadius: '10px', flexShrink: 0 }}>
                <Check
                  style={{ width: '12.5px', height: '12.5px', color: '#17663A' }}
                  data-testid="Check__4d53b7" />
              </div>
              <span>{ui('bestProductsTrendPositive')}</span>
            </div>
          )}
          {hasNegativeTrend && (
            <div className="flex items-center gap-2 text-xs" style={{ color: '#D50B3E' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '20px', height: '20px', background: '#FEF0F4', borderRadius: '10px', flexShrink: 0 }}>
                <TrendingDown
                  style={{ width: '12.5px', height: '12.5px', color: '#D50B3E' }}
                  data-testid="TrendingDown__4d53b7" />
              </div>
              <span>{ui('bestProductsTrendNegative')}</span>
            </div>
          )}
        </div>
        
        <ViewToggle
          viewMode={viewMode}
          onToggle={setViewMode}
          ui={ui}
          data-testid="ViewToggle__4d53b7" />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '8px 0px',
          gap: '8px',
          width: '100%',
          flex: 'none',
          order: 2,
          alignSelf: 'stretch',
          flexGrow: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: '#828FA3', padding: '0 12px' }}>{ui('noDataAvailable')}</p>
        ) : (
          rows.map((row, i) => {
            const value = viewMode === 'quantity'
              ? formatDashboardNumber(row.qty, numberLocale)
              : formatDashboardAmount(row.amount, currencyLabel, numberLocale);
            return (
              <div
                key={`${viewMode}-${row.name}-${i}`}
                onClick={() => {
                  if (!row.id) return;
                  trackDashboardKpi('dashboard_document_opened', {
                    kpiId: DASHBOARD_KPI_IDS.dashboardToDocument,
                    entityType: 'product',
                    source: 'dashboard_best_products',
                  });
                  navigate(`/product/${row.id}`);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: '4px 8px',
                  width: '100%',
                  height: '32px',
                  borderRadius: '0px',
                  flex: 'none',
                  order: i,
                  alignSelf: 'stretch',
                  flexGrow: 0,
                  cursor: row.id ? 'pointer' : 'default',
                }}
                className="hover:bg-muted/50 transition-colors"
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '0px 16px 0px 8px',
                    height: '24px',
                    borderRadius: '0px',
                    flex: '1 1 0',
                    order: 0,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      height: '24px',
                      fontFamily: 'Inter',
                      fontStyle: 'normal',
                      fontWeight: 400,
                      fontSize: '14px',
                      lineHeight: '24px',
                      color: '#121217',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%',
                    }}
                  >
                    {row.name}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: '0px 8px 0px 0px',
                    height: '24px',
                    flex: 'none',
                    flexGrow: 0,
                  }}
                >
                  <TrendPill pct={row.trendPct ?? null} data-testid="TrendPill__4d53b7" />
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    padding: '0px 8px 0px 0px',
                    height: '24px',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: '0px 8px',
                      height: '24px',
                      border: '1px solid #D1D4DB',
                      borderRadius: '360px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 400,
                        lineHeight: '24px',
                        color: '#6C6C89',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {value}
                    </span>
                  </div>
                </div>
                <DashboardRowChevron data-testid="DashboardRowChevron__4d53b7" />
              </div>
            );
          })
        )}
      </div>
      </>)}
    </DashboardCard>
  );
}
