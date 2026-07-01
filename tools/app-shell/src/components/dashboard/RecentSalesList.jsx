import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Plus } from 'lucide-react';
import { useUI } from '@/i18n';
import { useLocaleSwitch } from '@/i18n';
import { useCopilot } from '@/components/CopilotContext';
import { formatDashboardAmount, localeFromUi } from '@/lib/dashboardNumberFormat.js';
import { resolveDashboardNavigation } from '@/lib/dashboardNavigation.js';
import { DASHBOARD_KPI_IDS, trackDashboardKpi } from '@/lib/dashboardKpiTelemetry.js';
import { DashboardCard, DashboardEmptyState, DashboardRowChevron } from './_shared';

const UUID_RE = /^[0-9A-F]{32}$/i;

function resolveDocumentNumber(inv) {
  return inv.documentNo || inv.document_no || inv.docNo || null;
}

export function RecentSalesList({ invoices = [], currencyLabel = '' }) {
  const ui = useUI();
  const navigate = useNavigate();
  const { locale } = useLocaleSwitch();
  const numberLocale = localeFromUi(locale);
  const { open: openCopilot } = useCopilot();

  return (
    <DashboardCard title={ui('recentSalesTitle')} data-testid="DashboardCard__4af5f2">
      {invoices.length === 0 ? (
        <DashboardEmptyState
          title={ui('recentSalesEmptyTitle')}
          subtitle={ui('recentSalesEmptySubtitle')}
          width="340px"
          actions={[
            { key: 'copilot', icon: Sparkles, label: ui('createWithCopilot'), onClick: openCopilot, variant: 'secondary' },
            { key: 'new', icon: Plus, label: ui('newSale'), onClick: () => navigate('/sales-invoice/new'), variant: 'primary' },
          ]}
          data-testid="DashboardEmptyState__4af5f2" />
      ) : (
      <div
        data-testid="recent-sales-list"
        className="dashboard-scroll"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '8px 0px',
          gap: '8px',
          width: '100%',
          flex: 1,
          overflowY: 'scroll',
        }}
      >
          {invoices.slice(0, 5).map((inv, i) => {
              const target = resolveDashboardNavigation(inv.navigation) || (inv.id ? `/sales-invoice/${inv.id}` : '/sales-invoice');
              const docNum = resolveDocumentNumber(inv);
              return (
                <Link
                  key={inv.id || i}
                  data-testid={`recent-sales-item-${inv.id || i}`}
                  to={target}
                  onClick={() => trackDashboardKpi('dashboard_document_opened', {
                    kpiId: DASHBOARD_KPI_IDS.dashboardToDocument,
                    entityType: 'sales_invoice',
                    source: 'dashboard_recent_sales',
                  })}
                  className="hover:bg-[#F5F7F9] transition-colors"
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: '4px 8px',
                    width: '100%',
                    height: '32px',
                    borderRadius: '0px',
                    textDecoration: 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '0px 16px 0px 8px',
                      height: '24px',
                      borderRadius: '0px',
                      flex: 1,
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
                      {inv.client}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      padding: '0px 8px 0px 0px',
                      height: '24px',
                      borderRadius: '0px',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: '4px 8px',
                        height: '24px',
                        background: '#F5F7F9',
                        borderRadius: '360px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          padding: '0px 2px',
                          height: '16px',
                          borderRadius: '0px',
                        }}
                      >
                        <span
                          style={{
                            height: '16px',
                            fontFamily: 'Inter',
                            fontStyle: 'normal',
                            fontWeight: 400,
                            fontSize: '12px',
                            lineHeight: '16px',
                            color: '#3F3F50',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {docNum || inv.documentNo || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      padding: '0px 8px 0px 0px',
                      height: '24px',
                      borderRadius: '0px',
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
                          height: '24px',
                          fontFamily: 'Inter',
                          fontStyle: 'normal',
                          fontWeight: 400,
                          fontSize: '12px',
                          lineHeight: '24px',
                          color: '#6C6C89',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatDashboardAmount(inv.amount, currencyLabel, numberLocale)}
                      </span>
                    </div>
                  </div>
                  <DashboardRowChevron data-testid="DashboardRowChevron__4af5f2" />
                </Link>
              );
            })
        }
      </div>
      )}
    </DashboardCard>
  );
}
