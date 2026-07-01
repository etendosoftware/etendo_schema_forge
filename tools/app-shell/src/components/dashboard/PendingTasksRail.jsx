import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, Truck, DollarSign, CreditCard, ShoppingBag, Box, Circle } from 'lucide-react';
import { useUI } from '@/i18n';
import { resolveDashboardNavigation } from '@/lib/dashboardNavigation.js';
import { DASHBOARD_KPI_IDS, trackDashboardKpi } from '@/lib/dashboardKpiTelemetry.js';

const CATEGORY_MAP = {
  overdueInvoices:               { category: 'sales',       icon: FileText,    subjectKey: 'pendingSubjectSalesInvoices', stateKey: 'pendingStateOverdue'   },
  overdueInvoices_plural:        { category: 'sales',       icon: FileText,    subjectKey: 'pendingSubjectSalesInvoices', stateKey: 'pendingStateOverdue'   },
  pendingSalesDeliveries:        { category: 'sales',       icon: Truck,       subjectKey: 'pendingSubjectShipments',     stateKey: 'pendingStatePending'   },
  pendingSalesDeliveries_plural: { category: 'sales',       icon: Truck,       subjectKey: 'pendingSubjectShipments',     stateKey: 'pendingStatePending'   },
  collectionsDueToday:           { category: 'collections', icon: DollarSign,  subjectKey: 'pendingSubjectCollections',   stateKey: 'pendingStateDueToday'  },
  collectionsDueToday_plural:    { category: 'collections', icon: DollarSign,  subjectKey: 'pendingSubjectCollections',   stateKey: 'pendingStateDueToday'  },
  paymentsDueToday:              { category: 'payments',    icon: CreditCard,  subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateDueToday'  },
  paymentsDueToday_plural:       { category: 'payments',    icon: CreditCard,  subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateDueToday'  },
  pendingReceptions:             { category: 'purchases',   icon: ShoppingBag, subjectKey: 'pendingSubjectReceptions',    stateKey: 'pendingStatePending'   },
  pendingReceptions_plural:      { category: 'purchases',   icon: ShoppingBag, subjectKey: 'pendingSubjectReceptions',    stateKey: 'pendingStatePending'   },
  lowStockAlert:                 { category: 'stock',       icon: Box,         subjectKey: 'pendingSubjectStock',         stateKey: 'pendingStateLowStock'  },
  lowStockAlerts:                { category: 'stock',       icon: Box,         subjectKey: 'pendingSubjectStock',         stateKey: 'pendingStateLowStock'  },
};

const STATUS_BADGE_STYLES = {
  sales:       { backgroundColor: '#FEF0F4', color: '#D50B3E', borderColor: '#FBB1C4' },
  collections: { backgroundColor: '#FFF9EB', color: '#8A6100', borderColor: '#FFDA85' },
  payments:    { backgroundColor: '#FFF9EB', color: '#8A6100', borderColor: '#FFDA85' },
  purchases:   { backgroundColor: '#EFF6FF', color: '#1D4ED8', borderColor: '#BFDBFE' },
  stock:       { backgroundColor: '#FFF7ED', color: '#C2410C', borderColor: '#FED7AA' },
  other:       { backgroundColor: '#F5F7F9', color: '#6C6C89', borderColor: '#E8EAEF' },
};

function resolveTaskMeta(task) {
  const key = task.taskKey;
  const meta = key && CATEGORY_MAP[key];
  if (meta) return meta;
  console.warn('[PendingTasksRail] Unknown taskKey:', key, task);
  return { category: 'other', icon: Circle, subjectKey: null, stateKey: null };
}

export function PendingTasksRail({ tasks = [] }) {
  const ui = useUI();
  const railRef = useRef(null);

  const scroll = (dir) => {
    railRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' });
  };

  return (
    <div className="rounded-lg border overflow-hidden bg-white flex flex-col h-full">
      {/* Cabecera: #F5F7F9 bg, 48px, border-bottom #E8EAEF, padding 8px 12px */}
      <div
        className="flex items-center justify-between border-b"
        style={{ backgroundColor: '#F5F7F9', borderBottomColor: '#E8EAEF', padding: '8px 12px', minHeight: '48px' }}
      >
        <span className="text-xs font-medium uppercase" style={{ color: '#282833', letterSpacing: 0 }}>
          {ui('pendingTasksTitle')}
        </span>
        {tasks.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => scroll(-1)}
              className="h-8 w-8 rounded-full border bg-white flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft
                className="h-3.5 w-3.5"
                style={{ color: '#6C6C89' }}
                data-testid="ChevronLeft__7e1000" />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              className="h-8 w-8 rounded-full border bg-white flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <ChevronRight
                className="h-3.5 w-3.5"
                style={{ color: '#6C6C89' }}
                data-testid="ChevronRight__7e1000" />
            </button>
          </div>
        )}
      </div>
      {/* Cards rail / empty state */}
      {tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center" style={{ gap: '4px', width: '340px' }}>
            <p style={{ fontSize: '20px', fontWeight: 600, lineHeight: '28px', textAlign: 'center', color: '#121217' }}>
              {ui('pendingTasksEmptyTitle')}
            </p>
            <p style={{ fontSize: '12px', fontWeight: 400, lineHeight: '16px', textAlign: 'center', color: '#282833' }}>
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
              const badgeStyle    = STATUS_BADGE_STYLES[meta.category] || STATUS_BADGE_STYLES.other;

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
                  className="flex-none flex flex-col rounded-lg border bg-white hover:bg-[#F5F7F9] hover:shadow-sm transition-colors transition-shadow"
                  style={{ minWidth: '185px', height: '154px', borderColor: '#E8EAEF' }}
                  data-testid="Link__7e1000">
                  {/* Cabecera de tarjeta: 44px fijo, padding top 4px / right 4px / left 16px, gap 10px */}
                  <div
                    className="flex items-center shrink-0"
                    style={{ height: '44px', paddingTop: '4px', paddingRight: '4px', paddingLeft: '16px', gap: '10px' }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(18,18,23,0.05)' }}
                    >
                      <Icon
                        className="h-3.5 w-3.5"
                        style={{ color: '#3F3F50' }}
                        data-testid="Icon__7e1000" />
                    </div>
                    <span className="text-sm font-normal" style={{ color: '#3F3F50' }}>
                      {subjectLabel}
                    </span>
                  </div>
                  {/* Contenido: fill ~110px, padding 0 16px 16px 16px, número arriba, badge abajo */}
                  <div
                    className="flex flex-col justify-between flex-1"
                    style={{ padding: '0 16px 16px 16px' }}
                  >
                    <p className="text-5xl font-medium tabular-nums leading-none" style={{ color: '#121217' }}>
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
