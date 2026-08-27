import { useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Check } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { DataTable } from '@/components/contract-ui';
import PaymentLifecycleConfirmModal from './PaymentLifecycleConfirmModal';
import PaymentEditModalLauncher from './PaymentEditModalLauncher';
import { DEPOSITED_STATUSES, DEPOSITED_STATUSES_LIST, PAYMENT_STATUS_ERROR, STATUS_PAYMENT_MADE, paymentDisplayState } from './paymentStatuses';
import { useApiFetch } from '@/auth/useApiFetch.js';

const ENTITY_BY_SPEC = { 'payment-in': 'finPayment', 'payment-out': 'header' };

/* eslint-disable react/prop-types */

function buildColumns(dir, ui, locale) {
  const depositedKey = dir === 'in' ? 'cobroDepositado' : 'pagoDepositado';
  // RPPC ("Payment Cleared") is the one deposited status that means the payment was actually
  // matched against a bank transaction — see PaymentConciliadoBadge, which shows the same
  // "Conciliado" wording plus a link to that transaction. Bucketing it under the generic
  // depositedKey here made the grid say "Cobro depositado" for a row that, once opened, showed
  // "Conciliado" instead — same underlying fact under two different labels (ETP-4797).
  // PPM ("Payment Made") is likewise excluded, but only for payments out: it means confirmed and
  // not yet withdrawn from the account, which for a Salt Edge transfer is the wait between the bank
  // authorizing it and the money moving. Labelling it "depositado" contradicted the invoice modal,
  // which already reads the very same payment as "Pago en progreso" (ETP-4895). PPM is an outbound
  // status — a receipt confirms to RPR/RDNC — so the collections grid is deliberately left alone.
  const isOut = dir === 'out';
  const depositedEnum = Object.fromEntries(
    DEPOSITED_STATUSES_LIST
      .filter(s => s !== 'RPPC' && !(isOut && s === STATUS_PAYMENT_MADE))
      .map(s => [s, depositedKey]));
  return [
    { key: 'documentNo', column: 'DocumentNo', type: 'string', label: ui('docNo'), required: true },
    { key: 'paymentDate', column: 'PaymentDate', type: 'date', label: ui('date'), dot: false },
    { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: ui('businessPartner') },
    { key: 'status', column: 'Status', type: 'status', label: ui('statusColumnLabel'), required: true,
      enumLabels: {
        ...depositedEnum,
        RPPC: 'conciliado',
        ...(isOut ? {
          [STATUS_PAYMENT_MADE]: 'cpPaymentStateInProgress',
          // Without this the grid printed the raw code: ETGOERR is this module's own status and
          // Core's dictionary has no name for it.
          [PAYMENT_STATUS_ERROR]: 'cpPaymentStateError',
        } : {}),
        RPAP: 'statusDraft',
        DR: 'statusDraft',
      } },
    {
      key: 'amount', column: 'Amount', type: 'amount', label: ui('amount'), required: true,
      // `labels` (priority 1 in resolveColumnLabel) must be set so this header
      // outranks the AD-dictionary fallback translate('Amount'), which
      // otherwise resolves to "Importe cobrado/pagado".
      labels: { [locale]: ui('amount') },
      render: (row) => {
        const isDeposited = isOut
          ? paymentDisplayState(row) === 'deposited'
          : DEPOSITED_STATUSES.has(row.status || '');
        const amt = parseFloat(row.amount ?? 0);
        const curr = row['currency$_identifier'] || 'EUR';
        let sign = '';
        if (amt > 0) {
          sign = dir === 'in' ? '+ ' : '− ';
        }
        return (
          <span className="tabular-nums" style={{ color: isDeposited ? 'var(--status-success-fg)' : 'hsl(var(--foreground))', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {sign}{fmtAmt(amt, curr)}
          </span>
        );
      },
    },
  ];
}

const PAYMENT_FILTERS = ['documentNo', 'paymentDate', 'businessPartner', 'status'];

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtAmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(curr || 'EUR', n);
}

// ─── SidebarSkeleton ──────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[90, 70, 60].map((w) => (
        <div key={w} style={{ height: 14, borderRadius: 6, background: 'hsl(var(--muted))', width: `${w}%` }} />
      ))}
    </div>
  );
}

// ─── Method icons ─────────────────────────────────────────────────────────────

