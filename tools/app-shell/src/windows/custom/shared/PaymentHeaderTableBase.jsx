import { useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Check } from 'lucide-react';
import { useUI } from '@/i18n';
import { DataTable } from '@/components/contract-ui';
import { useRowDelete } from '@/hooks/useRowDelete.jsx';
import ReactivarModal from './ReactivarModal';
import ConfirmPaymentModal from './ConfirmPaymentModal';

const ENTITY_BY_SPEC = { 'payment-in': 'finPayment', 'payment-out': 'header' };

/* eslint-disable react/prop-types */

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPOSITED_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC']);

const DEPOSITED_STATUSES_LIST = ['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC'];

function buildColumns(dir, ui) {
  const depositedKey = dir === 'in' ? 'cobroDepositado' : 'pagoDepositado';
  const depositedEnum = Object.fromEntries(DEPOSITED_STATUSES_LIST.map(s => [s, depositedKey]));
  return [
    { key: 'documentNo', column: 'DocumentNo', type: 'string', label: ui('docNo') },
    { key: 'paymentDate', column: 'PaymentDate', type: 'date', label: ui('date'), dot: false },
    { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: ui('businessPartner') },
    { key: 'status', column: 'Status', type: 'status', label: ui('statusColumnLabel'),
      enumLabels: { ...depositedEnum, RPAP: 'statusDraft', DR: 'statusDraft' } },
    {
      key: 'amount', column: 'Amount', type: 'amount', label: ui('amount'),
      render: (row) => {
        const isDeposited = DEPOSITED_STATUSES.has(row.status || '');
        const amt = parseFloat(row.amount ?? 0);
        const curr = row['currency$_identifier'] || 'EUR';
        const sign = dir === 'in' ? '+ ' : '− ';
        return (
          <span className="tabular-nums" style={{ color: isDeposited ? '#17663A' : '#121217', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {sign}{fmtAmt(amt, curr)}
          </span>
        );
      },
    },
  ];
}

const PAYMENT_FILTERS = ['documentNo', 'paymentDate', 'businessPartner', 'status'];

// ─── Formatters ───────────────────────────────────────────────────────────────

const _symCache = {};
function currencySymbol(curr) {
  const code = curr || 'EUR';
  if (_symCache[code]) return _symCache[code];
  try {
    const sym = new Intl.NumberFormat('es-ES', { style: 'currency', currency: code })
      .formatToParts(0).find(p => p.type === 'currency')?.value ?? code;
    _symCache[code] = sym;
    return sym;
  } catch {
    return code;
  }
}

const AMOUNT_FMT = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtAmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return (n < 0 ? '-' : '') + AMOUNT_FMT.format(Math.abs(n)) + ' ' + currencySymbol(curr);
}

// ─── SidebarSkeleton ──────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[90, 70, 60].map((w) => (
        <div key={w} style={{ height: 14, borderRadius: 6, background: '#F1F2F4', width: `${w}%` }} />
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
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#828FA3" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IC_WARNING = (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#828FA3" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const IC_CALENDAR = (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6C6C89" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
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
      background: '#FFFFFF',
      border: '1px solid #E8EAEF',
      boxShadow: '0px 1px 2px rgba(18,18,23,0.05)',
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
        background: '#FFFFFF',
        border: '1px solid #D1D4DB',
        boxShadow: '0px 1px 2px rgba(18,18,23,0.05)',
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
          <span style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: '16px', color: '#3F3F50', flexGrow: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
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

  const heroColor = isIn ? '#17663A' : '#19191D';
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
        borderRight: '1px solid #E8EAEF',
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
          <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 20, lineHeight: '28px', color: '#121217' }}>{heroLabel}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4, height: 16 }}>
          {IC_CALENDAR}
          <span style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: '16px', color: '#555B6D' }}>
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
            {heroSign} {fmtAmt(thisMonth, currency)}
          </span>
        )}
      </div>
      {/* Widgets */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 12, gap: 12, alignSelf: 'stretch' }}>
        <WidgetCard
          iconSlot={IC_CLOCK}
          label={ui('sinDepositar')}
          badgeText={data === null ? '—' : `${pendingCount} ${ui('porVencer')}`}
          badgeStyle={{ background: '#FFF9EB', color: '#8A6100' }}
          count={data === null ? '—' : fmtAmt(pending, currency)}
          countStyle={{ color: '#C28800' }}
          data-testid="WidgetCard__743b1b" />
        <WidgetCard
          iconSlot={IC_WARNING}
          label={ui('sinConfirmar')}
          badgeText={ui('borrador')}
          badgeStyle={{ background: '#F5F7F9', color: '#3F3F50' }}
          count={data === null ? '—' : draftCount}
          countStyle={{ color: '#121217' }}
          data-testid="WidgetCard__743b1b" />
      </div>
      {/* Desglose por método de pago */}
      {methods.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 12px 12px', gap: 10, alignSelf: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 12, gap: 12, background: '#F5F7F9', borderRadius: 8, alignSelf: 'stretch' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 12, lineHeight: '16px', color: '#3F3F50', alignSelf: 'stretch' }}>
              {ui('porMetodo')}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, alignSelf: 'stretch' }}>
              {methods.map((m, i) => (
                <div key={m.label}>
                  <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, alignSelf: 'stretch', height: 20 }}>
                    <span style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: '16px', color: '#555B6D' }}>{m.label}</span>
                    <span className="tabular-nums" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 14, lineHeight: '20px', color: '#121217', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtAmt(m.amount || 0, currency)}
                    </span>
                  </div>
                  {i < methods.length - 1 && (
                    <div style={{ marginTop: 8, width: '100%', height: 0, border: '1px solid rgba(18,18,23,0.05)' }} />
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
  const [reactivateRow, setReactivateRow] = useState(null);
  const [confirmRow, setConfirmRow] = useState(null);
  const rootRef = useRef(null);
  const token = props.token;
  const entity = ENTITY_BY_SPEC[specName];
  const columns = useMemo(() => buildColumns(dir, ui), [dir, ui]);

  const runAction = async (row, action, okKey, errorKey) => {
    const url = `${apiBaseUrl}/${entity}/${row.id}/action/${action}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

  const handleReactivate = async (row) => {
    const ok = await runAction(row, 'etprReactivatePayment',
      dir === 'in' ? 'cobroReactivadoOk' : 'pagoReactivadoOk',
      dir === 'in' ? 'cobroReactivadoError' : 'pagoReactivadoError');
    if (ok) setReactivateRow(null);
  };

  const handleConfirmPayment = async (row) => {
    const ok = await runAction(row, 'aPRMProcessPayment',
      dir === 'in' ? 'cobroConfirmadoOk' : 'pagoConfirmadoOk',
      dir === 'in' ? 'cobroConfirmadoError' : 'pagoConfirmadoError');
    if (ok) setConfirmRow(null);
  };

  const { requestDelete, deleteDialog } = useRowDelete({
    apiBaseUrl,
    entity,
    token,
    onSuccess: () => {
      window.dispatchEvent(new CustomEvent('neo:processSuccess'));
      props.onDataMutated?.();
    },
    // Always go through the removal process (never a plain DELETE): it's the
    // only path that safely reactivates (if needed), cleans up applied
    // invoice lines (FIN_PaymentDetail/ScheduleDetail), and updates the
    // related invoices — a bare header DELETE fails on FK constraints the
    // moment any invoice has ever been applied to the payment.
    deleteFn: async (row) => {
      const url = `${apiBaseUrl}/${entity}/${row.id}/action/eTPRRemovePayment`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `${res.status} ${res.statusText}`);
      }
    },
  });

  const menuActions = useCallback(({ row }) => {
    const status = row.status || '';
    if (status === DRAFT_STATUS) {
      return [{
        key: 'aPRMProcessPayment',
        label: ui('confirmar'),
        icon: Check,
        onClick: () => { setConfirmRow(row); return Promise.resolve(); },
      }];
    }
    if (DEPOSITED_STATUSES.has(status)) {
      return [{
        key: 'etprReactivatePayment',
        label: ui('reactivar'),
        destructive: true,
        icon: RotateCcw,
        onClick: () => { setReactivateRow(row); return Promise.resolve(); },
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
            onDelete: requestDelete,
            actions: {
              edit: { visibleWhen: "@status@='__hidden__'" },
              delete: { visibleWhen: "@status@!='RPVOID'" },
            },
          }}
          data-testid="PaymentDataTable__743b1b"
        />
      </div>
      {reactivateRow && (
        <ReactivarModal
          dir={dir}
          onClose={() => setReactivateRow(null)}
          onConfirm={() => handleReactivate(reactivateRow)}
          data-testid="ReactivarModal__743b1b"
        />
      )}
      {confirmRow && (
        <ConfirmPaymentModal
          dir={dir}
          onClose={() => setConfirmRow(null)}
          onConfirm={() => handleConfirmPayment(confirmRow)}
          data-testid="ConfirmPaymentModal__743b1b"
        />
      )}
      {deleteDialog}
    </div>
  );
}
