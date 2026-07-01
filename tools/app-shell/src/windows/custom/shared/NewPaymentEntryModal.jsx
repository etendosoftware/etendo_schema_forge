import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DateField } from '@/components/ui/date-field';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect.jsx';
import { MoneyAmount } from '@/components/ui/money-amount';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import { usePaymentBalance, formatPlain } from './usePaymentBalance.js';

// ─── design tokens (Etendo Design System — cobros/pagos Figma handoff) ────────
const INK = '#121217';
const BORDER1 = '#E8EAEF';
const BORDER2 = '#D1D4DB';
const FG2 = '#3F3F50';
const FG3 = '#6C6C89';
const FG4 = '#828FA3';
const WIDGET_BG = '#F5F7F9';
const GREEN_FG = '#17663A';
const GREEN_BG = '#EEFBF4';
const RED_FG = '#C5234A';
const RED_BG = '#FDE2E9';
const AMBER = '#C28800';
const EXCESS_BG = '#F5F7F9';
const EXCESS_BORDER = '#D1D4DB';
const EXCESS_FG = '#3F3F50';

// Per-source-kind row accents. credit → purple, abono (saldo a favor) → green.
const BADGE = {
  credit: { bg: '#F4F1FD', fg: '#4316CA' },
  abono: { bg: GREEN_BG, fg: GREEN_FG },
};

// Stable field descriptors for the CreatableSearchSelect pickers below — these
// use `staticOptions` (methods/accounts are already fetched in state), so no
// selectorUrl/token/dependsOn is needed; `key`/`id` only drive element ids/testids.
const METHOD_FIELD = { key: 'paymentMethod', id: 'paymentMethod', required: false };
const ACCOUNT_FIELD = { key: 'account', id: 'account', required: true };

/** Returns a short currency suffix ("€" for EUR, otherwise the ISO code). */
function curSuffix(currency) {
  return currency === 'EUR' ? '€' : (currency || '');
}
/** Formats an amount with its currency suffix in es-ES grouping ("6.420,00 €"). */
function fmtCur(n, currency) {
  return `${formatPlain(n)} ${curSuffix(currency)}`.trim();
}

/** Label for the balance delta (excess / missing / exact). */
function deltaLabelFor(balance, ui) {
  if (balance.isExcess) return ui('cpExcess');
  if (balance.isPartial) return ui('cpMissing');
  return ui('cpDifference');
}

/** Over-payment action sent to the backend (only relevant when there is excess). */
function overpaymentActionFor(balance) {
  if (!balance.isExcess) return undefined;
  return balance.excessMode === 'refund' ? 'refund' : 'leave-credit';
}

/** Reads a fetch response body as JSON, or null when the response failed. */
async function readJson(res) {
  return res?.ok ? res.json() : null;
}

// `paymentMethodIds` is only present once the backend module has been rebuilt with
// the per-account method list; `undefined` (older backend) means "unknown — don't
// filter this account out" so existing deployments degrade gracefully.
function mapAccounts(json) {
  return (json?.items || []).map(a => ({
    id: a.id, name: a.label || a.name, defaultMethod: a.defaultPaymentMethod,
    paymentMethodIds: a.paymentMethodIds, defaultForMethodIds: a.defaultForMethodIds || [],
  }));
}

/** True when `account` supports `methodId` (or the account's methods are unknown/legacy). */
function accountSupportsMethod(account, methodId) {
  return !methodId || !account.paymentMethodIds || account.paymentMethodIds.includes(methodId);
}

function mapMethods(json) {
  const items = json?.items || json?.response?.data || [];
  return items.map(m => ({ id: m.id, name: m.label || m._identifier || m.name }));
}

function mapSources(json) {
  const items = json?.items || json?.response?.data || [];
  return items.map(s => ({
    id: s.id, kind: s.kind === 'abono' ? 'abono' : 'credit',
    doc: s.doc || s.documentNo || s.id, date: s.date || '', note: s.note || '',
    avail: Number(s.avail ?? s.available ?? 0), psdId: s.psdId, paymentId: s.paymentId,
  }));
}