const METHOD_ICONS = {
  transfer: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h18M3 7l4-4M3 7l4 4M21 17H3M21 17l-4-4M21 17l-4 4"/>
    </svg>
  ),
  card: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
    </svg>
  ),
  cash: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
    </svg>
  ),
  direct: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v16M4 8h12a3 3 0 0 1 0 6H4M14 14l4 4M14 14l4-4"/>
    </svg>
  ),
};

// ─── Sidebar icons ────────────────────────────────────────────────────────────

const IC_CLOCK = (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--text-disabled))" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IC_WARNING = (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--text-disabled))" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const IC_CALENDAR = (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

// ─── WidgetCard ───────────────────────────────────────────────────────────────

function WidgetCard({ iconSlot, label, badgeText, badgeStyle, count, countStyle }) {
  return (
    <div style={{
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      padding: '8px 8px 8px 12px',
      gap: 12,
      width: '100%',
      height: 68,
      background: 'hsl(var(--card))',
      border: '1px solid hsl(var(--border-subtle))',
      boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
      borderRadius: 8,
    }}>
      {/* Icon box */}
      <div style={{
        boxSizing: 'border-box',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 8,
        width: 40,
        height: 40,
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border-control))',
        boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
        borderRadius: 8,
        flexShrink: 0,
      }}>
        {iconSlot}
      </div>
      {/* Columna 2 — relative so count can anchor to bottom without overflow */}
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        alignSelf: 'stretch',
        padding: 0,
        flex: 1,
        minWidth: 0,
      }}>
        {/* Frame 238: label + badge — sits at column top (y=8 from card, ~icon top) */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 0,
          gap: 10,
          alignSelf: 'stretch',
          height: 24,
        }}>
          <span style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))', flexGrow: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 360, flexShrink: 0, ...badgeStyle }}>
            <span style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: '16px', whiteSpace: 'nowrap' }}>{badgeText}</span>
          </span>
        </div>
        {/* Big count number — anchored to column bottom, glyph aligns with icon bottom */}
        <span className="tabular-nums" style={{
          position: 'absolute', bottom: 0, left: 0,
          fontFamily: 'Inter', fontWeight: 500, fontSize: 24, lineHeight: '36px',
          letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums',
          ...countStyle,
        }}>
          {count}
        </span>
      </div>
    </div>
  );
}

// ─── computeSidebarStats ──────────────────────────────────────────────────────

function computeSidebarStats(rows) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let thisMonth = 0;
  let thisMonthCount = 0;
  let pending = 0;
  let pendingCount = 0;
  let draftCount = 0;
  let currency = 'EUR';
  const methodMap = {};

  (rows || []).forEach(r => {
    if (r['currency$_identifier']) currency = r['currency$_identifier'];
    const amt = parseFloat(r.amount ?? 0);
    const isDeposited = DEPOSITED_STATUSES.has(r.status || '');
    if (isDeposited) {
      if ((r.paymentDate || '').startsWith(ym)) {
        thisMonth += amt;
        thisMonthCount += 1;
      }
      const methodId = r['paymentMethod$_identifier'] || 'other';
      if (!methodMap[methodId]) methodMap[methodId] = 0;
      methodMap[methodId] += amt;
    } else {
      pending += amt;
      pendingCount += 1;
      draftCount += 1;
    }
  });

  const methods = Object.entries(methodMap).map(([label, amount]) => ({ label, amount }));
  return { thisMonth, thisMonthCount, pending, pendingCount, draftCount, currency, methods };
}

function fmtMonthSub(thisMonthCount, isIn, ui) {
  const now = new Date();
  const monthName = now.toLocaleDateString(undefined, { month: 'long' });
  const monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const noun = ui(isIn ? 'cobrosNoun' : 'pagosNoun');
  return `${monthCap} ${now.getFullYear()} · ${thisMonthCount} ${noun}`;
}

// ─── PaymentSidebar ───────────────────────────────────────────────────────────

