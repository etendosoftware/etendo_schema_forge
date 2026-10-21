import { useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Check } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { DataTable } from '@/components/contract-ui';
import PaymentLifecycleConfirmModal from './PaymentLifecycleConfirmModal';
import PaymentEditModalLauncher from './PaymentEditModalLauncher';
import { AmountText, CurrencyBreakdown, InfoTooltipButton, buildBalanceDisplay } from '@/components/currency-summary';
import { buildPeriodSubtitle } from './paymentSummaryPeriod.js';
import { DEPOSITED_STATUSES, DEPOSITED_STATUSES_LIST, PAYMENT_STATUS_ERROR, STATUS_PAYMENT_MADE } from './paymentStatuses';
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
        const amt = parseFloat(row.amount ?? 0);
        const curr = row['currency$_identifier'] || 'EUR';
        return (
          <span className="tabular-nums" style={{ color: 'hsl(var(--foreground))', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {fmtAmt(amt, curr)}
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

// ─── PaymentSidebar ───────────────────────────────────────────────────────────

/**
 * Summary panel of the list (ETP-5778). Every figure comes from `meta.summary`, which the
 * backend computes over the WHOLE filtered set (not just the loaded page), converted to the
 * organization currency at today's rate. `summary === null` (not loaded yet, or a backend
 * that does not send it) renders the skeleton: the rows are never added up client-side,
 * because they may be in different currencies.
 */
function PaymentSidebar({ dir, summary, dateFilter, ui }) {
  const isIn = dir === 'in';
  const loaded = summary != null;
  const orgIso = summary?.orgCurrencyIso || 'EUR';
  const total = summary?.total ?? {};
  const pending = summary?.pending ?? {};
  const methods = Array.isArray(summary?.byMethod) ? summary.byMethod : [];
  const byCurrency = Array.isArray(summary?.byCurrency) ? summary.byCurrency : [];
  const missingRate = Array.isArray(total.missingRateCurrencies) ? total.missingRateCurrencies : [];

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
          <span data-testid="payment-summary-title" style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 20, lineHeight: '28px', color: 'hsl(var(--foreground))' }}>
            {ui(isIn ? 'paymentSummaryCollected' : 'paymentSummaryPaid')}
          </span>
          <InfoTooltipButton
            label={ui(isIn ? 'paymentSummaryCollectedInfo' : 'paymentSummaryPaidInfo')}
            testId="payment-summary-info-button"
            contentTestId="payment-summary-info-tooltip"
            data-testid="InfoTooltipButton__743b1b" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4, height: 16 }}>
          {IC_CALENDAR}
          <span data-testid="payment-summary-subtitle" style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))' }}>
            {loaded ? buildPeriodSubtitle(dateFilter, summary.rowCount ?? 0, dir, ui) : '—'}
          </span>
        </div>
      </div>
      {/* Hero importe */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '0 12px', gap: 8, alignSelf: 'stretch', height: 32 }}>
        {loaded ? (
          // Bounded by the 292px aside: a long (especially approximate) amount ellipsises instead of
          // forcing a horizontal scrollbar, and the exact value stays available on hover (title).
          <span
            className="tabular-nums"
            title={buildBalanceDisplay(orgIso, total.amount ?? 0, { approximate: total.approximate === true }).text}
            style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 30, lineHeight: '32px', color: 'hsl(var(--foreground))', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <AmountText
              iso={orgIso}
              amount={total.amount}
              approximate={total.approximate === true}
              testId="payment-summary-total"
              data-testid="AmountText__743b1b" />
          </span>
        ) : (
          <SidebarSkeleton data-testid="SidebarSkeleton__743b1b" />
        )}
      </div>
      {loaded && missingRate.length > 0 ? (
        <p
          className="px-3 pt-1 text-xs font-normal leading-4 text-[var(--status-warning-fg)]"
          data-testid="payment-summary-missing-rate"
        >
          {ui('financeAccountsBalanceMissingRate', { currencies: missingRate.join(', ') })}
        </p>
      ) : null}
      {/* Widgets */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 12, gap: 12, alignSelf: 'stretch' }}>
        <WidgetCard
          iconSlot={IC_CLOCK}
          label={ui('sinDepositar')}
          badgeText={loaded ? `${pending.count ?? 0} ${ui('porVencer')}` : '—'}
          badgeStyle={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' }}
          count={loaded
            ? <AmountText
            iso={orgIso}
            amount={pending.amount}
            approximate={pending.approximate === true}
            testId="payment-summary-pending"
            data-testid="AmountText__743b1b" />
            : '—'}
          countStyle={{ color: 'var(--status-warning-fg)' }}
          data-testid="WidgetCard__743b1b" />
        <WidgetCard
          iconSlot={IC_WARNING}
          label={ui('sinConfirmar')}
          badgeText={ui('borrador')}
          badgeStyle={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
          count={loaded ? (summary.draftCount ?? 0) : '—'}
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
                <div key={m.id ?? m.label} style={{ width: '100%' }} data-testid={`payment-summary-method-${m.id ?? m.label}`}>
                  <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, alignSelf: 'stretch', height: 20 }}>
                    <span style={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 12, lineHeight: '16px', color: 'hsl(var(--muted-foreground))' }}>{m.label}</span>
                    <span className="tabular-nums" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 14, lineHeight: '20px', color: 'hsl(var(--foreground))', fontVariantNumeric: 'tabular-nums' }}>
                      <AmountText
                        iso={orgIso}
                        amount={m.amount}
                        approximate={m.approximate === true}
                        testId={`payment-summary-method-${m.id ?? m.label}-amount`}
                        data-testid="AmountText__743b1b" />
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
      {/* Detalle por moneda — informational only: real (unconverted) amounts, never "≈". */}
      {loaded && (
        <div style={{ padding: '0 12px 12px', alignSelf: 'stretch' }} data-testid="payment-summary-by-currency">
          <CurrencyBreakdown
            rows={byCurrency}
            primaryIso={orgIso}
            title={ui('paymentSummaryByCurrency')}
            testIdPrefix="payment-summary-currency"
            data-testid="CurrencyBreakdown__743b1b" />
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
    // ETP-5510 — the root must fill the scroller (so the sidebar divider reaches the bottom with
    // few rows) WITHOUT forcing overflow: min-height = scroller clientHeight
    //   - its own padding-top/bottom
    //   - the height (+ margins) of every sibling that shares the scroller with the root, at any
    //     level between the root and the scroller (the "all records loaded" footer, the
    //     "loading more" row). Using the bare clientHeight made the content always taller than
    //     the pane, giving a needless scrollbar. Never negative.
    const siblingsOf = () => {
      const out = [];
      for (let node = root; node && node !== scrollEl; node = node.parentElement) {
        const parent = node.parentElement;
        if (!parent) break;
        for (const sib of parent.children) if (sib !== node) out.push(sib);
      }
      return out;
    };
    const outerHeight = (el) => {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') return 0;
      return el.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
    };
    const update = () => {
      const cs = window.getComputedStyle(scrollEl);
      const padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const others = siblingsOf().reduce((sum, el) => sum + outerHeight(el), 0);
      root.style.minHeight = Math.max(0, scrollEl.clientHeight - padding - others) + 'px';
    };
    update();
    // Observes the scroller and the siblings (their size never depends on the root's min-height,
    // so setting it cannot retrigger this), and the ancestors' child lists so a sibling that
    // appears/disappears (footer, spinner) is picked up and observed too.
    const resizeObs = new ResizeObserver(update);
    const watchSiblings = () => {
      resizeObs.disconnect();
      resizeObs.observe(scrollEl);
      siblingsOf().forEach((el) => resizeObs.observe(el));
    };
    watchSiblings();
    const mutationObs = new MutationObserver(() => { watchSiblings(); update(); });
    for (let node = root; node && node !== scrollEl; node = node.parentElement) {
      if (node.parentElement) mutationObs.observe(node.parentElement, { childList: true });
    }
    return () => { resizeObs.disconnect(); mutationObs.disconnect(); };
  }, []);

  // ETP-5601 — ListView's list toolbar no longer draws a bottom border (Figma: 56px, no line),
  // but these windows keep the toolbar/body separator, so the body draws it as its top edge.
  return (
    <div ref={rootRef} style={{ display: 'flex', minHeight: '100%', overflow: 'hidden', borderTop: '1px solid hsl(var(--border-subtle))' }}>
      <PaymentSidebar
        dir={dir}
        summary={props.meta?.summary ?? null}
        dateFilter={props.columnFilters?.paymentDate}
        ui={ui}
        data-testid="PaymentSidebar__743b1b" />
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
