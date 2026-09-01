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
              // The full label on hover, since a narrow sidebar-open layout truncates it.
              title={action.label}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                // `alignSelf: flex-start` sizes the pill to its content, so without `maxWidth` it
                // grows past the card and gets clipped as soon as the sidebar opens and the column
                // narrows. `minWidth: 0` lets a flex item shrink below its content at all.
                maxWidth: '100%',
                minWidth: 0,
                padding: '4px 8px',
                // Grows to a second line instead of staying at 28px: this is the narrowest column
                // of the row (`flex: 213` against 672 and 435), and with the sidebar open it has
                // roughly 130px for "Nuevo pedido de venta". Truncating it read as broken, and the
                // alternatives are worse — shortening the copy to "Nuevo pedido" turns ambiguous
                // the moment purchase actions exist, and widening this column steals from the
                // other widgets.
                minHeight: '28px',
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
                // Two lines, then ellipsis — a safety net for a label longer than any current one
                // (or a translation that runs long), so it can never grow the card unbounded.
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
                overflowWrap: 'anywhere',
                // A flex item defaults to `min-width: auto` and refuses to shrink below its text,
                // which would push the overflow outside the pill instead of wrapping inside it.
                minWidth: 0,
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
