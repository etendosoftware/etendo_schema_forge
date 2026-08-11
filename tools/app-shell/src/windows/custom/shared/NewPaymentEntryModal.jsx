import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DateField } from '@/components/ui/date-field';
import { Skeleton } from '@/components/ui/skeleton';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect.jsx';
import { MoneyAmount } from '@/components/ui/money-amount';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI } from '@/i18n';
import { isValidIban, normalizeIban } from '@/lib/validateIban.js';
import { usePaymentBalance, formatPlain, round2 } from './usePaymentBalance.js';
import { formatCurrency, getCurrencySymbol } from '@/lib/formatCurrency.js';
import { useConversionRate } from './useConversionRate.js';
import { useDocumentCurrency } from './useDocumentCurrency.js';

// ─── design tokens (Etendo Design System — cobros/pagos Figma handoff) ────────
const INK = 'hsl(var(--foreground))';
const BORDER1 = 'hsl(var(--border-subtle))';
const BORDER2 = 'hsl(var(--border-control))';
const FG2 = 'hsl(var(--muted-foreground))';
const FG3 = 'hsl(var(--muted-foreground))';
const FG4 = 'hsl(var(--text-disabled))';
const WIDGET_BG = 'hsl(var(--muted))';
const GREEN_FG = 'var(--status-success-fg)';
const GREEN_BG = 'var(--status-success-bg)';
const RED_FG = 'hsl(var(--destructive))';
const RED_BG = 'var(--status-destructive-bg)';
const AMBER = 'var(--status-warning-fg)';
// Stable reference for "no used sources" (create mode / no credit consumed) — a fresh []
// literal on every render would change identity each time and loop usePaymentBalance's seed
// effect (same failure mode as the apiFetch dependency fixed earlier).
const EMPTY_USED_SOURCES = [];
const EXCESS_BG = 'hsl(var(--muted))';
const EXCESS_BORDER = 'hsl(var(--border-control))';
const EXCESS_FG = 'hsl(var(--muted-foreground))';
// A foreign-currency payment with a rate of exactly 1 is rejected by the backend
// (compareTo(ONE)==0). Mirror that with a tight tolerance so the FE gate matches (ETP-4504).
const RATE_ONE_TOLERANCE = 1e-9;

// Per-source-kind row accents. credit → purple, abono (saldo a favor) → green.
const BADGE = {
  credit: { bg: 'var(--status-info-bg)', fg: 'var(--status-info-fg)' },
  abono: { bg: GREEN_BG, fg: GREEN_FG },
};

// Stable field descriptors for the CreatableSearchSelect pickers below — these
// use `staticOptions` (methods/accounts are already fetched in state), so no
// selectorUrl/token/dependsOn is needed; `key`/`id` only drive element ids/testids.
const METHOD_FIELD = { key: 'paymentMethod', id: 'paymentMethod', required: false };
const ACCOUNT_FIELD = { key: 'account', id: 'account', required: true };
const PIS_IBAN_FIELD = { key: 'pisIban', id: 'pisIban', required: true };
const PIS_TEMPLATE_FIELD = { key: 'pisTemplate', id: 'pisTemplate', required: true };

// ─── PIS (bank transfer via Salt Edge) — ETP-4406 ─────────────────────────────
const PIS_AMBER_TEXT = 'var(--status-warning-fg)';
const PIS_ALERT_BG = 'var(--status-warning-bg)';
const PIS_ELIGIBLE_CURRENCIES = new Set(['EUR', 'GBP']);
// 'initiated' is a real Salt Edge PIS status (seen for "connect"-flow payments) that isn't in the
// PSD2_PIS_PAYMENT ref-list's documented set (requested/authorizing/authorized/processing/executed/
// settled/failed) but does get returned/persisted — without it here, a payment sitting in that
// state gets misread as a terminal failure and the modal wrongly shows "transfer failed".
const PIS_NON_TERMINAL_STATUSES = ['requested', 'initiated', 'authorizing', 'authorized', 'processing'];
const PIS_STATUS_KEYS = {
  requested: 'cpPisStatusRequested',
  authorizing: 'cpPisStatusAuthorizing',
  authorized: 'cpPisStatusAuthorized',
  processing: 'cpPisStatusProcessing',
  executed: 'cpPisStatusExecuted',
};
// Template search-keys (match the AD "Template List for Bank Payments" ref-list values).
const PIS_TEMPLATE_SEPA = 'SEPA';
const PIS_TEMPLATE_DOMESTIC = 'DOMESTIC';
const PIS_TEMPLATE_FPS = 'FPS';

/**
 * Which creditor fields each template requires — mirrors the classic "Generate Bank Payment"
 * display logic and the PSD2 orchestrator's per-template validation:
 *   SEPA → creditor IBAN · DOMESTIC → IBAN + BBAN + account number · FPS → sort code + account number.
 */
function pisTemplateFields(template) {
  return {
    iban: template === PIS_TEMPLATE_SEPA || template === PIS_TEMPLATE_DOMESTIC,
    bban: template === PIS_TEMPLATE_DOMESTIC,
    accountNumber: template === PIS_TEMPLATE_DOMESTIC || template === PIS_TEMPLATE_FPS,
    sortCode: template === PIS_TEMPLATE_FPS,
  };
}

/** Default template search-key for a currency (EUR→SEPA, GBP→FPS); the user can change it. */
function defaultPisTemplate(currency) {
  return currency === 'GBP' ? PIS_TEMPLATE_FPS : PIS_TEMPLATE_SEPA;
}

/**
 * True when the creditor fields required by {@code template} are filled — SEPA needs an IBAN,
 * FPS needs sort code + account number, DOMESTIC needs at least one account identifier.
 */
function pisFieldsComplete(template, f) {
  // When an IBAN is provided it must be a structurally valid IBAN (ISO 13616 mod-97),
  // reusing the same check as offline financial-account creation (lib/validateIban.js).
  const ibanOk = !f.iban || isValidIban(f.iban);
  if (template === PIS_TEMPLATE_FPS) return !!(f.sortCode && f.accountNumber);
  if (template === PIS_TEMPLATE_DOMESTIC) return !!(f.iban || f.bban || f.accountNumber) && ibanOk;
  return !!f.iban && ibanOk; // SEPA (and any default)
}

/** Builds the PIS-specific fields for the registerPayment body when confirming with a bank transfer. */
function buildPisPaymentFields(template, creditorValues) {
  const show = pisTemplateFields(template);
  return {
    pis: true,
    pisTemplate: template,
    pisCreditorIban: show.iban ? (normalizeIban(creditorValues.iban) || undefined) : undefined,
    pisCreditorBban: show.bban ? (creditorValues.bban || undefined) : undefined,
    pisCreditorAccountNumber: show.accountNumber ? (creditorValues.accountNumber || undefined) : undefined,
    pisCreditorSortCode: show.sortCode ? (creditorValues.sortCode || undefined) : undefined,
  };
}