function PaymentSidebar({ dir, data, ui }) {
  const isIn = dir === 'in';

  const { thisMonth, thisMonthCount, pending, pendingCount, draftCount, currency, methods } = useMemo(
    () => computeSidebarStats(data),
    [data]
  );

  const heroColor = isIn ? 'var(--status-success-fg)' : 'hsl(var(--foreground))';
  const heroLabel = isIn ? ui('cobradoEsteMes') : ui('pagadoEsteMes');
  const heroSign = isIn ? '+' : '−';

  return (
    <aside
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: 292,
        minHeight: 577,
        borderRight: '1px solid hsl(var(--border-subtle))',
        flexShrink: 0,
        alignSelf: 'stretch',
        overflowY: 'auto',
      }}
      data-testid="PaymentSidebar__panel"
    >
      {/* Cabecera */}
      <div style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '8px 12px 12px',
        gap: 2,
        alignSelf: 'stretch',
      }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 }}>
          <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 20, lineHeight: '28px', color: 'hsl(var(--foreground))' }}>{heroLabel}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4, height: 16 }}>
          {IC_CALENDAR}
          <span style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))' }}>
            {data ? fmtMonthSub(thisMonthCount, isIn, ui) : '—'}
          </span>
        </div>
      </div>
      {/* Hero importe */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '0 12px', gap: 8, alignSelf: 'stretch', height: 32 }}>
        {data === null ? (
          <SidebarSkeleton data-testid="SidebarSkeleton__743b1b" />
        ) : (
          <span className="tabular-nums" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 30, lineHeight: '32px', color: heroColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {thisMonth > 0 ? `${heroSign} ` : ''}{fmtAmt(thisMonth, currency)}
          </span>
        )}
      </div>
      {/* Widgets */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 12, gap: 12, alignSelf: 'stretch' }}>
        <WidgetCard
          iconSlot={IC_CLOCK}
          label={ui('sinDepositar')}
          badgeText={data === null ? '—' : `${pendingCount} ${ui('porVencer')}`}
          badgeStyle={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' }}
          count={data === null ? '—' : fmtAmt(pending, currency)}
          countStyle={{ color: 'var(--status-warning-fg)' }}
          data-testid="WidgetCard__743b1b" />
        <WidgetCard
          iconSlot={IC_WARNING}
          label={ui('sinConfirmar')}
          badgeText={ui('borrador')}
          badgeStyle={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
          count={data === null ? '—' : draftCount}
          countStyle={{ color: 'hsl(var(--foreground))' }}
          data-testid="WidgetCard__743b1b" />
      </div>
      {/* Desglose por método de pago */}
      {methods.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 12px 12px', gap: 10, alignSelf: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 12, gap: 12, background: 'hsl(var(--muted))', borderRadius: 8, alignSelf: 'stretch' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))', alignSelf: 'stretch' }}>
              {ui('porMetodo')}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, alignSelf: 'stretch' }}>
              {methods.map((m, i) => (
                <div key={m.label} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, alignSelf: 'stretch', height: 20 }}>
                    <span style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))' }}>{m.label}</span>
                    <span className="tabular-nums" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 14, lineHeight: '20px', color: 'hsl(var(--foreground))', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtAmt(m.amount || 0, currency)}
                    </span>
                  </div>
                  {i < methods.length - 1 && (
                    <div style={{ marginTop: 8, width: '100%', height: 0, border: '1px solid hsl(var(--foreground) / 0.05)' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DRAFT_STATUS = 'RPAP';

export default function PaymentHeaderTableBase({ dir, specName, data, onNavigate, apiBaseUrl, ...props }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  // Unified Reactivar/Eliminar confirmation ({ action: 'reactivate'|'delete', row } | null) —
  // both now go through the same LifecycleConfirmModal-backed cartel (ETP-4500).
  const [confirm, setConfirm] = useState(null);
  const [confirmRow, setConfirmRow] = useState(null);
  const rootRef = useRef(null);
  const token = props.token;
  const apiFetch = useApiFetch(apiBaseUrl);
  const entity = ENTITY_BY_SPEC[specName];
  const columns = useMemo(() => buildColumns(dir, ui, locale), [dir, ui, locale]);

  const runAction = async (row, action, okKey, errorKey) => {
    try {
      const res = await apiFetch(`/${entity}/${row.id}/action/${action}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success(ui(okKey));
        window.dispatchEvent(new CustomEvent('neo:processSuccess'));
        props.onDataMutated?.();
        return true;
      }
      const body = await res.json().catch(() => ({}));
      toast.error(body.message || body.error || ui(errorKey));
      return false;
    } catch {
      toast.error(ui(errorKey));
      return false;
    }
  };

  // Confirmed from the cartel: Reactivar goes through the same NEO action as before.
  const handleReactivate = async (row) => {
    await runAction(row, 'etprReactivatePayment',
      dir === 'in' ? 'cobroReactivadoOk' : 'pagoReactivadoOk',
      dir === 'in' ? 'cobroReactivadoError' : 'pagoReactivadoError');
    setConfirm(null);
  };

  // Confirmed from the cartel: Eliminar always goes through the removal process
  // (never a plain DELETE) — it's the only path that safely reactivates (if
  // needed), cleans up applied invoice lines (FIN_PaymentDetail/ScheduleDetail),
  // and updates the related invoices; a bare header DELETE fails on FK
  // constraints the moment any invoice has ever been applied to the payment.
  const handleDelete = async (row) => {
    try {
      const res = await apiFetch(`/${entity}/${row.id}/action/eTPRRemovePayment`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success(ui('recordDeleted'));
        window.dispatchEvent(new CustomEvent('neo:processSuccess'));
        props.onDataMutated?.();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.message || body.error || ui('networkError'));
      }
    } catch {
      toast.error(ui('networkError'));
    }
    setConfirm(null);
  };

  const handleConfirmPayment = async (row) => {
    const ok = await runAction(row, 'aPRMProcessPayment',
      dir === 'in' ? 'cobroConfirmadoOk' : 'pagoConfirmadoOk',
      dir === 'in' ? 'cobroConfirmadoError' : 'pagoConfirmadoError');
    if (ok) setConfirmRow(null);
  };

  const menuActions = useCallback(({ row }) => {
    const status = row.status || '';
    if (status === DRAFT_STATUS) {
      return [{
        key: 'aPRMProcessPayment',
        label: ui('confirm'),
        icon: Check,
        onClick: () => { setConfirmRow(row); return Promise.resolve(); },
      }];
    }
    // A payment whose bank transfer is live is not the user's to reactivate: Salt Edge would be left
    // holding an order for a payment that no longer exists, and once executed, money that moved with
    // nothing recording it. Only a rejected transfer (ETGOERR) hands it back (ETP-4895). Non-PIS
    // payments never carry the flag, so their kebab is unchanged.
    if (row.pisLocked === true) {
      return [];
    }
    if (DEPOSITED_STATUSES.has(status)) {
      return [{
        key: 'etprReactivatePayment',
        label: ui('reactivar'),
        destructive: true,
        icon: RotateCcw,
        onClick: () => { setConfirm({ action: 'reactivate', row }); return Promise.resolve(); },
      }];
    }
    return [];
  }, [ui]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let scrollEl = root.parentElement;
    while (scrollEl) {
      const ov = window.getComputedStyle(scrollEl).overflowY;
      if (ov === 'auto' || ov === 'scroll') break;
      scrollEl = scrollEl.parentElement;
    }
    if (!scrollEl) return;
    const update = () => { root.style.minHeight = scrollEl.clientHeight + 'px'; };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(scrollEl);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={rootRef} style={{ display: 'flex', minHeight: '100%', overflow: 'hidden' }}>
      <PaymentSidebar dir={dir} data={data} ui={ui} data-testid="PaymentSidebar__743b1b" />
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <DataTable
          {...props}
          entity={entity}
          specName={specName}
          data={data}
          onNavigate={onNavigate}
          apiBaseUrl={apiBaseUrl}
          token={token}
          columns={columns}
          filters={PAYMENT_FILTERS}
          showFooterTotals={false}
          rowQuickActions={{
            ...(props.rowQuickActions || {}),
            menuActions,
            hideDeleteWhenComplete: false,
            statusField: 'status',
            sendDocument: null,
            onDelete: (row) => { if (row?.id) setConfirm({ action: 'delete', row }); },
            actions: {
              edit: { visibleWhen: "@status@='__hidden__'" },
              delete: { visibleWhen: "@status@!='RPVOID'" },
            },
          }}
          data-testid="PaymentDataTable__743b1b"
        />
      </div>
      {confirm && (
        <PaymentLifecycleConfirmModal
          dir={dir}
          action={confirm.action}
          data={confirm.row}
          onClose={() => setConfirm(null)}
          onConfirm={() => (confirm.action === 'delete' ? handleDelete(confirm.row) : handleReactivate(confirm.row))}
          data-testid="PaymentLifecycleConfirmModal__743b1b"
        />
      )}
      {confirmRow && (
        // Same editor the payment window opens, so Confirmar means the same thing from either
        // surface. It falls back to the plain confirm dialog on its own when the row's invoice
        // cannot be resolved, which is why ConfirmPaymentModal is no longer referenced here.
        (<PaymentEditModalLauncher
          dir={dir}
          record={confirmRow}
          apiBaseUrl={apiBaseUrl}
          onConfirm={() => handleConfirmPayment(confirmRow)}
          onClose={() => setConfirmRow(null)}
          onRefresh={() => { setConfirmRow(null); props.onDataMutated?.(); }}
          data-testid="PaymentEditModalLauncher__743b1b"
        />)
      )}
    </div>
  );
}
