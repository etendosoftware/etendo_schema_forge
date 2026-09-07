import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, Truck, DollarSign, CreditCard, ShoppingBag, Box, Circle } from 'lucide-react';
import { useUI } from '@/i18n';
import { resolveDashboardNavigation } from '@/lib/dashboardNavigation.js';
import { DASHBOARD_KPI_IDS, trackDashboardKpi } from '@/lib/dashboardKpiTelemetry.js';

// `category` drives KPI telemetry; `tone` drives the badge color. They are deliberately separate:
// the payments card turns red when overdue (ETP-5017) while staying in the `payments` telemetry
// bucket, so reusing `category` for color would silently corrupt the tracked type.
const CATEGORY_MAP = {
  overdueInvoices:               { category: 'sales',       tone: 'danger',  icon: FileText,    subjectKey: 'pendingSubjectSalesInvoices', stateKey: 'pendingStateOverdue'         },
  overdueInvoices_plural:        { category: 'sales',       tone: 'danger',  icon: FileText,    subjectKey: 'pendingSubjectSalesInvoices', stateKey: 'pendingStateOverdue'         },
  pendingSalesDeliveries:        { category: 'sales',       tone: 'danger',  icon: Truck,       subjectKey: 'pendingSubjectShipments',     stateKey: 'pendingStatePending'         },
  pendingSalesDeliveries_plural: { category: 'sales',       tone: 'danger',  icon: Truck,       subjectKey: 'pendingSubjectShipments',     stateKey: 'pendingStatePending'         },
  collectionsDueToday:           { category: 'collections', tone: 'warning', icon: DollarSign,  subjectKey: 'pendingSubjectCollections',   stateKey: 'pendingStateDueToday'        },
  collectionsDueToday_plural:    { category: 'collections', tone: 'warning', icon: DollarSign,  subjectKey: 'pendingSubjectCollections',   stateKey: 'pendingStateDueToday'        },
  paymentsDueToday:              { category: 'payments',    tone: 'warning', icon: CreditCard,  subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateDueToday'        },
  paymentsDueToday_plural:       { category: 'payments',    tone: 'warning', icon: CreditCard,  subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateDueToday'        },
  paymentsOverdue:               { category: 'payments',    tone: 'danger',  icon: CreditCard,  subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateOverduePayments' },
  paymentsOverdue_plural:        { category: 'payments',    tone: 'danger',  icon: CreditCard,  subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateOverduePayments' },
  pendingReceptions:             { category: 'purchases',   tone: 'info',    icon: ShoppingBag, subjectKey: 'pendingSubjectReceptions',    stateKey: 'pendingStatePending'         },
  pendingReceptions_plural:      { category: 'purchases',   tone: 'info',    icon: ShoppingBag, subjectKey: 'pendingSubjectReceptions',    stateKey: 'pendingStatePending'         },
  lowStockAlert:                 { category: 'stock',       tone: 'warning', icon: Box,         subjectKey: 'pendingSubjectStock',         stateKey: 'pendingStateLowStock'        },
  lowStockAlerts:                { category: 'stock',       tone: 'warning', icon: Box,         subjectKey: 'pendingSubjectStock',         stateKey: 'pendingStateLowStock'        },
};

const STATUS_BADGE_STYLES = {
  danger:  { backgroundColor: 'var(--status-destructive-bg)', color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive) / 0.3)' },
  warning: { backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)', borderColor: 'var(--status-warning-border)' },
  info:    { backgroundColor: 'var(--status-info-bg)', color: 'var(--status-info-fg)', borderColor: 'var(--status-info-border)' },
  muted:   { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border-subtle))' },
};

function resolveTaskMeta(task) {
  const key = task.taskKey;
  const meta = key && CATEGORY_MAP[key];
  if (meta) return meta;
  console.warn('[PendingTasksRail] Unknown taskKey:', key, task);
  return { category: 'other', tone: 'muted', icon: Circle, subjectKey: null, stateKey: null };
}

export function PendingTasksRail({ tasks = [] }) {
  const ui = useUI();
  const railRef = useRef(null);

  const scroll = (dir) => {
    railRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' });
  };

  return (
    <div className="rounded-lg border overflow-hidden bg-card flex flex-col h-full">
      {/* Cabecera: hsl(var(--muted)) bg, 48px, border-bottom hsl(var(--border-subtle)), padding 8px 12px */}
      <div
        className="flex items-center justify-between border-b"
        style={{ backgroundColor: 'hsl(var(--muted))', borderBottomColor: 'hsl(var(--border-subtle))', padding: '8px 12px', minHeight: '48px' }}
      >
        <span className="text-xs font-medium uppercase" style={{ color: 'hsl(var(--foreground))', letterSpacing: 0 }}>
          {ui('pendingTasksTitle')}
        </span>
        {tasks.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => scroll(-1)}
              className="h-8 w-8 rounded-full border bg-card flex items-center justify-center hover:bg-muted transition-colors"
            >
              <ChevronLeft
                className="h-3.5 w-3.5"
                style={{ color: 'hsl(var(--muted-foreground))' }}
                data-testid="ChevronLeft__7e1000" />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              className="h-8 w-8 rounded-full border bg-card flex items-center justify-center hover:bg-muted transition-colors"
            >
              <ChevronRight
                className="h-3.5 w-3.5"
                style={{ color: 'hsl(var(--muted-foreground))' }}
                data-testid="ChevronRight__7e1000" />
            </button>
          </div>
        )}
      </div>
      {/* Cards rail / empty state */}
      {tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center" style={{ gap: '4px', width: '340px' }}>
            <p style={{ fontSize: '20px', fontWeight: 600, lineHeight: '28px', textAlign: 'center', color: 'hsl(var(--foreground))' }}>
              {ui('pendingTasksEmptyTitle')}
            </p>
            <p style={{ fontSize: '12px', fontWeight: 400, lineHeight: '16px', textAlign: 'center', color: 'hsl(var(--foreground))' }}>
              {ui('pendingTasksEmptySubtitle')}
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div
            ref={railRef}
            className="flex gap-3 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {tasks.map((task, i) => {
              const meta = resolveTaskMeta(task);
              const Icon = meta.icon;
              const target = resolveDashboardNavigation(task.navigation) || task.link || '/dashboard';
              const subjectLabel = meta.subjectKey ? ui(meta.subjectKey) : task.text;
              const stateLabel   = meta.stateKey   ? ui(meta.stateKey)   : task.text;
              const badgeStyle    = STATUS_BADGE_STYLES[meta.tone] || STATUS_BADGE_STYLES.muted;

              return (
                <Link
                  key={i}
                  to={target}
                  onClick={() => trackDashboardKpi('pending_task_opened', {
                    kpiId: DASHBOARD_KPI_IDS.pendingTasks,
                    action: 'open_pending_task',
                    source: 'dashboard_pending_tasks',
                    type: meta.category === 'stock' ? 'inventory' : meta.category,
                  })}
                  className="flex-none flex flex-col rounded-lg border bg-card hover:bg-[hsl(var(--muted))] hover:shadow-sm transition-colors transition-shadow"
                  style={{ minWidth: '185px', height: '154px', borderColor: 'hsl(var(--border-subtle))' }}
                  data-testid="Link__7e1000">
                  {/* Cabecera de tarjeta: 44px fijo, padding top 4px / right 4px / left 16px, gap 10px */}
                  <div
                    className="flex items-center shrink-0"
                    style={{ height: '44px', paddingTop: '4px', paddingRight: '4px', paddingLeft: '16px', gap: '10px' }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'hsl(var(--foreground) / 0.05)' }}
                    >
                      <Icon
                        className="h-3.5 w-3.5"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                        data-testid="Icon__7e1000" />
                    </div>
                    <span className="text-sm font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {subjectLabel}
                    </span>
                  </div>
                  {/* Contenido: fill ~110px, padding 0 16px 16px 16px, número arriba, badge abajo */}
                  <div
                    className="flex flex-col justify-between flex-1"
                    style={{ padding: '0 16px 16px 16px' }}
                  >
                    <p className="text-5xl font-medium tabular-nums leading-none" style={{ color: 'hsl(var(--foreground))' }}>
                      {task.count ?? 0}
                    </p>
                    <span
                      className="inline-flex self-start items-center rounded-lg border px-2.5 py-0.5 text-xs font-medium"
                      style={badgeStyle}
                    >
                      {stateLabel}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
