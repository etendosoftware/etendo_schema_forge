import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles, Plus } from 'lucide-react';
import { useUI } from '@/i18n';
import { useLocaleSwitch } from '@/i18n';
import { useCopilot } from '@/components/CopilotContext';
import { formatDashboardAmount, localeFromUi } from '@/lib/dashboardNumberFormat.js';
import { resolveDashboardNavigation } from '@/lib/dashboardNavigation.js';
import { DASHBOARD_KPI_IDS, trackDashboardKpi } from '@/lib/dashboardKpiTelemetry.js';
import { jsonHeaders } from '../../lib/sessionHeaders.js';

async function resolveClientRoute({ client, apiBaseUrl }) {
  const directRoute = resolveDashboardNavigation(client?.navigation);
  if (directRoute) return directRoute;
  if (client?.id) return `/contacts/${client.id}`;

  const name = String(client?.name ?? '').trim();
  // ETP-4576 — the dropped `!token` conjunct was permanently true under the
  // cookie scheme, so a client with no id always fell back to the bare
  // /contacts list instead of resolving to the partner's own record.
  if (!apiBaseUrl || !name) return '/contacts';

  const criteria = encodeURIComponent(JSON.stringify({
    operator: 'and',
    criteria: [{ fieldName: 'name', operator: 'equals', value: name }],
  }));

  try {
    const res = await fetch(
      `${apiBaseUrl}/contacts/businessPartner?_sortBy=name asc&_startRow=0&_endRow=10&criteria=${criteria}`,
      { headers: jsonHeaders() }
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

export function TopClientsList({ clients = [], currencyLabel = '', apiBaseUrl = '' }) {
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
    const route = await resolveClientRoute({ client, apiBaseUrl });
    navigate(route);
  };

  return (
    <div className="rounded-xl border overflow-hidden bg-card flex flex-col h-full" style={{ borderColor: 'hsl(var(--border-subtle))' }}>
      {/* Cabecera */}
      <div
        className="flex items-center border-b"
        style={{ backgroundColor: 'hsl(var(--muted))', borderBottomColor: 'hsl(var(--border-subtle))', padding: '8px 12px', minHeight: '48px' }}
      >
        <span className="text-xs font-medium uppercase" style={{ color: 'hsl(var(--foreground))', letterSpacing: 0 }}>
          {ui('topClientsTitle')}
        </span>
      </div>
      {/* Info: padding 8px 0, gap 8px, overflow-y scroll */}
      {clients.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center" style={{ gap: '12px', width: '340px' }}>
            <div className="flex flex-col items-center" style={{ gap: '4px' }}>
              <p style={{ fontSize: '20px', fontWeight: 600, lineHeight: '28px', textAlign: 'center', color: 'hsl(var(--foreground))' }}>
                {ui('topClientsEmptyTitle')}
              </p>
              <p style={{ fontSize: '12px', fontWeight: 400, lineHeight: '16px', textAlign: 'center', color: 'hsl(var(--foreground))' }}>
                {ui('topClientsEmptySubtitle')}
              </p>
            </div>
            <div className="flex flex-row items-center" style={{ gap: '12px' }}>
              <button
                type="button"
                onClick={openCopilot}
                className="flex items-center justify-center"
                style={{ padding: '4px 8px', height: '32px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', borderRadius: '8px', gap: '4px', cursor: 'pointer' }}
              >
                <Sparkles
                  style={{ width: '20px', height: '20px', color: 'hsl(var(--text-disabled))' }}
                  data-testid="Sparkles__2d735a" />
                <span style={{ fontSize: '14px', fontWeight: 500, lineHeight: '24px', color: 'hsl(var(--foreground))' }}>
                  {ui('createWithCopilot')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/contacts/new')}
                className="flex items-center justify-center"
                style={{ padding: '4px 8px', height: '32px', background: 'hsl(var(--foreground))', borderRadius: '8px', gap: '4px', cursor: 'pointer', border: 'none' }}
              >
                <Plus
                  style={{ width: '20px', height: '20px', color: 'hsl(var(--background) / 0.9)' }}
                  data-testid="Plus__2d735a" />
                <span style={{ fontSize: '14px', fontWeight: 500, lineHeight: '24px', color: 'hsl(var(--card))' }}>
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
              className="bg-transparent hover:bg-[hsl(var(--muted))] transition-colors w-full text-left"
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '4px 8px', height: '32px', border: 'none', cursor: 'pointer' }}
            >
              {/* Value: nombre del cliente, padding 0 16px 0 8px, flex-grow */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 16px 0 8px', flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 400, fontSize: '14px', lineHeight: '24px', color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {c.name}
                </span>
              </div>

              {/* Keyboard Shortcut: badge con monto */}
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', padding: '0 8px 0 0', flexShrink: 0 }}>
                <span style={{ display: 'inline-flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: '0 8px', height: '24px', border: '1px solid hsl(var(--border-control))', borderRadius: '360px', fontSize: '12px', fontWeight: 400, lineHeight: '24px', color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
                  {formatDashboardAmount(c.total, currencyLabel, numberLocale)}
                </span>
              </div>

              {/* Trailing: chevron 24x24, padding 0 4px 0 0 */}
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', padding: '0 4px 0 0', width: '28px', height: '24px', flexShrink: 0 }}>
                <ChevronRight
                  style={{ width: '16px', height: '16px', color: 'hsl(var(--text-disabled))' }}
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