/** Default method id: the first account's default (by name) if present, else the first method. */
function pickMethodId(accList, methList) {
  const def = accList[0]?.defaultMethod;
  const match = def ? methList.find(m => m.name === def) : null;
  return (match || methList[0])?.id || '';
}

/** Default method id: the invoice's own method (if valid), else the legacy per-account heuristic. */
function pickDefaultMethodId(accJson, accList, methList) {
  const invoiceMethodId = accJson?.defaultMethodId;
  if (invoiceMethodId && methList.some(m => m.id === invoiceMethodId)) return invoiceMethodId;
  return pickMethodId(accList, methList);
}

/**
 * Default account for the given method, mirroring Classic's priority order:
 *   1. the business partner's preferred account (`account`/`pOFinancialAccount`), if it
 *      supports the method;
 *   2. the account flagged `default` for that method (`FinAccPaymentMethod.default`);
 *   3. the first account that supports the method (legacy heuristic fallback);
 * "Default for this method" is meaningless without a method — with no `methodId`, there is
 * nothing to default to, so an empty method never auto-fills the account (e.g. clearing the
 * method after clearing the account must leave the account cleared, not silently refill it).
 */
function pickDefaultAccountId(accList, methodId, bpPreferredAccountId) {
  if (!methodId) return '';

  const bpAccount = bpPreferredAccountId
    ? accList.find(a => a.id === bpPreferredAccountId && accountSupportsMethod(a, methodId))
    : null;
  if (bpAccount) return bpAccount.id;

  const flaggedDefault = accList.find(a => a.defaultForMethodIds?.includes(methodId));
  if (flaggedDefault) return flaggedDefault.id;

  const firstSupporting = accList.find(a => accountSupportsMethod(a, methodId));
  return firstSupporting?.id || '';
}

/** Resolves the first pending installment's schedule id from the payment plan. */
async function fetchPendingSchedule(apiFetch, specName, invoiceId) {
  const res = await apiFetch(
    `/${specName}/paymentPlan?parentId=${invoiceId}&_startRow=0&_endRow=50`).catch(() => null);
  if (!res?.ok) return '';
  const plan = (await res.json())?.response?.data || [];
  const pending = plan.find(p => parseFloat(p.outstandingAmount) > 0) || plan[0];
  return pending ? (pending.finPaymentScheduleID || pending.id || '') : '';
}

/** Extracts a user-facing error message from a failed register response. */
function extractSaveError(json, ui) {
  return json?.response?.error?.message
    || json?.response?.message?.text
    || json?.response?.message
    || ui('cpSaveFailed');
}

