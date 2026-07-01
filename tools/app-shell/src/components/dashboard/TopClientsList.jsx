import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles, Plus } from 'lucide-react';
import { useUI } from '@/i18n';
import { useLocaleSwitch } from '@/i18n';
import { useCopilot } from '@/components/CopilotContext';
import { formatDashboardAmount, localeFromUi } from '@/lib/dashboardNumberFormat.js';
import { resolveDashboardNavigation } from '@/lib/dashboardNavigation.js';
import { DASHBOARD_KPI_IDS, trackDashboardKpi } from '@/lib/dashboardKpiTelemetry.js';

async function resolveClientRoute({ client, token, apiBaseUrl }) {
  const directRoute = resolveDashboardNavigation(client?.navigation);
  if (directRoute) return directRoute;
  if (client?.id) return `/contacts/${client.id}`;

  const name = String(client?.name ?? '').trim();
  if (!token || !apiBaseUrl || !name) return '/contacts';

  const criteria = encodeURIComponent(JSON.stringify({
    operator: 'and',
    criteria: [{ fieldName: 'name', operator: 'equals', value: name }],
  }));

  try {
    const res = await fetch(
      `${apiBaseUrl}/contacts/businessPartner?_sortBy=name asc&_startRow=0&_endRow=10&criteria=${criteria}`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) return '/contacts';
    const json = await res.json();
    const rows = json?.response?.data ?? [];
    const exact = rows.find((r) => String(r?.name ?? '').trim() === name) ?? rows[0] ?? null;
    return exact?.id ? `/contacts/${exact.id}` : '/contacts';
  } catch {
    return '/contacts';
  }
}

export function TopClientsList({ clients = [], currencyLabel = '', token = '', apiBaseUrl = '' }) {
  const ui = useUI();
  const navigate = useNavigate();
  const { locale } = useLocaleSwitch();
  const numberLocale = localeFromUi(locale);
  const { open: openCopilot } = useCopilot();

  const handleClick = async (client) => {
    trackDashboardKpi('dashboard_document_opened', {
      kpiId: DASHBOARD_KPI_IDS.dashboardToDocument,
      entityType: 'business_partner',
      source: 'dashboard_top_clients',
    });
    const route = await resolveClientRoute({ client, token, apiBaseUrl });
    navigate(route);
  };

  return (
    <div className="rounded-xl border overflow-hidden bg-white flex flex-col h-full" style={{ borderColor: '#E8EAEF' }}>
      {/* Cabecera */}
      <div
        className="flex items-center border-b"
        style={{ backgroundColor: '#F5F7F9', borderBottomColor: '#E8EAEF', padding: '8px 12px', minHeight: '48px' }}
      >
        <span className="text-xs font-medium uppercase" style={{ color: '#282833', letterSpacing: 0 }}>
          {ui('topClientsTitle')}
        </span>
      </div>
      {/* Info: padding 8px 0, gap 8px, overflow-y scroll */}
      {clients.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center" style={{ gap: '12px', width: '340px' }}>
            <div className="flex flex-col items-center" style={{ gap: '4px' }}>
              <p style={{ fontSize: '20px', fontWeight: 600, lineHeight: '28px', textAlign: 'center', color: '#121217' }}>
                {ui('topClientsEmptyTitle')}
              </p>
              <p style={{ fontSize: '12px', fontWeight: 400, lineHeight: '16px', textAlign: 'center', color: '#282833' }}>
                {ui('topClientsEmptySubtitle')}
              </p>
            </div>
            <div className="flex flex-row items-center" style={{ gap: '12px' }}>
              <button
                type="button"
                onClick={openCopilot}
                className="flex items-center justify-center"
                style={{ padding: '4px 8px', height: '32px', background: '#FFFFFF', border: '1px solid #D1D4DB', boxShadow: '0px 1px 2px rgba(18,18,23,0.05)', borderRadius: '8px', gap: '4px', cursor: 'pointer' }}
              >
                <Sparkles
                  style={{ width: '20px', height: '20px', color: '#828FA3' }}
                  data-testid="Sparkles__2d735a" />
                <span style={{ fontSize: '14px', fontWeight: 500, lineHeight: '24px', color: '#121217' }}>
                  {ui('createWithCopilot')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/contacts/new')}
                className="flex items-center justify-center"
                style={{ padding: '4px 8px', height: '32px', background: '#121217', borderRadius: '8px', gap: '4px', cursor: 'pointer', border: 'none' }}
              >
                <Plus
                  style={{ width: '20px', height: '20px', color: 'rgba(255,255,255,0.9)' }}
                  data-testid="Plus__2d735a" />
                <span style={{ fontSize: '14px', fontWeight: 500, lineHeight: '24px', color: '#FFFFFF' }}>
                  {ui('newClient')}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="dashboard-scroll" style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
          {clients.slice(0, 5).map((c, i) => (
            <button
              key={c.name || i}
              type="button"
              onClick={() => handleClick(c)}
              className="bg-transparent hover:bg-[#F5F7F9] transition-colors w-full text-left"
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '4px 8px', height: '32px', border: 'none', cursor: 'pointer' }}
            >
              {/* Value: nombre del cliente, padding 0 16px 0 8px, flex-grow */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 16px 0 8px', flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 400, fontSize: '14px', lineHeight: '24px', color: '#121217', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {c.name}
                </span>
              </div>

              {/* Keyboard Shortcut: badge con monto */}
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', padding: '0 8px 0 0', flexShrink: 0 }}>
                <span style={{ display: 'inline-flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: '0 8px', height: '24px', border: '1px solid #D1D4DB', borderRadius: '360px', fontSize: '12px', fontWeight: 400, lineHeight: '24px', color: '#6C6C89', whiteSpace: 'nowrap' }}>
                  {formatDashboardAmount(c.total, currencyLabel, numberLocale)}
                </span>
              </div>

              {/* Trailing: chevron 24x24, padding 0 4px 0 0 */}
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', padding: '0 4px 0 0', width: '28px', height: '24px', flexShrink: 0 }}>
                <ChevronRight
                  style={{ width: '16px', height: '16px', color: '#828FA3' }}
                  data-testid="ChevronRight__2d735a" />
              </div>
            </button>
          ))
        }
        </div>
      )}
    </div>
  );
}