/** Currency suffix for plain-text (non-JSX) spots — the real symbol, Intl-derived. */
function curSuffix(currency) {
  return getCurrencySymbol(currency);
}
/** Formats an amount with its currency symbol in es-ES grouping ("6.420,00 €"), for the spots
 *  that need a plain string rather than JSX (e.g. interpolated into a ui() translation).
 *  Delegates entirely to the shared formatCurrency() — do not hand-roll Intl calls here. */
function fmtCur(n, currency) {
  return formatCurrency(currency, n);
}

/** Label for the balance delta (excess / missing / exact). */
function deltaLabelFor(balance, ui) {
  if (balance.isExcess) return ui('cpExcess');
  if (balance.isPartial) return ui('cpMissing');
  return ui('cpDifference');
}

/** Modal title: edit vs create, receipt (cobro) vs payment (pago). */
function modalTitleFor(isEdit, isReceipt, ui) {
  if (isEdit) return isReceipt ? ui('cpEditCollection') : ui('cpEditPayment');
  return isReceipt ? ui('cpNewCollection') : ui('cpNewPayment');
}

/** Over-payment action sent to the backend (only relevant when there is excess):
 *  'refund' → give change back (createRefundPayment), 'leave-credit' → keep as customer credit. */
function overpaymentActionFor(balance) {
  if (!balance.isExcess) return undefined;
  if (balance.excessMode === 'refund') return 'refund';
  if (balance.excessMode === 'credit') return 'leave-credit';
  return undefined;
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
    // Account currency (ETP-4504) — ISO code + DB id, used to decide whether the
    // payment crosses currencies and to render the amount in the account currency.
    // Absent on older backends → null (treated as "same currency, no conversion").
    currency: a.currency || null, currencyId: a.currencyId || null,
    // PSD2/PIS enrichment (ETP-4406) — absent on older backends, so default
    // to "not connected" rather than throwing off the eligibility gate.
    bankConnected: !!a.bankConnected, maskedPan: a.maskedPan || null,
  }));
}

// The backend returns id === IBAN (not the bank-account record id) so a picked account and a
// hand-typed IBAN are handled uniformly; the option label is "Name · IBAN".
function mapPisAccounts(json) {
  return (json?.items || []).map(a => ({
    id: a.iban || a.id,
    name: a.name ? `${a.name} · ${a.iban || a.id}` : (a.iban || a.id),
    iban: a.iban || a.id,
    default: !!a.default,
  }));
}

/** Maps the PIS template ref-list (`pisTemplates` action) to CreatableSearchSelect options. */
function mapPisTemplates(json) {
  return (json?.items || []).map(t => ({ id: t.value, name: t.label || t.value }));
}

/** True when a payment method's display name looks like a bank transfer (mirrors the backend heuristic). */
function looksLikeTransfer(methodName) {
  return /transfer|transferencia/i.test(methodName || '');
}

/**
 * Opens the Salt Edge SCA widget in a centered popup WINDOW (not a browser tab), matching the
 * Classic "Generate Bank Payment" behaviour. Passing window features (and a named target, so a
 * second confirm reuses the same window) makes the browser open a popup instead of a tab.
 */
function openPisPopup(url) {
  const w = 500;
  const h = 720;
  const left = Math.max(0, (window.screen?.width || 1024) / 2 - w / 2);
  const top = Math.max(0, (window.screen?.height || 768) / 2 - h / 2);
  const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
  return window.open(url, 'saltEdgePisWidget', features);
}

