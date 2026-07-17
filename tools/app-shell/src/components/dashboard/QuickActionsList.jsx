import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { useUI } from '@/i18n';
import { DASHBOARD_KPI_IDS, trackDashboardKpi } from '@/lib/dashboardKpiTelemetry.js';

export function QuickActionsList({ actions = [] }) {
  const ui = useUI();

  return (
    <div className="rounded-xl border overflow-hidden bg-card flex flex-col h-full" style={{ borderColor: 'hsl(var(--border-subtle))' }}>
      <div
        className="flex items-center border-b"
        style={{ backgroundColor: 'hsl(var(--muted))', borderBottomColor: 'hsl(var(--border-subtle))', padding: '8px 12px', minHeight: '48px' }}
      >
        <span className="text-xs font-medium uppercase" style={{ color: 'hsl(var(--foreground))', letterSpacing: 0 }}>
          {ui('quickActionsTitle')}
        </span>
      </div>
      {/* Container: padding 12px, gap 12px, flex-col */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        {actions.map((action) => {
          const Icon = action.icon || TrendingUp;
          return (
            <Link
              key={action.to}
              to={action.to}
              onClick={() => trackDashboardKpi('quick_action_used', {
                kpiId: DASHBOARD_KPI_IDS.quickActions,
                action: action.analyticsAction,
                source: 'dashboard_quick_actions',
              })}
              data-testid={action.testId}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                padding: '4px 8px',
                height: '28px',
                backgroundColor: 'hsl(var(--muted))',
                borderRadius: '8px',
                gap: '8px',
                textDecoration: 'none',
              }}
              className="hover:brightness-95 transition-all"
            >
              <Icon
                style={{ width: '16px', height: '16px', flexShrink: 0, color: 'hsl(var(--text-disabled))' }}
                data-testid="Icon__961429" />
              <span style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 400,
                fontSize: '14px',
                lineHeight: '20px',
                color: 'hsl(var(--muted-foreground))',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {action.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
