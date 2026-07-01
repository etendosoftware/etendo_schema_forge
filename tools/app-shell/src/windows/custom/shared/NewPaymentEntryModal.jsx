import { useCallback, useEffect, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateField } from '@/components/ui/date-field';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import { usePaymentBalance, formatPlain } from './usePaymentBalance.js';
import { DirBadge } from './paymentModalUi.jsx';

// ─── design tokens (Etendo Design System — from the cobros/pagos handoff) ─────
const INK = '#121217';
const BORDER1 = '#E8E8ED';
const BORDER2 = '#D1D1DB';
const FG2 = '#3F3F50';
const FG3 = '#6C6C89';
const FG4 = '#8A8AA3';
const GREEN_FG = '#17663A';
const GREEN_BG = '#E2F7EA';
const RED_FG = '#C5234A';
const RED_BG = '#FDE2E9';
const PURPLE = '#5423E7';

const THEME = {
  credit: { ink: '#5423E7', inkDark: '#4B2EAE', inkSoft: '#7E6BB0', tagBg: '#EDE7FB', stepBorder: '#D6C9F5', useBorder: '#C9B8F5', useSoft: '#9A8AC0', border: '#E0D6FA', bg: '#F8F6FE' },
  abono:  { ink: '#0E7C66', inkDark: '#0B5A49', inkSoft: '#5E8C81', tagBg: '#D6F0E7', stepBorder: '#A6DBCE', useBorder: '#8ED0C0', useSoft: '#7FA89E', border: '#B6E3D8', bg: '#EDF8F4' },
};

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

