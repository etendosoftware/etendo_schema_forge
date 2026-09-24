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

/**
 * ETP-5088 — `canCreateSale` gates the empty state's creation CTAs (including "create with Copilot",
 * whose only purpose here is to create that same record). They are creation actions, so they need
 * the WRITE tier on the target window, not mere visibility. Defaults to `true` so existing callers
 * and tests keep their behaviour; `DashboardPage` passes the resolved value.
 */
export function RecentSalesList({ invoices = [], currencyLabel = '', canCreateSale = true }) {
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
          actions={canCreateSale ? [
            { key: 'copilot', icon: Sparkles, label: ui('createWithCopilot'), onClick: openCopilot, variant: 'secondary' },
            { key: 'new', icon: Plus, label: ui('newSale'), onClick: () => navigate('/sales-invoice/new'), variant: 'primary' },
          ] : []}
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
                  className="hover:bg-[hsl(var(--muted))] transition-colors"
                  style={{
                    display: 'grid',
                    // ETP-5367 — fixed-column layout: the client-name column is the only
                    // flexible track (minmax(0, 1fr) lets it shrink below content size so
                    // the ellipsis below can actually engage); document-number and amount
                    // are fixed-width tracks so they always land at the same horizontal
                    // position regardless of client-name length or digit count.
                    gridTemplateColumns: 'minmax(0, 1fr) 96px 112px 28px',
                    alignItems: 'center',
                    columnGap: '8px',
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
                      padding: '0px 0px 0px 8px',
                      height: '24px',
                      borderRadius: '0px',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        height: '24px',
                        fontFamily: 'Inter',
                        fontStyle: 'normal',
                        fontWeight: 400,
                        fontSize: '14px',
                        lineHeight: '24px',
                        color: 'hsl(var(--foreground))',
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
                      justifyContent: 'flex-start',
                      height: '24px',
                      borderRadius: '0px',
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: '4px 8px',
                        height: '24px',
                        background: 'hsl(var(--muted))',
                        borderRadius: '360px',
                        maxWidth: '100%',
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
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            height: '16px',
                            fontFamily: 'Inter',
                            fontStyle: 'normal',
                            fontWeight: 400,
                            fontSize: '12px',
                            lineHeight: '16px',
                            color: 'hsl(var(--muted-foreground))',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
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
                      justifyContent: 'flex-end',
                      height: '24px',
                      borderRadius: '0px',
                      minWidth: 0,
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
                        border: '1px solid hsl(var(--border-control))',
                        borderRadius: '360px',
                        maxWidth: '100%',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          height: '24px',
                          fontFamily: 'Inter',
                          fontStyle: 'normal',
                          fontWeight: 400,
                          fontSize: '12px',
                          lineHeight: '24px',
                          color: 'hsl(var(--muted-foreground))',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
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