function Check({ checked, size = 18 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 4, flexShrink: 0,
      border: `1.5px solid ${checked ? INK : '#A9A9BC'}`, background: checked ? INK : '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {checked && (
        <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

function Radio({ checked }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
      border: `1.5px solid ${checked ? INK : BORDER2}`, background: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {checked && <div style={{ width: 8, height: 8, borderRadius: '50%', background: INK }} />}
    </div>
  );
}

function Field({ label, required = false, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <label style={{ font: '500 14px/24px Inter', color: INK }}>
        {label}{required && <span style={{ color: RED_FG }}> *</span>}
      </label>
      {children}
    </div>
  );
}

/** A single cell in the invoice-context widget (label on top, value below). */
function WidgetCell({ label, children, valueColor = INK, valueWeight = 500 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      <span style={{ font: '400 12px/16px Inter', color: FG2 }}>{label}</span>
      <span style={{ font: `${valueWeight} 16px/24px Inter`, color: valueColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  );
}

// ─── consumable credit/abono row ──────────────────────────────────────────────
const ROW_HEIGHT = 44;

function CreditRow({ l, currency, ui, onToggle, onUseChange, onUseBlur }) {
  const badge = BADGE[l.kind] || BADGE.credit;
  const tagLabel = l.kind === 'credit' ? ui('cpCreditBadge') : ui('cpFavorBadge');
  return (
    <div
      onClick={onToggle}
      data-testid={`cp-credit-row-${l.id}`}
      style={{ display: 'grid', gridTemplateColumns: '32px 1fr 130px 160px', gap: 12, alignItems: 'center', height: ROW_HEIGHT, padding: '0 12px', borderTop: `1px solid ${BORDER1}`, background: l.sel ? badge.bg : 'transparent', cursor: 'pointer' }}
    >
      <Check checked={l.sel} data-testid="Check__7727b3" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
        <span style={{ font: '600 14px/20px "JetBrains Mono", monospace', color: INK, flexShrink: 0 }}>{l.doc}</span>
        <span style={{ font: '400 12px/16px Inter', padding: '4px 8px', borderRadius: 360, background: badge.bg, color: badge.fg, flexShrink: 0 }}>{tagLabel}</span>
        <span style={{ font: '400 12px/16px Inter', color: FG3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.date}</span>
      </div>
      <div style={{ textAlign: 'right', font: '400 14px/20px Inter', color: INK, fontVariantNumeric: 'tabular-nums' }}>
        {ui('cpAvailShort')} <MoneyAmount value={l.avail} currency={currency} tone="neutral" data-testid="MoneyAmount__cp-avail" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        {l.sel ? (
          <div style={{ display: 'flex', alignItems: 'center', height: 40, border: `1px solid ${BORDER2}`, borderRadius: 8, background: '#fff', boxShadow: '0 1px 2px rgba(18,18,23,.05)', padding: '0 12px', gap: 4, minWidth: 0 }}>
            <input
              type="text" inputMode="decimal" value={l.useStr}
              onChange={e => onUseChange(e.target.value)}
              onBlur={onUseBlur}
              data-testid={`cp-credit-use-${l.id}`}
              style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', textAlign: 'right', padding: 0, font: '400 14px/24px Inter', color: INK, fontVariantNumeric: 'tabular-nums' }}
            />
            <span style={{ font: '400 14px/24px Inter', color: FG3, flexShrink: 0 }}>{curSuffix(currency)}</span>
          </div>
        ) : <span style={{ font: '400 14px/20px Inter', color: FG3 }}>{ui('cpUnused')}</span>}
      </div>
    </div>
  );
}

// ─── unified credit / saldo-a-favor section (Figma "Saldo a favor y crédito") ──
function CreditSection({ rows, currency, ui, balance }) {
  if (!rows.length) return null;
  const used = rows.reduce((acc, l) => acc + (l.sel ? l.use : 0), 0);
  return (
    <div style={{ border: `1px solid ${BORDER1}`, borderRadius: 8, background: '#fff', boxShadow: '0 1px 2px rgba(18,18,23,.05)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px' }}>
        <span style={{ font: '600 12px/16px Inter', color: INK }}>{ui('cpCreditSectionTitle')}</span>
        <span style={{ font: '400 12px/16px Inter', color: FG3 }}>· {ui('cpCreditSectionHint')}</span>
        <div style={{ flex: 1 }} />
        {used > 0 && (
          <span style={{ font: '600 12px/16px Inter', color: INK, fontVariantNumeric: 'tabular-nums' }}>
            − <MoneyAmount value={used} currency={currency} tone="neutral" data-testid="MoneyAmount__cp-used" />
          </span>
        )}
      </div>
      {rows.map(l => (
        <CreditRow
          key={l.id}
          l={l}
          currency={currency}
          ui={ui}
          onToggle={() => balance.toggleLine(l.id)}
          onUseChange={(str) => balance.onLineUseChange(l.id, str)}
          onUseBlur={() => balance.onLineUseBlur(l.id)}
          data-testid="CreditRow__7727b3" />
      ))}
    </div>
  );
}

// ─── excess band — receipts offer credit/refund; payments block with inline error ─
function ExcessBand({ balance, currency, ui, isReceipt }) {
  if (!balance.isExcess) {
    return null;
  }
  const amount = fmtCur(balance.excessAmount, currency);
  if (!isReceipt) {
    return (
      <div style={{ padding: '10px 14px', background: RED_BG, border: `1px solid ${RED_FG}33`, borderRadius: 8, font: '600 13px/18px Inter', color: RED_FG }}>
        {ui('cpExcessInline', { amount })}
      </div>
    );
  }
  const card = (mode, title, hint, testid) => (
    <button
      type="button"
      data-testid={testid}
      onClick={() => balance.setExcessMode(mode)}
      style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 12, border: `${balance.excessMode === mode ? 2 : 1}px solid ${balance.excessMode === mode ? INK : BORDER1}`, outline: 'none', background: '#fff', cursor: 'pointer', textAlign: 'left', boxShadow: balance.excessMode === mode ? '0 10px 15px -3px rgba(18,18,23,.08), 0 4px 6px -2px rgba(18,18,23,.05)' : '0 1px 2px rgba(18,18,23,.05)' }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ font: '500 14px/20px Inter', color: INK }}>{title}</div>
        <div style={{ font: '400 14px/20px Inter', color: '#555B6D', marginTop: 2 }}>{hint}</div>
      </div>
      <Radio checked={balance.excessMode === mode} data-testid="Radio__7727b3" />
    </button>
  );
  return (
    <div style={{ padding: 12, background: EXCESS_BG, border: `1px solid ${EXCESS_BORDER}`, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={EXCESS_FG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
        <span style={{ font: '500 14px/20px Inter', color: EXCESS_FG }}>{ui('cpExcessQuestion', { amount })}</span>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {card('credit', ui('cpLeaveCredit'), ui('cpLeaveCreditHint', { amount }), 'cp-excess-credit')}
        {card('refund', ui('cpGiveChange'), ui('cpGiveChangeHint', { amount }), 'cp-excess-refund')}
      </div>
    </div>
  );
}

/**
 * NewPaymentEntryModal — step 2 of the two-step Cobros/Pagos flow.
 * Opens from the invoice payment-history popup ("+ Añadir cobro/pago").
 *
 * Props:
 *   dir          — 'in' (cobro / sales-invoice) | 'out' (pago / purchase-invoice)
 *   specName     — 'sales-invoice' | 'purchase-invoice'
 *   invoiceId    — invoice record id
 *   invoiceData  — full invoice record (docNo, bp, currency)
 *   scheduleId   — pending FIN_PaymentSchedule id (resolved from paymentPlan if absent)
 *   outstanding  — invoice outstanding amount (the target to cover)
 *   apiBaseUrl   — base URL incl. spec, e.g. http://host/sws/neo/sales-invoice
 *   onClose      — close callback (returns to the history popup)
 *   onSaved      — (result, state) callback after save/confirm to refresh the popup
 */
export default function NewPaymentEntryModal({
  dir = 'in',
  specName,
  invoiceId,
  invoiceData,
  scheduleId: scheduleIdProp,
  outstanding,
  apiBaseUrl,
  onClose,
  onSaved,
}) {
  const ui = useUI();
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);
  const isReceipt = dir === 'in';

  const currency = invoiceData?.['currency$_identifier'] || '';
  const docNo = invoiceData?.documentNo || '';
  const party = invoiceData?.['businessPartner$_identifier'] || '';
  const total = Number(outstanding) || 0;

  // ── catalogs ────────────────────────────────────────────────────────────────
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [methods, setMethods] = useState([]);
  const [methodId, setMethodId] = useState('');
  const [sources, setSources] = useState([]);
  const [scheduleId, setScheduleId] = useState(scheduleIdProp || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dateInvalid, setDateInvalid] = useState(false);
  // Business partner's preferred account for this direction (Classic parity) — set once
  // from the fetch response; read via ref so it doesn't need to be threaded into deps.
  const bpPreferredAccountIdRef = useRef('');

  const balance = usePaymentBalance({ total, dir, sources });

  // Fetch accounts, payment methods, credit sources, and (if needed) the schedule.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const post = (action) => apiFetch(`/${specName}/header/${invoiceId}/action/${action}`,
          { method: 'POST', body: '{}' }).catch(() => null);
        const [accRes, methRes, srcRes] = await Promise.all([
          post('invoiceAccounts'), post('invoicePaymentMethods'), post('invoiceCreditSources'),
        ]);
        if (cancelled) return;

        const accJson = await readJson(accRes);
        const accList = mapAccounts(accJson);
        const methList = mapMethods(await readJson(methRes));
        setAccounts(accList);
        setMethods(methList);
        setSources(mapSources(await readJson(srcRes)));
        bpPreferredAccountIdRef.current = accJson?.bpPreferredAccountId || '';
        const defaultMethodId = pickDefaultMethodId(accJson, accList, methList);
        setMethodId(defaultMethodId);
        setAccountId(pickDefaultAccountId(accList, defaultMethodId, bpPreferredAccountIdRef.current));

        if (!scheduleIdProp) {
          const sched = await fetchPendingSchedule(apiFetch, specName, invoiceId);
          if (sched && !cancelled) setScheduleId(sched);
        }
      } catch { /* silent — fields degrade gracefully */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // apiFetch is intentionally excluded: it is re-created per render by some
    // callers (and by the test mock), which would re-run this effect on every
    // render and loop. Re-fetch only when the target invoice changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specName, invoiceId]);

  // ── account/method dependency: only accounts that support the selected method ──
  const filteredAccounts = useMemo(
    () => accounts.filter(a => accountSupportsMethod(a, methodId)),
    [accounts, methodId],
  );

  const onMethodChange = useCallback((id) => {
    setMethodId(id);
    setAccountId(prevAccountId => {
      const account = accounts.find(a => a.id === prevAccountId);
      const stillValid = account && accountSupportsMethod(account, id);
      return stillValid ? prevAccountId : pickDefaultAccountId(accounts, id, bpPreferredAccountIdRef.current);
    });
  }, [accounts]);

  // ── save / confirm ────────────────────────────────────────────────────────
  const submit = useCallback(async (process) => {
    if (!date) { setDateInvalid(true); setError(ui('paymentDateRequired')); return; }
    if (!scheduleId) { setError(ui('paymentRequestFailed')); return; }
    if (!accountId) { setError(ui('paymentAccountRequired')); return; }
    setDateInvalid(false);
    setSaving(true);
    setError(null);
    try {
      const body = {
        scheduleId,
        actual_payment: String(balance.amount),
        payment_date: date,
        fin_financial_account_id: accountId,
        fin_paymentmethod_id: methodId || undefined,
        process, // 'draft' | 'confirm'
        creditSources: balance.consumedSources,
        overpaymentAction: overpaymentActionFor(balance),
      };
      const res = await apiFetch(`/${specName}/header/${invoiceId}/action/registerPayment`, {
        method: 'POST', body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.response?.error || json?.response?.status === -1) {
        throw new Error(extractSaveError(json, ui));
      }
      onSaved?.(json?.response?.data || {}, process === 'confirm' ? 'deposited' : 'draft');
    } catch (err) {
      setError(err.message || ui('cpSaveFailed'));
    } finally {
      setSaving(false);
    }
  }, [apiFetch, specName, invoiceId, scheduleId, accountId, methodId, date, balance, ui, onSaved]);

  const title = isReceipt ? ui('cpNewCollection') : ui('cpNewPayment');
  const deltaLabel = deltaLabelFor(balance, ui);
  // Importe, Fecha, Método de pago y Cuenta are mandatory to save or confirm. "Importe"
  // is satisfied by the total applied (cash + used credit), not the cash field alone —
  // a credit/saldo a favor line covering 100% legitimately leaves the cash amount at 0.
  const missingRequired = !(balance.funds > 0) || !date || !methodId || !accountId;
  const saveDisabled = saving || loading || missingRequired;
  const confirmDisabled = saving || missingRequired || !balance.canConfirm;

  // Floppy + check icons for the footer actions (Figma).
  const floppy = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={FG4} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(16,20,28,.46)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ width: 940, maxWidth: '100%', maxHeight: '100%', background: '#fff', borderRadius: 8, boxShadow: '0 0 0 1px rgba(18,18,23,.1), 0 24px 48px rgba(18,18,23,.03), 0 10px 18px rgba(18,18,23,.03), 0 5px 8px rgba(18,18,23,.04), 0 2px 4px rgba(18,18,23,.04)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
        data-testid="cp-new-payment-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* header — title only (Figma) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 20px', minHeight: 44, flexShrink: 0 }}>
          <h2 style={{ margin: 0, font: '600 20px/28px Inter', color: INK }}>{title}</h2>
        </div>
        <button
          type="button" onClick={onClose} aria-label={ui('close')} data-testid="cp-cancel"
          style={{ position: 'absolute', top: 6, right: 8, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 360, color: FG4, cursor: 'pointer', background: 'none', border: 'none', outline: 'none', fontSize: 20, lineHeight: 1, zIndex: 1 }}
        >×</button>

        {/* body */}
        <div style={{ padding: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 12, background: '#fff', flex: 1, minHeight: 0, overflow: 'auto' }}>

          {/* invoice-context widget */}
          <div style={{ padding: '0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '8px 12px', border: `1px solid ${BORDER1}`, borderRadius: 8, background: '#fff' }}>
              <WidgetCell label={isReceipt ? ui('customer') : ui('vendor')} data-testid="WidgetCell__client">{party || '—'}</WidgetCell>
              <WidgetCell label={ui('invoice')} data-testid="WidgetCell__invoice">
                <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{docNo || '—'}</span>
              </WidgetCell>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <span style={{ font: '400 12px/16px Inter', color: FG2 }}>{ui('statusColumn')}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content', font: '400 12px/16px Inter', padding: '4px 8px', borderRadius: 360, background: WIDGET_BG, color: FG2, marginTop: 2 }}>{ui('cpStatusDraft')}</span>
              </div>
              <WidgetCell label={ui('cpPendingPrefix')} valueColor={AMBER} data-testid="WidgetCell__pending">
                <MoneyAmount value={total} currency={currency} tone="neutral" className="text-[#C28800]" data-testid="MoneyAmount__cp-pending" />
              </WidgetCell>
            </div>
          </div>

          {/* 4 compact fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 0.85fr 1.15fr 1.15fr', gap: 20, padding: '0 20px' }}>
            <Field label={ui('cpAmount')} required data-testid="Field__7727b3">
              <div style={{ display: 'flex', alignItems: 'center', height: 40, border: `1px solid ${BORDER2}`, borderRadius: 8, background: '#fff', boxShadow: '0 1px 2px rgba(18,18,23,.05)', minWidth: 0, padding: '0 12px', gap: 4 }}>
                <input
                  type="text" inputMode="decimal" value={balance.amountStr}
                  onChange={e => balance.onAmountChange(e.target.value)}
                  onBlur={balance.onAmountBlur}
                  data-testid="cp-amount-input"
                  style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', textAlign: 'right', padding: 0, font: '400 14px/24px Inter', color: INK, fontVariantNumeric: 'tabular-nums' }}
                />
                <span style={{ font: '400 14px/24px Inter', color: FG3 }}>{curSuffix(currency)}</span>
              </div>
            </Field>
            <Field label={ui('date')} required data-testid="Field__7727b3">
              <DateField
                value={date}
                onChange={(v) => { setDate(v); if (dateInvalid) setDateInvalid(false); }}
                className={dateInvalid ? 'border-red-500 focus-within:ring-red-500' : ''}
                data-testid="DateField__7727b3" />
            </Field>
            <Field label={ui('cpPaymentMethod')} required data-testid="Field__7727b3">
              <CreatableSearchSelect
                key={loading ? 'method-loading' : 'method-loaded'}
                field={METHOD_FIELD}
                value={methodId}
                displayValue={methods.find(m => m.id === methodId)?.name || ''}
                onChange={onMethodChange}
                resolvedLabel={ui('cpPaymentMethod')}
                staticOptions={methods}
                data-testid="cp-method-select" />
            </Field>
            <Field label={ui('account')} required data-testid="Field__7727b3">
              <CreatableSearchSelect
                key={`account-${methodId}`}
                field={ACCOUNT_FIELD}
                value={accountId}
                displayValue={filteredAccounts.find(a => a.id === accountId)?.name || ''}
                onChange={(id) => setAccountId(id)}
                resolvedLabel={ui('account')}
                staticOptions={filteredAccounts}
                data-testid="cp-account-select" />
            </Field>
          </div>

          {/* unified credit / saldo a favor — credit (purple) + abono (green) rows */}
          {balance.lines.length > 0 && (
            <div style={{ padding: '0 20px' }}>
              <CreditSection
                rows={balance.lines}
                currency={currency}
                ui={ui}
                balance={balance}
                data-testid="CreditSection__7727b3" />
            </div>
          )}

          {/* balance summary */}
          <div style={{ padding: '0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 8, background: WIDGET_BG }}>
              <div><div style={{ font: '400 12px/16px Inter', color: FG2 }}>{ui('cpTotalInvoice')}</div><div style={{ font: '500 14px/20px Inter' }}><MoneyAmount value={balance.applied} currency={currency} tone="neutral" data-testid="MoneyAmount__cp-total" /></div></div>
              <span style={{ color: FG2, font: '400 12px/16px Inter' }}>·</span>
              <div><div style={{ font: '400 12px/16px Inter', color: FG2 }}>{ui('cpMoney')}</div><div style={{ font: '500 14px/20px Inter' }}><MoneyAmount value={balance.amount} currency={currency} tone="neutral" data-testid="MoneyAmount__cp-money" /></div></div>
              {balance.usedCredit > 0 && (<>
                <span style={{ color: FG2, font: '400 12px/16px Inter' }}>+</span>
                <div><div style={{ font: '400 12px/16px Inter', color: '#8D6CEF' }}>{ui('cpFavorBadge')}</div><div style={{ font: '500 14px/20px Inter' }}><MoneyAmount value={balance.usedCredit} currency={currency} tone="neutral" className="text-[#7047EB]" data-testid="MoneyAmount__cp-credit" /></div></div>
              </>)}
              <span style={{ color: FG2, font: '400 12px/16px Inter' }}>=</span>
              <div><div style={{ font: '400 12px/16px Inter', color: FG2 }}>{ui('cpApplied')}</div><div style={{ font: '500 14px/20px Inter' }}><MoneyAmount value={balance.funds} currency={currency} tone="neutral" data-testid="MoneyAmount__cp-applied" /></div></div>
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: 'right' }}><div style={{ font: '400 12px/16px Inter', color: FG2 }}>{deltaLabel}</div><div style={{ font: '600 14px/20px Inter' }}><MoneyAmount value={Math.abs(balance.diff)} currency={currency} tone="neutral" className={balance.isPartial ? 'text-[#C5234A]' : 'text-[#17663A]'} data-testid="MoneyAmount__cp-delta" /></div></div>
              <button type="button" data-testid="cp-equalize" onClick={balance.equalize} style={{ height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${BORDER2}`, outline: 'none', background: '#fff', boxShadow: '0 1px 2px rgba(18,18,23,.05)', cursor: 'pointer', color: INK, font: '500 14px/24px Inter' }}>{ui('cpEqualize')}</button>
            </div>
          </div>

          <div style={{ padding: '0 20px' }}>
            <ExcessBand
              balance={balance}
              currency={currency}
              ui={ui}
              isReceipt={isReceipt}
              data-testid="ExcessBand__7727b3" />
          </div>

          {error && <div style={{ padding: '0 20px', font: '500 12px/16px Inter', color: RED_FG }}>{error}</div>}
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: `1px solid ${BORDER1}`, background: '#fff', flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ height: 40, padding: '8px 12px', borderRadius: 360, border: 'none', outline: 'none', background: 'transparent', color: INK, font: '500 14px/24px Inter', cursor: 'pointer' }}>{ui('cancel')}</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" data-testid="cp-save-draft" onClick={() => submit('draft')} disabled={saveDisabled} style={{ height: 40, padding: '8px 12px', borderRadius: 360, border: `1px solid ${BORDER2}`, outline: 'none', background: '#fff', boxShadow: '0 1px 2px rgba(18,18,23,.05)', color: INK, font: '500 14px/24px Inter', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: saveDisabled ? 'not-allowed' : 'pointer', opacity: saveDisabled ? 0.5 : 1 }}>
              {floppy}{ui('save')}
            </button>
            <button type="button" data-testid="cp-confirm" onClick={() => submit('confirm')} disabled={confirmDisabled || loading} className="bg-[#121217] text-white hover:bg-[#FFD500] hover:text-[#121217] transition-colors" style={{ height: 40, padding: '8px 12px', borderRadius: 360, border: 'none', outline: 'none', font: '500 14px/24px Inter', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: confirmDisabled ? 'not-allowed' : 'pointer', opacity: confirmDisabled ? 0.45 : 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              {ui('cpConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