function mapAccounts(json) {
  return (json?.items || []).map(a => ({
    id: a.id, name: a.label || a.name, defaultMethod: a.defaultPaymentMethod,
  }));
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

function Check({ checked, size = 17 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 4, flexShrink: 0,
      border: `1.5px solid ${checked ? INK : '#A9A9BC'}`, background: checked ? INK : '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {checked && (
        <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

function Radio({ checked }) {
  return (
    <div style={{
      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
      border: `1.5px solid ${checked ? INK : '#A9A9BC'}`, background: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {checked && <div style={{ width: 10, height: 10, borderRadius: '50%', background: INK }} />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <label style={{ font: '500 13px/16px Inter', color: FG2 }}>{label}</label>
      {children}
    </div>
  );
}

function kindGlyph(kind, size, color) {
  return kind === 'credit'
    ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
    : <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8h6M9 12h6" /></svg>;
}

// ─── consumable credit/abono row ──────────────────────────────────────────────
function CreditRow({ l, currency, ui, onToggle, onStep, step, showTag = true }) {
  const tc = THEME[l.kind] || THEME.credit;
  const tagLabel = l.kind === 'credit' ? ui('cpCreditBadge') : ui('cpFavorBadge');
  return (
    <div
      onClick={onToggle}
      data-testid={`cp-credit-row-${l.id}`}
      style={{ display: 'grid', gridTemplateColumns: '30px 1fr 120px 150px', gap: 12, alignItems: 'center', padding: '11px 16px', borderTop: `1px solid ${BORDER1}`, background: l.sel ? tc.tagBg + '55' : 'transparent', cursor: 'pointer' }}
    >
      <Check checked={l.sel} data-testid="Check__7727b3" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        {kindGlyph(l.kind, 15, tc.ink)}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ font: '600 12px/16px "JetBrains Mono", monospace', color: tc.inkDark }}>{l.doc}</span>
            {showTag && <span style={{ font: '500 10px/14px Inter', padding: '1px 6px', borderRadius: 5, background: tc.tagBg, color: tc.ink }}>{tagLabel}</span>}
          </div>
          <div style={{ font: '400 11px/15px Inter', color: tc.inkSoft, marginTop: 1 }}>{l.date}{l.note ? ` · ${l.note}` : ''}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right', font: '500 12px/16px Inter', color: tc.inkSoft, fontVariantNumeric: 'tabular-nums' }}>
        {ui('cpAvailShort')} {fmtCur(l.avail, currency)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        {l.sel ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button type="button" onClick={() => onStep(-step)} style={{ width: 28, height: 32, borderRadius: 6, border: `1px solid ${tc.stepBorder}`, background: '#fff', cursor: 'pointer', color: tc.ink, font: '600 14px/1 Inter' }}>−</button>
            <div style={{ minWidth: 78, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, height: 32, padding: '0 9px', border: `1px solid ${tc.useBorder}`, borderRadius: 7, background: '#fff' }}>
              <span style={{ font: '600 13px/1 Inter', color: tc.ink, fontVariantNumeric: 'tabular-nums' }}>{formatPlain(l.use)}</span>
              <span style={{ font: '400 11px/1 Inter', color: tc.useSoft }}>{curSuffix(currency)}</span>
            </div>
            <button type="button" onClick={() => onStep(step)} style={{ width: 28, height: 32, borderRadius: 6, border: `1px solid ${tc.stepBorder}`, background: '#fff', cursor: 'pointer', color: tc.ink, font: '600 14px/1 Inter' }}>+</button>
          </div>
        ) : <span style={{ font: '400 12px/16px Inter', color: tc.useSoft }}>{ui('cpUnused')}</span>}
      </div>
    </div>
  );
}

// ─── themed sub-block grouping one source type (adaptive: renders only if rows) ─
function CreditGroup({ kind, title, hint, rows, currency, ui, balance }) {
  if (!rows.length) return null;
  const tc = THEME[kind];
  const used = rows.reduce((acc, l) => acc + (l.sel ? l.use : 0), 0);
  return (
    <div style={{ border: `1px solid ${tc.border}`, borderRadius: 12, background: tc.bg, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
        {kindGlyph(kind, 15, tc.ink)}
        <span style={{ font: '600 14px/19px Inter', color: tc.inkDark }}>{title}</span>
        <span style={{ font: '400 12px/16px Inter', color: tc.inkSoft }}>· {hint}</span>
        <div style={{ flex: 1 }} />
        {used > 0 && <span style={{ font: '600 12px/16px Inter', color: tc.ink, fontVariantNumeric: 'tabular-nums' }}>− {fmtCur(used, currency)}</span>}
      </div>
      {rows.map(l => (
        <CreditRow
          key={l.id}
          l={l}
          currency={currency}
          ui={ui}
          step={balance.STEP}
          showTag={false}
          onToggle={() => balance.toggleLine(l.id)}
          onStep={(d) => balance.stepLine(l.id, d)}
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
      <div style={{ padding: '10px 14px', background: RED_BG, border: `1px solid ${RED_FG}33`, borderRadius: 10, font: '600 13px/18px Inter', color: RED_FG }}>
        {ui('cpExcessInline', { amount })}
      </div>
    );
  }
  return (
    <div style={{ padding: '12px 14px', background: '#E9F8EF', border: '1px solid #BEE6CF', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{ font: '600 13px/18px Inter', color: GREEN_FG }}>{ui('cpExcessQuestion', { amount })}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" data-testid="cp-excess-credit" onClick={() => balance.setExcessMode('credit')} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 9, border: `1px solid ${balance.excessMode === 'credit' ? GREEN_FG : BORDER2}`, background: balance.excessMode === 'credit' ? GREEN_BG : '#fff', cursor: 'pointer', textAlign: 'left' }}>
          <Radio checked={balance.excessMode === 'credit'} data-testid="Radio__7727b3" />
          <div><div style={{ font: '600 13px/17px Inter', color: INK }}>{ui('cpLeaveCredit')}</div><div style={{ font: '400 11px/15px Inter', color: FG3 }}>{ui('cpLeaveCreditHint', { amount })}</div></div>
        </button>
        <button type="button" data-testid="cp-excess-refund" onClick={() => balance.setExcessMode('refund')} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 9, border: `1px solid ${balance.excessMode === 'refund' ? GREEN_FG : BORDER2}`, background: balance.excessMode === 'refund' ? GREEN_BG : '#fff', cursor: 'pointer', textAlign: 'left' }}>
          <Radio checked={balance.excessMode === 'refund'} data-testid="Radio__7727b3" />
          <div><div style={{ font: '600 13px/17px Inter', color: INK }}>{ui('cpGiveChange')}</div><div style={{ font: '400 11px/15px Inter', color: FG3 }}>{ui('cpGiveChangeHint', { amount })}</div></div>
        </button>
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

        const accList = mapAccounts(await readJson(accRes));
        const methList = mapMethods(await readJson(methRes));
        setAccounts(accList);
        setMethods(methList);
        setSources(mapSources(await readJson(srcRes)));
        if (accList.length) setAccountId(accList[0].id);
        setMethodId(pickMethodId(accList, methList));

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
  const typeBadge = isReceipt ? ui('cpBadgeCollection') : ui('cpBadgePayment');
  const deltaLabel = deltaLabelFor(balance, ui);
  const deltaColor = balance.isPartial ? RED_FG : GREEN_FG;
  const confirmDisabled = saving || !date || !balance.canConfirm;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(16,20,28,.46)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ width: 760, maxWidth: '100%', maxHeight: '100%', background: '#fff', borderRadius: 14, boxShadow: '0 20px 50px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        data-testid="cp-new-payment-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', padding: '18px 24px 16px', gap: 12, borderBottom: `1px solid ${BORDER1}`, flexShrink: 0 }}>
          <DirBadge dir={dir} size={36} data-testid="DirBadge__7727b3" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, font: '700 18px/23px Inter', color: INK, letterSpacing: '-0.01em' }}>{title}</h2>
              <span style={{ font: '500 11px/16px Inter', padding: '2px 9px', borderRadius: 6, background: isReceipt ? GREEN_BG : RED_BG, color: isReceipt ? GREEN_FG : RED_FG }}>{typeBadge}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '500 11px/16px Inter', padding: '2px 9px', borderRadius: 6, background: '#F1F2F4', color: '#55556D' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A9A9BC' }} />{ui('cpStatusDraft')}
              </span>
            </div>
            <div style={{ font: '400 12px/16px Inter', color: FG3, marginTop: 3 }}>
              {ui('invoice')} <b style={{ color: FG2, fontWeight: 600, fontFamily: '"JetBrains Mono", monospace' }}>{docNo}</b>
              {party ? ` · ${party}` : ''} · {ui('cpPendingPrefix')} {fmtCur(total, currency)}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={ui('close')} style={{ color: FG3, cursor: 'pointer', background: 'none', border: 'none', marginTop: 2, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* body */}
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16, background: '#fff', flex: 1, minHeight: 0, overflow: 'auto' }}>
          {/* 4 compact fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
            <Field
              label={`${ui('cpAmount')} (${curSuffix(currency)})`}
              data-testid="Field__7727b3">
              <div style={{ display: 'flex', alignItems: 'center', height: 42, padding: '0 12px', border: `1px solid ${INK}`, borderRadius: 8, background: '#fff', minWidth: 0 }}>
                <input
                  type="text" inputMode="decimal" value={balance.amountStr}
                  onChange={e => balance.onAmountChange(e.target.value)}
                  onBlur={balance.onAmountBlur}
                  data-testid="cp-amount-input"
                  style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', textAlign: 'left', font: '600 15px/1 Inter', color: INK, fontVariantNumeric: 'tabular-nums' }}
                />
                <span style={{ font: '400 13px/1 Inter', color: FG3, marginLeft: 5 }}>{curSuffix(currency)}</span>
              </div>
            </Field>
            <Field label={ui('date')} data-testid="Field__7727b3">
              <DateField
                value={date}
                onChange={(v) => { setDate(v); if (dateInvalid) setDateInvalid(false); }}
                className={dateInvalid ? 'border-red-500 focus-within:ring-red-500' : ''}
                data-testid="DateField__7727b3" />
            </Field>
            <Field label={ui('cpPaymentMethod')} data-testid="Field__7727b3">
              <Select value={methodId} onValueChange={setMethodId} data-testid="Select__7727b3">
                <SelectTrigger style={{ height: 42, fontSize: 14 }} data-testid="SelectTrigger__7727b3"><SelectValue placeholder={ui('cpSelectMethod')} data-testid="SelectValue__7727b3" /></SelectTrigger>
                <SelectContent style={{ zIndex: 70 }} data-testid="SelectContent__7727b3">
                  {methods.map(m => <SelectItem key={m.id} value={m.id} data-testid="SelectItem__7727b3">{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={ui('account')} data-testid="Field__7727b3">
              <Select
                value={accountId}
                onValueChange={setAccountId}
                data-testid="Select__7727b3">
                <SelectTrigger style={{ height: 42, fontSize: 14 }} data-testid="SelectTrigger__7727b3"><SelectValue placeholder={ui('cpSelectAccount')} data-testid="SelectValue__7727b3" /></SelectTrigger>
                <SelectContent style={{ zIndex: 70 }} data-testid="SelectContent__7727b3">
                  {accounts.map(a => <SelectItem key={a.id} value={a.id} data-testid="SelectItem__7727b3">{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* credit / saldo a favor — split adaptive: each themed group renders only if it has rows */}
          {balance.lines.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <CreditGroup
                kind="credit"
                title={ui('cpCreditGroupTitle')}
                hint={ui('cpCreditGroupHint')}
                rows={balance.lines.filter(l => l.kind === 'credit')}
                currency={currency}
                ui={ui}
                balance={balance}
                data-testid="CreditGroup__7727b3" />
              <CreditGroup
                kind="abono"
                title={ui('cpFavorGroupTitle')}
                hint={ui('cpFavorGroupHint')}
                rows={balance.lines.filter(l => l.kind === 'abono')}
                currency={currency}
                ui={ui}
                balance={balance}
                data-testid="CreditGroup__7727b3" />
            </div>
          )}

          {/* balance summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '13px 16px', border: `1px solid ${BORDER1}`, borderRadius: 12, background: '#FCFCFD' }}>
            <div><div style={{ font: '400 11px/14px Inter', color: FG3 }}>{ui('cpTotalInvoice')}</div><div style={{ font: '600 15px/20px Inter', color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtCur(balance.applied, currency)}</div></div>
            <span style={{ color: FG4, font: '400 13px/1 Inter' }}>·</span>
            <div><div style={{ font: '400 11px/14px Inter', color: FG3 }}>{ui('cpMoney')}</div><div style={{ font: '600 15px/20px Inter', color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtCur(balance.amount, currency)}</div></div>
            {balance.usedCredit > 0 && (<>
              <span style={{ color: FG4, font: '600 14px/1 Inter' }}>+</span>
              <div><div style={{ font: '400 11px/14px Inter', color: PURPLE }}>{ui('cpFavorBadge')}</div><div style={{ font: '600 15px/20px Inter', color: PURPLE, fontVariantNumeric: 'tabular-nums' }}>{fmtCur(balance.usedCredit, currency)}</div></div>
            </>)}
            <span style={{ color: FG4, font: '600 14px/1 Inter' }}>=</span>
            <div><div style={{ font: '400 11px/14px Inter', color: FG3 }}>{ui('cpApplied')}</div><div style={{ font: '700 15px/20px Inter', color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtCur(balance.funds, currency)}</div></div>
            <div style={{ flex: 1 }} />
            <div style={{ textAlign: 'right' }}><div style={{ font: '400 11px/14px Inter', color: FG3 }}>{deltaLabel}</div><div style={{ font: '700 16px/20px Inter', color: deltaColor, fontVariantNumeric: 'tabular-nums' }}>{fmtCur(Math.abs(balance.diff), currency)}</div></div>
            <button type="button" data-testid="cp-equalize" onClick={balance.equalize} style={{ height: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${BORDER2}`, background: '#fff', cursor: 'pointer', color: FG2, font: '500 12px/1 Inter' }}>{ui('cpEqualize')}</button>
          </div>

          <ExcessBand
            balance={balance}
            currency={currency}
            ui={ui}
            isReceipt={isReceipt}
            data-testid="ExcessBand__7727b3" />

          {error && <div style={{ font: '500 12px/16px Inter', color: RED_FG }}>{error}</div>}
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderTop: `1px solid ${BORDER1}`, background: '#fff', flexShrink: 0 }}>
          <div style={{ flex: 1 }} />
          <button type="button" data-testid="cp-cancel" onClick={onClose} disabled={saving} style={{ height: 38, padding: '0 16px', borderRadius: 8, border: 'none', background: 'transparent', color: FG2, font: '500 13px/1 Inter', cursor: 'pointer' }}>{ui('cancel')}</button>
          <button type="button" data-testid="cp-save-draft" onClick={() => submit('draft')} disabled={saving || loading} style={{ height: 38, padding: '0 16px', borderRadius: 8, border: `1px solid ${BORDER2}`, background: '#fff', color: INK, font: '500 13px/1 Inter', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>{ui('save')}</button>
          <button type="button" data-testid="cp-confirm" onClick={() => submit('confirm')} disabled={confirmDisabled || loading} style={{ height: 38, padding: '0 16px', borderRadius: 8, border: 'none', background: INK, color: '#fff', font: '600 13px/1 Inter', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: confirmDisabled ? 'not-allowed' : 'pointer', opacity: confirmDisabled ? 0.45 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            {ui('cpConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