/** i18n key for a PIS payment status; any terminal status other than "executed" reads as a failure. */
function pisStatusKey(status) {
  return PIS_STATUS_KEYS[status] || 'cpPisStatusFailed';
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

/** Derived save/confirm gating + PIS eligibility state — extracted to keep the component's own cognitive complexity down. */
function computePaymentModalState({ dir, selectedAccount, selectedMethodObj, currency, saving, loading, balance, date, methodId, accountId, isForeign, rate, pisPolling, pisTemplate, pisIban, pisBban, pisAccountNumber, pisSortCode, ui }) {
  const pisEligible = dir === 'out'
    && !!selectedAccount?.bankConnected
    && looksLikeTransfer(selectedMethodObj?.name)
    && PIS_ELIGIBLE_CURRENCIES.has(currency);
  // A foreign-currency payment (invoice ≠ account currency) MUST carry a positive conversion
  // rate — otherwise the backend would silently apply 1:1 and post the wrong ledger amount.
  // The backend also rejects a rate of exactly 1 for a foreign payment (compareTo(ONE)==0 →
  // 400), so mirror that here (small tolerance) instead of letting the user hit a raw-English
  // 400 after submit. Both cases block Save AND Confirm (ETP-4504 B1 + QA cross-layer gap).
  const rateMissing = isForeign && rate <= 0;
  const rateIsOne = isForeign && rate > 0 && Math.abs(rate - 1) < RATE_ONE_TOLERANCE;
  const rateInvalid = rateMissing || rateIsOne;
  // Importe, Fecha, Método de pago y Cuenta are mandatory to save or confirm. "Importe"
  // is satisfied by the total applied (cash + used credit), not the cash field alone —
  // a credit/saldo a favor line covering 100% legitimately leaves the cash amount at 0.
  const missingRequired = balance.funds <= 0 || !date || !methodId || !accountId || rateInvalid;
  const saveDisabled = saving || loading || missingRequired;
  // For PIS, the template-specific creditor fields must be filled before confirming
  // (SEPA→IBAN, FPS→sort code + account number, DOMESTIC→any one identifier).
  const pisReady = !pisEligible || pisFieldsComplete(pisTemplate, {
    iban: pisIban, bban: pisBban, accountNumber: pisAccountNumber, sortCode: pisSortCode,
  });
  const confirmDisabled = saving || missingRequired || !balance.canConfirm || !!pisPolling || !pisReady;
  const confirmLabel = pisEligible ? ui('cpPisConfirmButton') : ui('cpConfirm');
  return { pisEligible, rateMissing, rateIsOne, saveDisabled, confirmDisabled, confirmLabel };
}

function Check({ checked, size = 18 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 4, flexShrink: 0,
      border: `1.5px solid ${checked ? INK : 'hsl(var(--text-disabled))'}`, background: checked ? INK : 'hsl(var(--card))',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {checked && (
        <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--card))" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
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
      border: `1.5px solid ${checked ? INK : BORDER2}`, background: 'hsl(var(--card))',
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
        {ui('cpAvailShort')} <MoneyAmount value={l.avail} currency={currency} tone="neutral" currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-avail" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        {l.sel ? (
          <div style={{ display: 'flex', alignItems: 'center', height: 40, border: `1px solid ${BORDER2}`, borderRadius: 8, background: 'hsl(var(--card))', boxShadow: '0 1px 2px hsl(var(--foreground) / .05)', padding: '0 12px', gap: 4, minWidth: 0 }}>
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
    <div style={{ border: `1px solid ${BORDER1}`, borderRadius: 8, background: 'hsl(var(--card))', boxShadow: '0 1px 2px hsl(var(--foreground) / .05)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px' }}>
        <span style={{ font: '600 12px/16px Inter', color: INK }}>{ui('cpCreditSectionTitle')}</span>
        <span style={{ font: '400 12px/16px Inter', color: FG3 }}>· {ui('cpCreditSectionHint')}</span>
        <div style={{ flex: 1 }} />
        {used > 0 && (
          <span style={{ font: '600 12px/16px Inter', color: INK, fontVariantNumeric: 'tabular-nums' }}>
            − <MoneyAmount value={used} currency={currency} tone="neutral" currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-used" />
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

// ─── excess band — an org-currency receipt resolves an overpayment by giving change back
// ("Dar vuelto") OR leaving it as credit ("Dejar a crédito"); both share the same gate. A
// foreign-currency receipt or any payment gets neither, so the excess blocks confirmation
// (adjust with "Igualar" only). ─
function ExcessBand({ balance, currency, ui, canLeaveCredit }) {
  if (!balance.isExcess) {
    return null;
  }
  const amount = fmtCur(balance.excessAmount, currency);
  const showCredit = canLeaveCredit;
  const showRefund = balance.canRefund;
  // No resolution applies (foreign-currency receipt or a payment) → surface guidance; the only
  // path is "Igualar"/adjust.
  if (!showCredit && !showRefund) {
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
      style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 12, border: `${balance.excessMode === mode ? 2 : 1}px solid ${balance.excessMode === mode ? INK : BORDER1}`, outline: 'none', background: 'hsl(var(--card))', cursor: 'pointer', textAlign: 'left', boxShadow: balance.excessMode === mode ? '0 10px 15px -3px hsl(var(--foreground) / .08), 0 4px 6px -2px hsl(var(--foreground) / .05)' : '0 1px 2px hsl(var(--foreground) / .05)' }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ font: '500 14px/20px Inter', color: INK }}>{title}</div>
        <div style={{ font: '400 14px/20px Inter', color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>{hint}</div>
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
        {showCredit && card('credit', ui('cpLeaveCredit'), ui('cpLeaveCreditHint', { amount }), 'cp-excess-credit')}
        {showRefund && card('refund', ui('cpGiveChange'), ui('cpGiveChangeHint', { amount }), 'cp-excess-refund')}
      </div>
    </div>
  );
}

// A plain text field styled like the modal's other inputs, for the DOMESTIC/FPS creditor
// identifiers (BBAN, account number, sort code) that are hand-typed, not selected.
function PisTextField({ label, value, onChange, placeholder, testid }) {
  return (
    <Field label={label} required data-testid={`Field__${testid}`}>
      <div style={{ display: 'flex', alignItems: 'center', height: 40, border: `1px solid ${BORDER2}`, borderRadius: 8, background: 'hsl(var(--card))', boxShadow: '0 1px 2px hsl(var(--foreground) / .05)', padding: '0 12px' }}>
        <input
          type="text" value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          data-testid={testid}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', padding: 0, font: '400 14px/24px Inter', color: INK }}
        />
      </div>
    </Field>
  );
}

// ─── PIS transfer section (Figma "Transferencia bancaria (PIS) – Salt Edge") ──
// Purchase-invoice payments only: lets the user hand off a real bank transfer
// to Salt Edge instead of just recording a manual payment. The template (from the AD
// "Template List for Bank Payments" ref-list) drives which creditor fields show, mirroring
// the classic "Generate Bank Payment" dialog. See the module-level PIS_* constants and
// pisEligible in NewPaymentEntryModal for the visibility gate.
function PisTransferSection({
  balance, currency, ui, party, account,
  templateOptions, template, onTemplateChange,
  ibanOptions, iban, onIbanChange,
  bban, onBbanChange, accountNumber, onAccountNumberChange, sortCode, onSortCodeChange,
}) {
  const show = pisTemplateFields(template);
  // The IBAN comes from a selector (supplier IBANs) but is also hand-typeable via onCreateRequest;
  // flag a structurally invalid entry so the user sees an inline error and Confirm stays disabled.
  const ibanInvalid = (iban || '').trim() !== '' && !isValidIban(iban);
  const alertParts = [
    ui('cpPisAlertTransfer', {
      dinero: fmtCur(balance.amount, currency),
      cuenta: account?.name || '',
      maskedPan: account?.maskedPan || '',
      proveedor: party || '',
    }),
  ];
  if (balance.usedCredit > 0) {
    alertParts.push(ui('cpPisAlertCredit', { credito: fmtCur(balance.usedCredit, currency) }));
  }
  alertParts.push(ui('cpPisAlertSca'));

  return (
    <div
      data-testid="cp-pis-section"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, background: WIDGET_BG, border: `1px solid ${BORDER2}`, borderRadius: 8, padding: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={FG4} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 10l10-6 10 6" /><path d="M3 21h18" /><path d="M5 21V10" /><path d="M19 21V10" /><path d="M9 21V10" /><path d="M15 21V10" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ font: '500 14px/24px Inter', color: INK }}>{ui('cpPisTitle')}</span>
          <span style={{ font: '400 14px/24px Inter', color: FG3 }}>{ui('cpPisSubtitle')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', border: `1px solid ${BORDER2}`, borderRadius: 8, background: WIDGET_BG, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FG4} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
          <span style={{ font: '400 14px/20px Inter', color: FG2 }}>
            <MoneyAmount value={balance.amount} currency={currency} tone="neutral" currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-pis-amount" />
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 45%', minWidth: 0 }}>
          <Field label={ui('cpPisTemplateLabel')} required data-testid="Field__pis-template">
            {/* White wrapper: CreatableSearchSelect is bg-transparent, so on the grey PIS card it
                would read grey — this keeps it white like the BBAN/account-number text inputs. */}
            <div style={{ background: 'hsl(var(--card))', borderRadius: 8 }}>
            <CreatableSearchSelect
              // CreatableSearchSelect seeds its options from staticOptions only on mount; the
              // ref-list loads async, so remount once it arrives to pick the options up.
              key={templateOptions.length ? 'pis-tpl-loaded' : 'pis-tpl-loading'}
              field={PIS_TEMPLATE_FIELD}
              value={template}
              displayValue={templateOptions.find(o => o.id === template)?.name || ''}
              onChange={onTemplateChange}
              resolvedLabel={ui('cpPisTemplateLabel')}
              staticOptions={templateOptions}
              data-testid="cp-pis-template-select" />
            </div>
          </Field>
        </div>
        {show.iban && (
          <div style={{ flex: '1 1 45%', minWidth: 0 }}>
            <Field label={ui('cpPisIbanLabel')} required data-testid="Field__pis-iban">
              {/* White wrapper — see the template select above. */}
              <div style={{ background: 'hsl(var(--card))', borderRadius: 8 }}>
              <CreatableSearchSelect
                // Same async-options remount as the template select above (supplier IBANs load async).
                key={ibanOptions.length ? 'pis-iban-loaded' : 'pis-iban-loading'}
                field={PIS_IBAN_FIELD}
                value={iban}
                displayValue={ibanOptions.find(o => o.id === iban)?.name || iban || ''}
                onChange={onIbanChange}
                resolvedLabel={ui('cpPisIbanLabel')}
                staticOptions={ibanOptions}
                createLabel={(q) => ui('cpPisIbanUseTyped', { iban: q })}
                onCreateRequest={(query, onCreated) => {
                  const typed = (query || '').trim();
                  if (typed) onCreated(typed, typed);
                }}
                data-testid="cp-pis-iban-select" />
              </div>
              {ibanInvalid && (
                <p style={{ font: '400 12px/16px Inter', color: RED_FG, marginTop: 4 }} data-testid="cp-pis-iban-error">
                  {ui('financeAccountsNewIbanInvalid')}
                </p>
              )}
            </Field>
          </div>
        )}
        {show.bban && (
          <div style={{ flex: '1 1 45%', minWidth: 0 }}>
            <PisTextField label={ui('cpPisBbanLabel')} value={bban} onChange={onBbanChange}
              placeholder={ui('cpPisBbanPlaceholder')} testid="cp-pis-bban" data-testid="PisTextField__bban" />
          </div>
        )}
        {show.sortCode && (
          <div style={{ flex: '1 1 45%', minWidth: 0 }}>
            <PisTextField label={ui('cpPisSortCodeLabel')} value={sortCode} onChange={onSortCodeChange}
              placeholder={ui('cpPisSortCodePlaceholder')} testid="cp-pis-sort-code" data-testid="PisTextField__sort" />
          </div>
        )}
        {show.accountNumber && (
          <div style={{ flex: '1 1 45%', minWidth: 0 }}>
            <PisTextField label={ui('cpPisAccountNumberLabel')} value={accountNumber} onChange={onAccountNumberChange}
              placeholder={ui('cpPisAccountNumberPlaceholder')} testid="cp-pis-account-number" data-testid="PisTextField__acct" />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: PIS_ALERT_BG, borderRadius: 8, padding: '12px 8px' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span style={{ font: '400 14px/20px Inter', color: PIS_AMBER_TEXT }}>{alertParts.join(' ')}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={FG4} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
        </svg>
        <span style={{ font: '400 12px/16px Inter', color: FG3 }}>{ui('cpPisHint')}</span>
      </div>
    </div>
  );
}

/** Footer actions (cancel / save draft / confirm, or the PIS-waiting state) — extracted to keep
 * the main component's cognitive complexity down. */
function PaymentModalFooter({
  saving, pisPolling, pisWindowClosed, ui, requestClose, cancelPisWait, onReopenPis,
  saveDisabled, confirmDisabled, loading, confirmLabel, onSaveDraft, onConfirm, floppy,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: `1px solid ${BORDER1}`, background: 'hsl(var(--card))', flexShrink: 0 }}>
      <button type="button" onClick={requestClose} disabled={saving} style={{ height: 40, padding: '8px 12px', borderRadius: 360, border: 'none', outline: 'none', background: 'transparent', color: INK, font: '500 14px/24px Inter', cursor: 'pointer' }}>{ui('cancel')}</button>
      {pisPolling ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} data-testid="cp-pis-waiting">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 14px/24px Inter', color: INK }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: AMBER, flexShrink: 0 }} />
            {pisWindowClosed ? ui('cpPisWindowClosed') : ui(pisStatusKey(pisPolling.status))}
          </span>
          {pisWindowClosed && (
            <button
              type="button" data-testid="cp-pis-reopen"
              onClick={onReopenPis}
              className="bg-[hsl(var(--foreground))] text-primary-foreground"
              style={{ height: 32, padding: '0 12px', borderRadius: 360, border: 'none', outline: 'none', font: '500 14px/24px Inter', cursor: 'pointer' }}
            >
              {ui('cpPisReopen')}
            </button>
          )}
          <button
            type="button" data-testid="cp-pis-cancel-wait"
            onClick={cancelPisWait}
            style={{ height: 32, padding: '0 12px', borderRadius: 360, border: `1px solid ${BORDER2}`, outline: 'none', background: 'hsl(var(--card))', color: INK, font: '500 14px/24px Inter', cursor: 'pointer' }}
          >
            {ui('cpPisCancelWait')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" data-testid="cp-save-draft" onClick={onSaveDraft} disabled={saveDisabled} style={{ height: 40, padding: '8px 12px', borderRadius: 360, border: `1px solid ${BORDER2}`, outline: 'none', background: 'hsl(var(--card))', boxShadow: '0 1px 2px hsl(var(--foreground) / .05)', color: INK, font: '500 14px/24px Inter', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: saveDisabled ? 'not-allowed' : 'pointer', opacity: saveDisabled ? 0.5 : 1 }}>
            {floppy}{ui('save')}
          </button>
          <button type="button" data-testid="cp-confirm" onClick={onConfirm} disabled={confirmDisabled || loading} className="bg-[hsl(var(--foreground))] text-primary-foreground hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] transition-colors" style={{ height: 40, padding: '8px 12px', borderRadius: 360, border: 'none', outline: 'none', font: '500 14px/24px Inter', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: confirmDisabled ? 'not-allowed' : 'pointer', opacity: confirmDisabled ? 0.45 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            {confirmLabel}
          </button>
        </div>
      )}
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
/** Normalizes a draft's payment date to yyyy-MM-dd (today when absent/invalid). */
function normalizeDraftDate(raw) {
  const today = () => new Date().toISOString().slice(0, 10);
  if (!raw) return today();
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? today() : d.toISOString().slice(0, 10);
}

/** Resolves a payment-method id from its display name (draft rows carry the name). */
function matchMethodIdByName(methods, name) {
  if (!name) return '';
  const hit = methods.find(m => m.name === name);
  return hit ? hit.id : '';
}

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
  // Existing draft being re-opened for editing (from the history popup). When
  // present the modal runs in edit mode: fields are prefilled from this record
  // and save/confirm update the SAME payment (its id is sent as `paymentId`).
  payment = null,
}) {
  const ui = useUI();
  const { token } = useAuth();
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);
  const isReceipt = dir === 'in';
  const isEdit = !!payment?.id;

  const currency = invoiceData?.['currency$_identifier'] || '';
  const docNo = invoiceData?.documentNo || '';
  const party = invoiceData?.['businessPartner$_identifier'] || '';
  const total = Number(outstanding) || 0;

  // ── catalogs ────────────────────────────────────────────────────────────────
  const [date, setDate] = useState(() => normalizeDraftDate(payment?.paymentDate));
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

  // ── PIS (Salt Edge bank transfer) state — ETP-4406 ──────────────────────────
  const [pisAccounts, setPisAccounts] = useState([]);
  const [pisTemplates, setPisTemplates] = useState([]);
  const [pisTemplate, setPisTemplate] = useState('');
  const [pisIban, setPisIban] = useState('');
  const [pisBban, setPisBban] = useState('');
  const [pisAccountNumber, setPisAccountNumber] = useState('');
  const [pisSortCode, setPisSortCode] = useState('');
  const [pisPolling, setPisPolling] = useState(null); // { pisPaymentId, status } | null
  const [pisWindowClosed, setPisWindowClosed] = useState(false);
  const pisAccountsFetchedRef = useRef(false);
  // registerPayment's response.data captured at confirm time, replayed into
  // onSaved once polling reaches the "executed" terminal status.
  const pisResultRef = useRef(null);
  // Handle to the Salt Edge popup window, so we can detect if the user closed it
  // before authorizing (and reopen it on demand).
  const pisPopupRef = useRef(null);
  // True once the popup has redirected back to our own PIS callback route (meaning the bank
  // authorization step completed) — as opposed to the user closing the bank tab/window early.
  // Without this, the popup's own auto-close (see PisCallbackPage.jsx) would be indistinguishable
  // from an early manual close, and we'd wrongly tell the user "you closed the window" right after
  // they successfully authorized.
  const pisReturnedRef = useRef(false);

  // Org currency (ETP-4504) — a receipt may only leave an overpayment as customer credit when
  // the invoice is in the organization currency; a foreign-currency invoice must adjust instead.
  const { orgCurrencyCode } = useDocumentCurrency({
    docCurrencyCode: currency, orderDate: date, apiBaseUrl, token,
  });
  const invoiceInOrgCurrency = !!orgCurrencyCode && currency === orgCurrencyCode;
  const canLeaveCredit = isReceipt && invoiceInOrgCurrency;

  const balance = usePaymentBalance({
    total, dir, sources, usedSources: payment?.creditSourcesUsed || EMPTY_USED_SOURCES,
    canLeaveCredit,
  });

  // Fetch accounts, payment methods, credit sources, and (if needed) the schedule.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const post = (action, body = '{}') => apiFetch(`/${specName}/header/${invoiceId}/action/${action}`,
          { method: 'POST', body }).catch(() => null);
        // Edit mode: the draft's own consumption must be added back into each source's avail
        // (and its already-used abono PSDs re-listed) so the modal can re-check them.
        const creditSourcesBody = isEdit ? JSON.stringify({ editPaymentId: payment.id }) : '{}';
        const [accRes, methRes, srcRes] = await Promise.all([
          post('invoiceAccounts'), post('invoicePaymentMethods'),
          post('invoiceCreditSources', creditSourcesBody),
        ]);
        if (cancelled) return;

        const accJson = await readJson(accRes);
        const accList = mapAccounts(accJson);
        const methList = mapMethods(await readJson(methRes));
        setAccounts(accList);
        setMethods(methList);
        setSources(mapSources(await readJson(srcRes)));
        bpPreferredAccountIdRef.current = accJson?.bpPreferredAccountId || '';
        if (isEdit) {
          // Edit mode: prefill from the draft instead of picking defaults.
          setMethodId(matchMethodIdByName(methList, payment.paymentMethod)
            || pickDefaultMethodId(accJson, accList, methList));
          setAccountId(payment.accountId
            || pickDefaultAccountId(accList, '', bpPreferredAccountIdRef.current));
          balance.onAmountChange(formatPlain(Number(payment.amount) || 0));
        } else {
          const defaultMethodId = pickDefaultMethodId(accJson, accList, methList);
          setMethodId(defaultMethodId);
          setAccountId(pickDefaultAccountId(accList, defaultMethodId, bpPreferredAccountIdRef.current));
        }

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

  // ── PIS (Salt Edge bank transfer) eligibility — ETP-4406 ────────────────────
  // Purchase-invoice payments only, on a bank-connected account, paid via a
  // transfer-like method, in a currency Salt Edge supports. Imperfect by design
  // (mirrors the backend's own heuristic) — not meant to be exhaustive.
  const selectedAccount = useMemo(() => accounts.find(a => a.id === accountId), [accounts, accountId]);
  const selectedMethodObj = useMemo(() => methods.find(m => m.id === methodId), [methods, methodId]);

  // ── multi-currency conversion (ETP-4504) ────────────────────────────────────
  // When the invoice currency differs from the selected account's currency, the user must
  // supply a conversion rate; the amount is then also shown in the account currency.
  const accountCurrency = selectedAccount?.currency || '';
  const isForeign = !!(accountCurrency && currency && accountCurrency !== currency);
  // Prefill the (editable) rate from the system exchange rate for invoice→account currency.
  const conversion = useConversionRate({
    fromCode: currency, toCode: accountCurrency, date, apiBaseUrl, token,
  });
  const [rateStr, setRateStr] = useState('');
  // Edit mode: the rate stored on the draft (ETP-4841). Kept as the raw string from the response
  // so a value like "0.680272" is shown back exactly, without float re-formatting.
  const persistedRate = isEdit && Number(payment?.conversionRate) > 0
    ? String(payment.conversionRate)
    : null;
  // It only applies while the modal is showing the currency PAIR it was saved for: the rate is a
  // property of the pair, not of the account, so switching between two accounts in the same
  // currency keeps it, while another foreign pair must reseed from the DB (showing a USD→EUR rate
  // in a USD→GBP field would be a silent accounting error — ETP-4504 W1).
  const persistedRateApplies = persistedRate != null
    && !!accountCurrency && accountCurrency === payment?.accountCurrency;
  const persistedRateSeededRef = useRef(false);
  // Seed the rate field, re-running when the currency pair (accountCurrency) or the fetched rate
  // changes. Crucially this also CLEARS the field when moving to a pair that has no DB rate, so a
  // stale rate from a previously-selected account never silently carries across currency pairs
  // (ETP-4504 W1). Manual edits persist until one of these inputs changes; when not foreign the
  // field is kept empty. A persisted rate wins over the system one and is seeded exactly once per
  // visit to its pair, so neither a late validate-exchange-rate response nor a date change nor a
  // subsequent manual edit can overwrite what the user saved on the draft (ETP-4841).
  useEffect(() => {
    if (!isForeign) {
      persistedRateSeededRef.current = false;
      setRateStr('');
      return;
    }
    if (persistedRateApplies) {
      if (!persistedRateSeededRef.current) {
        persistedRateSeededRef.current = true;
        setRateStr(persistedRate);
      }
      return;
    }
    persistedRateSeededRef.current = false;
    setRateStr(conversion.rate != null ? String(conversion.rate) : '');
  }, [isForeign, accountCurrency, conversion.rate, persistedRateApplies, persistedRate]);
  // Parse the typed rate (accepts "0.92" or "0,92"); null when blank/invalid/non-positive.
  const rate = useMemo(() => {
    const n = parseFloat(String(rateStr).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [rateStr]);
  // Amount expressed in the account currency = payment amount × rate (recomputes live on both).
  const amountInAccount = (isForeign && rate != null) ? round2(balance.amount * rate) : null;

  // Derived gating/eligibility state, computed together since save/confirm disabled-ness,
  // the PIS block's visibility, and its "ready to confirm" state all share the same inputs.
  const { pisEligible, rateMissing, rateIsOne, saveDisabled, confirmDisabled, confirmLabel } =
    computePaymentModalState({
      dir, selectedAccount, selectedMethodObj, currency, saving, loading, balance, date, methodId,
      accountId, isForeign, rate, pisPolling, pisTemplate, pisIban, pisBban, pisAccountNumber,
      pisSortCode, ui,
    });

  // Fetch the supplier's PIS-eligible bank accounts + the payment-template ref-list once,
  // the first time the block becomes eligible (avoids the requests for non-PIS payments).
  useEffect(() => {
    if (!pisEligible || pisAccountsFetchedRef.current) return;
    pisAccountsFetchedRef.current = true;
    (async () => {
      try {
        const post = (action) => apiFetch(`/${specName}/header/${invoiceId}/action/${action}`,
          { method: 'POST', body: '{}' }).catch(() => null);
        const [accRes, tplRes] = await Promise.all([
          post('pisSupplierAccounts'), post('pisTemplates'),
        ]);
        const items = mapPisAccounts(await readJson(accRes));
        setPisAccounts(items);
        const def = items.find(a => a.default) || items[0];
        if (def) setPisIban(def.iban);

        const templates = mapPisTemplates(await readJson(tplRes));
        setPisTemplates(templates);
        // Default the template by currency (EUR→SEPA, GBP→FPS) when that value exists.
        const preferred = defaultPisTemplate(currency);
        const initial = templates.find(t => t.id === preferred) || templates[0];
        if (initial) setPisTemplate(initial.id);
      } catch { /* silent — the block degrades to empty; user can't confirm PIS */ }
    })();
    // apiFetch/specName/invoiceId/currency intentionally excluded — same rationale as the
    // catalog effect above; this must run once per eligibility flip, not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pisEligible]);

  // Listen for the "pis-completed" message the PIS callback popup (PisCallbackPage.jsx) posts to
  // its opener right before closing itself. This marks the bank authorization as actually reached,
  // so the closed-popup heuristic below doesn't mistake it for an early manual close.
  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'pis-completed') {
        pisReturnedRef.current = true;
        setPisWindowClosed(false);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Poll pisPaymentStatus every ~3s while a PIS transfer is awaiting SCA
  // authorization. Re-runs on every status change (new object identity),
  // scheduling the next poll or reacting to a terminal status inline.
  useEffect(() => {
    if (!pisPolling) return undefined;
    if (pisPolling.status === 'executed') {
      // Force-close the Salt Edge popup from the opener side rather than waiting on its own
      // return page to close itself — that page is a shared Classic-styled static resource
      // and self-close can be delayed/blocked, leaving the user staring at it needlessly.
      pisPopupRef.current?.close();
      pisPopupRef.current = null;
      toast.success(ui('paymentRegistered'));
      onSaved?.(pisResultRef.current || {}, 'deposited');
      setPisPolling(null);
      return undefined;
    }
    if (!PIS_NON_TERMINAL_STATUSES.includes(pisPolling.status)) {
      // Terminal, non-executed status (or an unrecognized one) — stop polling,
      // surface an inline error, and let the user retry from the editable form.
      pisPopupRef.current?.close();
      pisPopupRef.current = null;
      setError(ui('cpPisFailedError'));
      setPisPolling(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Surface whether the user closed the Salt Edge window before authorizing. We keep polling
      // regardless (the bank webhook can still confirm an authorization completed just before the
      // window was closed), but the UI offers to reopen it. window.closed is only reliable for
      // popups we opened ourselves, which is the case here. Skip this when the popup already
      // reached our own callback route (pisReturnedRef) — its auto-close on success would
      // otherwise look identical to the user bailing out early.
      if (!cancelled) {
        setPisWindowClosed(!!pisPopupRef.current && pisPopupRef.current.closed && !pisReturnedRef.current);
      }
      try {
        const res = await apiFetch(`/${specName}/header/${invoiceId}/action/pisPaymentStatus`, {
          method: 'POST', body: JSON.stringify({ pisPaymentId: pisPolling.pisPaymentId }),
        });
        const json = await readJson(res);
        if (cancelled) return;
        setPisPolling(prev => (prev ? { ...prev, status: json?.status || 'failed' } : prev));
      } catch {
        if (!cancelled) setPisPolling(prev => (prev ? { ...prev, status: 'failed' } : prev));
      }
    }, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pisPolling]);
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
        // Conversion rate when the invoice and account currencies differ (ETP-4504); the
        // backend recomputes the account-currency amount authoritatively from this rate.
        conversionRate: (isForeign && rate != null) ? String(rate) : undefined,
        // Edit mode: update this existing draft instead of creating a new one.
        paymentId: payment?.id || undefined,
      };
      // PIS only ever accompanies the primary "confirm" action — Guardar
      // borrador keeps recording a plain manual payment, byte-for-byte
      // unchanged, even when the PIS block is showing. Only the creditor fields
      // the chosen template actually uses are sent, so a stale value from a
      // previously-selected template (e.g. a preselected IBAN) never leaks into
      // an FPS/DOMESTIC request.
      if (pisEligible && process === 'confirm') {
        Object.assign(body, buildPisPaymentFields(pisTemplate, {
          iban: pisIban, bban: pisBban, accountNumber: pisAccountNumber, sortCode: pisSortCode,
        }));
      }
      const res = await apiFetch(`/${specName}/header/${invoiceId}/action/registerPayment`, {
        method: 'POST', body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.response?.error || json?.response?.status === -1) {
        throw new Error(extractSaveError(json, ui));
      }
      const data = json?.response?.data || {};
      if (body.pis && data.pisPaymentUrl && data.pisPaymentId) {
        pisResultRef.current = data;
        pisPopupRef.current = openPisPopup(data.pisPaymentUrl);
        pisReturnedRef.current = false;
        setPisWindowClosed(false);
        setPisPolling({ pisPaymentId: data.pisPaymentId, status: 'requested' });
        return;
      }
      onSaved?.(data, process === 'confirm' ? 'deposited' : 'draft');
    } catch (err) {
      setError(err.message || ui('cpSaveFailed'));
    } finally {
      setSaving(false);
    }
  }, [apiFetch, specName, invoiceId, scheduleId, accountId, methodId, date, balance, ui, onSaved,
    pisEligible, pisTemplate, pisIban, pisBban, pisAccountNumber, pisSortCode, isForeign, rate]);

  // Cancel a pending PIS wait: the payment was already processed to PPM (so the invoice shows as
  // paid), but the transfer was never authorized — so we ask the backend to reactivate + delete it
  // (com.etendoerp.payment.removal), restoring the invoice, then refresh via onSaved. Best-effort:
  // if the backend refuses (transfer already in progress), we still leave the wait.
  const cancelPisWait = useCallback(async () => {
    const pid = pisPolling?.pisPaymentId;
    pisPopupRef.current?.close();
    setPisWindowClosed(false);
    setPisPolling(null);
    if (pid) {
      try {
        await apiFetch(`/${specName}/header/${invoiceId}/action/cancelPisPayment`, {
          method: 'POST', body: JSON.stringify({ pisPaymentId: pid }),
        });
      } catch { /* best-effort — the invoice refresh below still reflects the real state */ }
    }
    onSaved?.({ cancelled: true }, 'reverted');
  }, [apiFetch, specName, invoiceId, pisPolling, onSaved]);

  // Reopens the Salt Edge popup after the user closed it before authorizing — reuses the
  // last registerPayment result (which carries the pisPaymentUrl) rather than re-requesting it.
  const onReopenPis = useCallback(() => {
    pisPopupRef.current = openPisPopup(pisResultRef.current?.pisPaymentUrl);
    pisReturnedRef.current = false;
    setPisWindowClosed(false);
  }, []);

  // Closing the modal while a PIS transfer is still pending must also undo the PPM payment,
  // otherwise the invoice is left looking paid for a transfer that never happened.
  const requestClose = useCallback(() => {
    if (pisPolling) { cancelPisWait(); return; }
    onClose?.();
  }, [pisPolling, cancelPisWait, onClose]);

  const title = modalTitleFor(isEdit, isReceipt, ui);
  const deltaLabel = deltaLabelFor(balance, ui);

  // Floppy + check icons for the footer actions (Figma).
  const floppy = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={FG4} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'hsl(var(--foreground) / 0.46)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={requestClose}
    >
      <div
        style={{ width: 940, maxWidth: '100%', maxHeight: '100%', background: 'hsl(var(--card))', borderRadius: 8, boxShadow: '0 0 0 1px hsl(var(--foreground) / .1), 0 24px 48px hsl(var(--foreground) / .03), 0 10px 18px hsl(var(--foreground) / .03), 0 5px 8px hsl(var(--foreground) / .04), 0 2px 4px hsl(var(--foreground) / .04)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
        data-testid="cp-new-payment-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* header — title only (Figma) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 20px', minHeight: 44, flexShrink: 0 }}>
          <h2 style={{ margin: 0, font: '600 20px/28px Inter', color: INK }}>{title}</h2>
        </div>
        <button
          type="button" onClick={requestClose} aria-label={ui('close')} data-testid="cp-cancel"
          style={{ position: 'absolute', top: 6, right: 8, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 360, color: FG4, cursor: 'pointer', background: 'none', border: 'none', outline: 'none', fontSize: 20, lineHeight: 1, zIndex: 1 }}
        >×</button>

        {/* body */}
        <div style={{ padding: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 12, background: 'hsl(var(--card))', flex: 1, minHeight: 0, overflow: 'auto' }}>

          {/* invoice-context widget */}
          <div style={{ padding: '0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '8px 12px', border: `1px solid ${BORDER1}`, borderRadius: 8, background: 'hsl(var(--card))' }}>
              <WidgetCell label={isReceipt ? ui('customer') : ui('vendor')} data-testid="WidgetCell__client">{party || '—'}</WidgetCell>
              <WidgetCell label={ui('invoice')} data-testid="WidgetCell__invoice">
                <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{docNo || '—'}</span>
              </WidgetCell>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <span style={{ font: '400 12px/16px Inter', color: FG2 }}>{ui('statusColumn')}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content', font: '400 12px/16px Inter', padding: '4px 8px', borderRadius: 360, background: WIDGET_BG, color: FG2, marginTop: 2 }}>{ui('cpStatusDraft')}</span>
              </div>
              <WidgetCell label={ui('cpPendingPrefix')} valueColor={AMBER} data-testid="WidgetCell__pending">
                <MoneyAmount value={total} currency={currency} tone="neutral" className="text-[var(--status-warning-fg)]" currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-pending" />
              </WidgetCell>
            </div>
          </div>

          {/* 4 compact fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 0.85fr 1.15fr 1.15fr', gap: 20, padding: '0 20px' }}>
            <Field label={ui('cpAmount')} required data-testid="Field__7727b3">
              <div style={{ display: 'flex', alignItems: 'center', height: 40, border: `1px solid ${BORDER2}`, borderRadius: 8, background: 'hsl(var(--card))', boxShadow: '0 1px 2px hsl(var(--foreground) / .05)', minWidth: 0, padding: '0 12px', gap: 4 }}>
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
                className={dateInvalid ? 'border-destructive focus-within:ring-destructive' : ''}
                data-testid="DateField__7727b3" />
            </Field>
            <Field label={ui('cpPaymentMethod')} required data-testid="Field__7727b3">
              {loading ? (
                <Skeleton className="h-10 w-full rounded-lg" data-testid="cp-method-select-skeleton" />
              ) : (
                <CreatableSearchSelect
                  key="method-loaded"
                  field={METHOD_FIELD}
                  value={methodId}
                  displayValue={methods.find(m => m.id === methodId)?.name || ''}
                  onChange={onMethodChange}
                  resolvedLabel={ui('cpPaymentMethod')}
                  staticOptions={methods}
                  data-testid="cp-method-select" />
              )}
            </Field>
            <Field label={ui('account')} required data-testid="Field__7727b3">
              {loading ? (
                <Skeleton className="h-10 w-full rounded-lg" data-testid="cp-account-select-skeleton" />
              ) : (
                <CreatableSearchSelect
                  key={`account-${methodId}`}
                  field={ACCOUNT_FIELD}
                  value={accountId}
                  displayValue={filteredAccounts.find(a => a.id === accountId)?.name || ''}
                  onChange={(id) => setAccountId(id)}
                  resolvedLabel={ui('account')}
                  staticOptions={filteredAccounts}
                  data-testid="cp-account-select" />
              )}
            </Field>
          </div>

          {/* multi-currency conversion (ETP-4504) — only when invoice currency ≠ account currency */}
          {isForeign && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: '0 20px' }} data-testid="cp-conversion-fields">
              <Field label={ui('cpConversionRate')} required data-testid="Field__conversion-rate">
                <div style={{ display: 'flex', alignItems: 'center', height: 40, border: `1px solid ${BORDER2}`, borderRadius: 8, background: 'hsl(var(--card))', boxShadow: '0 1px 2px hsl(var(--foreground) / .05)', minWidth: 0, padding: '0 12px', gap: 4 }}>
                  <input
                    type="text" inputMode="decimal" value={rateStr}
                    onChange={e => setRateStr(e.target.value)}
                    data-testid="cp-conversion-rate-input"
                    style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', textAlign: 'right', padding: 0, font: '400 14px/24px Inter', color: INK, fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
                {(rateMissing || rateIsOne) && (
                  <p style={{ font: '400 12px/16px Inter', color: RED_FG, marginTop: 4 }} data-testid="cp-conversion-rate-error">
                    {ui(rateIsOne ? 'cpConversionRateInvalid' : 'cpConversionRateRequired')}
                  </p>
                )}
              </Field>
              <Field label={ui('cpAmountInAccount')} data-testid="Field__amount-in-account">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: 40, border: `1px solid ${BORDER1}`, borderRadius: 8, background: WIDGET_BG, minWidth: 0, padding: '0 12px', font: '400 14px/24px Inter', color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="cp-amount-in-account">
                  {amountInAccount == null
                    ? '—'
                    : <MoneyAmount value={amountInAccount} currency={accountCurrency} tone="neutral" currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-amount-in-account" />}
                </div>
              </Field>
            </div>
          )}

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
              <div><div style={{ font: '400 12px/16px Inter', color: FG2 }}>{ui('cpTotalInvoice')}</div><div style={{ font: '500 14px/20px Inter' }}><MoneyAmount value={balance.applied} currency={currency} tone="neutral" currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-total" /></div></div>
              <span style={{ color: FG2, font: '400 12px/16px Inter' }}>·</span>
              <div><div style={{ font: '400 12px/16px Inter', color: FG2 }}>{ui('cpMoney')}</div><div style={{ font: '500 14px/20px Inter' }}><MoneyAmount value={balance.amount} currency={currency} tone="neutral" currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-money" /></div></div>
              {balance.usedCredit > 0 && (<>
                <span style={{ color: FG2, font: '400 12px/16px Inter' }}>+</span>
                <div><div style={{ font: '400 12px/16px Inter', color: 'hsl(var(--primary))' }}>{ui('cpFavorBadge')}</div><div style={{ font: '500 14px/20px Inter' }}><MoneyAmount value={balance.usedCredit} currency={currency} tone="neutral" className="text-[hsl(var(--primary))]" currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-credit" /></div></div>
              </>)}
              <span style={{ color: FG2, font: '400 12px/16px Inter' }}>=</span>
              <div><div style={{ font: '400 12px/16px Inter', color: FG2 }}>{ui('cpApplied')}</div><div style={{ font: '500 14px/20px Inter' }}><MoneyAmount value={balance.funds} currency={currency} tone="neutral" currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-applied" /></div></div>
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: 'right' }}><div style={{ font: '400 12px/16px Inter', color: FG2 }}>{deltaLabel}</div><div style={{ font: '600 14px/20px Inter' }}><MoneyAmount value={Math.abs(balance.diff)} currency={currency} tone="neutral" className={balance.isPartial ? 'text-[hsl(var(--destructive))]' : 'text-[var(--status-success-fg)]'} currencyDisplay="narrowSymbol" data-testid="MoneyAmount__cp-delta" /></div></div>
              <button type="button" data-testid="cp-equalize" onClick={balance.equalize} style={{ height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${BORDER2}`, outline: 'none', background: 'hsl(var(--card))', boxShadow: '0 1px 2px hsl(var(--foreground) / .05)', cursor: 'pointer', color: INK, font: '500 14px/24px Inter' }}>{ui('cpEqualize')}</button>
            </div>
          </div>

          {pisEligible && (
            <div style={{ padding: '0 20px' }}>
              <PisTransferSection
                balance={balance}
                currency={currency}
                ui={ui}
                party={party}
                account={selectedAccount}
                templateOptions={pisTemplates}
                template={pisTemplate}
                onTemplateChange={setPisTemplate}
                ibanOptions={pisAccounts}
                iban={pisIban}
                onIbanChange={setPisIban}
                bban={pisBban}
                onBbanChange={setPisBban}
                accountNumber={pisAccountNumber}
                onAccountNumberChange={setPisAccountNumber}
                sortCode={pisSortCode}
                onSortCodeChange={setPisSortCode}
                data-testid="PisTransferSection__7727b3" />
            </div>
          )}

          <div style={{ padding: '0 20px' }}>
            <ExcessBand
              balance={balance}
              currency={currency}
              ui={ui}
              canLeaveCredit={canLeaveCredit}
              data-testid="ExcessBand__7727b3" />
          </div>
          {error && <div style={{ padding: '0 20px', font: '500 12px/16px Inter', color: RED_FG }}>{error}</div>}
        </div>

        {/* footer */}
        <PaymentModalFooter
          saving={saving}
          pisPolling={pisPolling}
          pisWindowClosed={pisWindowClosed}
          ui={ui}
          requestClose={requestClose}
          cancelPisWait={cancelPisWait}
          onReopenPis={onReopenPis}
          saveDisabled={saveDisabled}
          confirmDisabled={confirmDisabled}
          loading={loading}
          confirmLabel={confirmLabel}
          onSaveDraft={() => submit('draft')}
          onConfirm={() => submit('confirm')}
          floppy={floppy}
          data-testid="PaymentModalFooter__7727b3" />
      </div>
    </div>
  );
}
