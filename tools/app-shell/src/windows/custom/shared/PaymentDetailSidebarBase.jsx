import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { WRITEOFF_EPSILON } from '@/components/contract-ui/writeoffMath.js';
import { paymentDisplayState } from './paymentStatuses';
import { useRecordRefreshSignal } from './useRecordRefreshSignal';
import { jsonHeaders } from '../../../lib/sessionHeaders.js';

function fmtAmt(val, currency) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(currency || 'EUR', n);
}

/**
 * The payment's booked conversion rate, shown verbatim. Deliberately allows up to 6 decimals
 * instead of clamping to the org's standard precision (2) the way the invoice preview's rate note
 * does: the whole point is that the user reads back the rate they typed in the Cobros/Pagos modal
 * (ETP-4841), and "0,68" would hide the 0,680272 that was actually applied.
 */
function fmtRate(rate) {
  return rate.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/**
 * The confirmed-event label, which has to agree with the header pill (ETP-4895).
 *
 * The plain key's "· depositado" suffix contradicts both of the states a PIS transfer can leave the
 * payment in: while it is only confirmed and not yet withdrawn the header reads "Pago en progreso",
 * and once the bank refuses it after committing it reads "Pago con error" — a green
 * "confirmado · depositado" under that is the opposite of what happened.
 *
 * @param isIn true for collections (payment-in), false for payments out
 * @param state the payment's display state from `paymentDisplayState`
 */
function confirmedLabelKey(isIn, state) {
  if (state === 'error') return isIn ? 'cobroConfirmadoRechazado' : 'pagoConfirmadoRechazado';
  if (state === 'inProgress') return isIn ? 'cobroConfirmadoEnProgreso' : 'pagoConfirmadoEnProgreso';
  return isIn ? 'cobroConfirmado' : 'pagoConfirmado';
}

function fmtDate(raw) {
  if (!raw) return '';
  const str = String(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(str);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) +
    (m[4] ? ` · ${m[4]}` : '');
}

function Separator() {
  return <div style={{ height: 0, border: '1px solid hsl(var(--foreground) / 0.05)', alignSelf: 'stretch' }} />;
}

function BreakdownRow({ label, value, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ font: '400 12px/16px Inter', color: 'hsl(var(--muted-foreground))' }}>{label}</span>
      <span className="tabular-nums" style={{ font: '500 14px/20px Inter', color: muted ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}

function parseAdDate(raw) {
  if (!raw) return null;
  const str = String(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(str);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  return isNaN(d.getTime()) ? null : d;
}

function fmtNow(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) + ` · ${h}:${m}`;
}

function eventStorageKey(id, kind) {
  return `etgo:payment:${id}:${kind}`;
}

function readEventAt(id, kind) {
  if (!id) return null;
  try {
    const stored = window.localStorage.getItem(eventStorageKey(id, kind));
    return stored ? new Date(stored) : null;
  } catch {
    return null;
  }
}

function writeEventAt(id, kind, date) {
  try {
    window.localStorage.setItem(eventStorageKey(id, kind), date.toISOString());
  } catch { /* storage unavailable (privacy mode, quota) — non-fatal */ }
}

/**
 * Which activity event each process button records. Anything not listed is a confirmation, which
 * is what every other payment process amounts to from the history's point of view.
 */
const EVENT_TYPE_BY_PROCESS = {
  etprReactivatePayment: 'reactivated',
  retryPisPayment: 'retried',
};

/** Dots for the event types that are neither a confirmation nor a rejection. */
const EVENT_DOT = {
  reactivated: 'hsl(var(--muted-foreground))',
  // Amber: a retry is a transfer in flight, the same reading the in-progress confirmation gets.
  retried: 'var(--status-warning-fg)',
};

// Full confirm/reactivate history — every occurrence gets its own timeline
// row (not just the latest one), so a confirm→reactivate→confirm cycle shows
// all three events instead of collapsing to whichever happened most recently.
function eventsStorageKey(id) {
  return `etgo:payment:${id}:events`;
}

function readEvents(id) {
  if (!id) return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(eventsStorageKey(id)) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function appendEvent(id, type, date) {
  try {
    const events = readEvents(id);
    events.push({ type, at: date.toISOString() });
    window.localStorage.setItem(eventsStorageKey(id), JSON.stringify(events));
    return events;
  } catch {
    return readEvents(id);
  }
}

export default function PaymentDetailSidebarBase({ dir, specName, data, token, apiBaseUrl }) {
  const ui = useUI();
  const [lines, setLines] = useState(null);
  const [events, setEvents] = useState([]);
  const refreshSignal = useRecordRefreshSignal(data?.id);
  const [postedAt, setPostedAt] = useState(null);

  const isIn = dir === 'in';
  // Shared with the grid, the invoice modal and the invoice preview so the four cannot disagree
  // about the same payment (ETP-4895).
  const paymentState = paymentDisplayState(data);
  // The shared rule also folds in RPAE, which this file's own copy of the status list was missing:
  // an "Awaiting Execution" payment read as a draft here while every other surface already counted
  // it as confirmed. That correction is taken on the payments-out side only — ETP-4895 is scoped to
  // purchase invoices and Payment Out — so collections keep the old reading until it is looked at
  // on its own.
  const isDraft = paymentState === 'draft' || (isIn && data?.status === 'RPAE');
  const isInProgress = paymentState === 'inProgress';
  const isError = paymentState === 'error';
  const totalAmount = parseFloat(data?.amount ?? 0);
  const currency = data?.['currency$_identifier'];
  // Multi-currency readout (ETP-4841). When the money moved through a financial account whose
  // currency differs from the payment's own, show the account-currency equivalent plus the rate
  // between them, echoing the "(rate) secondary amount" line of the invoice preview's SummaryCard.
  //
  // Three deliberate departures from that card, because a payment is not an invoice:
  //  1. The primary figure stays in the PAYMENT's currency — it is this document's own defining
  //     value, and the breakdown rows right below it are in that currency too, so promoting the
  //     converted amount would leave the headline disagreeing with its own breakdown.
  //  2. The pair is payment↔ACCOUNT currency (the money that actually moved through the bank), not
  //     payment↔org currency, which would silently omit the account currency whenever org and
  //     account differ.
  //  3. No currency badge. On the preview card the badge is load-bearing: its primary figure is the
  //     converted one, so the badge names the document's TRUE currency ("shown in €, but this
  //     invoice is in USD"). Here the primary figure is already the true one, so a bare ISO badge
  //     would carry the inverted meaning to anyone trained on that card — and it would be redundant
  //     anyway, since the secondary line below already renders its own currency symbol.
  //
  // The rate is the payment's OWN booked rate, not a session/system spot rate — same principle as
  // the preview preferring a document's own eTGOCurrencyRate over C_Conversion_Rate. These three
  // fields are injected by ReactivatePaymentHandler's GET post-hook; on an older backend they are
  // absent and this block simply does not render.
  const accountCurrency = data?.accountCurrency || null;
  const conversionRate = parseFloat(data?.conversionRate ?? 0);
  const accountAmount = data?.financialTransactionAmount != null
    ? parseFloat(data.financialTransactionAmount)
    : null;
  const showDualCurrency = !!accountCurrency && !!currency && accountCurrency !== currency
    && conversionRate > 0 && accountAmount != null && !Number.isNaN(accountAmount);
  // ETP-4797: the invoice difference the payment wrote off instead of leaving pending. Only a
  // payment created through the write-off toggle carries this — everything else keeps rendering
  // exactly as before the toggle existed, since a zero write-off row would just be noise.
  const writeoffAmount = parseFloat(data?.writeoffAmount ?? 0);
  const hasWriteoff = Math.abs(writeoffAmount) >= WRITEOFF_EPSILON;

  useEffect(() => {
    if (!data?.id) return;
    let stored = readEvents(data.id);
    // Backfill a single synthetic "confirmed" entry for payments confirmed
    // before this history feature existed — there's no way to recover the
    // full past history, only the one timestamp AD still tracks.
    if (stored.length === 0 && !isDraft && data.paymentDate) {
      const backfill = parseAdDate(data.paymentDate);
      if (backfill) {
        stored = [{ type: 'confirmed', at: backfill.toISOString() }];
        try { window.localStorage.setItem(eventsStorageKey(data.id), JSON.stringify(stored)); } catch { /* non-fatal */ }
      }
    }
    setEvents(stored);

    const storedPosted = readEventAt(data.id, 'postedAt');
    if (storedPosted) {
      setPostedAt(storedPosted);
    } else if (!isDraft && data.posted === 'Y' && data.updated) {
      const backfill = parseAdDate(data.updated);
      if (backfill) {
        writeEventAt(data.id, 'postedAt', backfill);
        setPostedAt(backfill);
      }
    }
  }, [data?.id, data?.posted]);

  useEffect(() => {
    if (!data?.id) return;
    const handler = (e) => {
      if (e.detail?.recordId !== data.id) return;
      // A retry is neither: nothing was confirmed again — the same payment was sent to the bank a
      // second time. Recording it as 'confirmed' put a second "Pago confirmado" in the history for
      // an event that confirmed nothing (ETP-4895).
      setEvents(appendEvent(data.id, EVENT_TYPE_BY_PROCESS[e.detail?.process?.columnName] || 'confirmed',
        new Date()));
    };
    window.addEventListener('neo:processSuccess', handler);
    return () => window.removeEventListener('neo:processSuccess', handler);
  }, [data?.id]);

  useEffect(() => {
    if (!data?.id || !token || !apiBaseUrl) return;
    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = jsonHeaders();
    const linesEntity = isIn ? 'finPaymentScheduleDetail' : 'lines';
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${base}/${specName}/${linesEntity}?parentId=${data.id}&_startRow=0&_endRow=100`,
          { headers },
        );
        if (!res.ok || cancelled) {
          if (!cancelled) setLines([]);
          return;
        }
        const rows = (await res.json())?.response?.data || [];
        if (!cancelled) setLines(rows.filter(d => d.invoicePaymentSchedule || d.amount));
      } catch { if (!cancelled) setLines([]); }
    })();
    return () => { cancelled = true; };
  // The refresh signal is in the deps on purpose: the record id never changes when the payment
  // is edited, and `Updated` is not a NEO field on this entity, so nothing in the payload moves
  // for this effect to react to. Without it "Aplicado a facturas" kept showing the amount from
  // before the save until the whole window was reloaded.
  }, [data?.id, refreshSignal, token, apiBaseUrl, isIn, specName]);

  const appliedLines = lines ?? [];
  const applied = appliedLines.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  const unapplied = Math.max(0, totalAmount - applied);

  const paymentDate = data?.paymentDate;
  const createdDate = data?.creationDate || data?.created || paymentDate;

  const sign = isIn ? '+ ' : '− ';
  const titleKey = isIn ? 'amountLabelIn' : 'amountLabelOut';

  const hasConfirmedEvent = events.some(ev => ev.type === 'confirmed');
  const confirmedKey = confirmedLabelKey(isIn, paymentState);
  // The dot follows the label for the same reason: a green one next to "Pago en progreso" reads as
  // settled, and next to "Pago con error" it reads as money that moved.
  let confirmedDot = '#2DCA72';
  if (isError) {
    confirmedDot = 'hsl(var(--destructive))';
  } else if (isInProgress) {
    confirmedDot = 'var(--status-warning-fg)';
  }
  const eventLabelKey = (ev) => {
    if (ev.type === 'reactivated') return isIn ? 'cobroReactivado' : 'pagoReactivado';
    if (ev.type === 'retried') return isIn ? 'cobroTransferenciaReintentada' : 'pagoTransferenciaReintentada';
    return confirmedKey;
  };
  const activityItems = [
    {
      label: ui(isIn ? 'cobroCreado' : 'pagoCreado'),
      date: createdDate,
      // Draft dot: before ETP-4554 this was a bright, vivid orange (~49% lightness). The
      // migration mapped it to --status-warning-fg, a much darker amber-brown (~27% lightness),
      // since that token is meant for warning TEXT (needs contrast on a light bg), not a
      // standalone dot. No warning-family token matches the original brightness (the border
      // token is too pale, the bg token near-white) — same "no exact token" situation as the
      // confirmed-dot green below, so the literal color is restored rather than force-fit
      // (allowlisted in semanticThemeUsage.test.js; found while verifying ETP-4797).
      dot: isDraft ? '#FAAF00' : 'var(--status-success-fg)',
    },
    // Every confirm/reactivate ever recorded — a full cycle (confirm →
    // reactivate → confirm) shows as three separate rows, not just the
    // latest occurrence of each type.
    // Confirmed dots are a lighter, brighter green than the "created" dot's
    // --status-success-fg: before ETP-4554 ("Migrate shared window styles") this was a
    // mid-lightness green sitting almost exactly halfway between --status-success-fg (dark
    // forest green, ~25% lightness) and --status-success-border (pale mint, ~71% lightness), so
    // neither existing token reproduces it. Restored the literal color rather than force-fitting
    // a token that's visibly too dark or too pale (allowlisted in semanticThemeUsage.test.js;
    // found while verifying ETP-4797).
    ...events.map(ev => ({
      label: ui(eventLabelKey(ev)),
      confirmedAt: new Date(ev.at),
      date: null,
      dot: EVENT_DOT[ev.type] ?? confirmedDot,
    })),
    // Fallback for the rare case where the record is currently confirmed but
    // no event (live or backfilled) could be recorded — still show it once.
    ...(!isDraft && !hasConfirmedEvent ? [{
      label: ui(confirmedKey),
      confirmedAt: null,
      date: paymentDate,
      dot: confirmedDot,
    }] : []),
    ...((!isDraft && data?.posted === 'Y') || postedAt ? [{
      label: ui('asientoContabilizado'),
      confirmedAt: postedAt,
      date: data?.updated,
      dot: 'hsl(var(--text-disabled))',
    }] : []),
  ].map((item, index) => ({
    ...item,
    sortAt: (item.confirmedAt instanceof Date ? item.confirmedAt : parseAdDate(item.date))?.getTime() ?? index,
  })).sort((a, b) => a.sortAt - b.sortAt);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}
      data-testid="PaymentDetailSidebar__panel"
    >
      {/* Cabecera: padding 8px 12px 4px */}
      <div style={{ padding: '8px 12px 4px' }}>
        <h2 style={{ margin: 0, font: '600 20px/28px Inter', color: 'hsl(var(--foreground))' }}>
          {ui(titleKey)}
        </h2>
      </div>
      {/* Datos: amount, padding 4px 12px 8px */}
      <div style={{ padding: '4px 12px 8px' }}>
        {(() => {
          const formatted = sign + fmtAmt(Math.abs(totalAmount), currency);
          const len = formatted.length;
          const fs = len <= 13 ? 30 : 26;
          const lh = fs === 30 ? '32px' : '30px';
          return (
            <span className="tabular-nums" style={{ font: `500 ${fs}px/${lh} Inter`, color: 'hsl(var(--foreground))' }}>
              {formatted}
            </span>
          );
        })()}
        {showDualCurrency && (
          <div
            className="tabular-nums"
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}
            data-testid="payment-account-amount">
            <span style={{ font: '700 12px/16px Inter', color: 'hsl(var(--muted-foreground))' }}>
              {`(${fmtRate(conversionRate)})`}
            </span>
            <span style={{ font: '600 14px/20px Inter', color: 'hsl(var(--foreground))' }}>
              {fmtAmt(accountAmount, accountCurrency)}
            </span>
          </div>
        )}
      </div>
      {/* Breakdown outer: padding 12px, gap 10px */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Detalle moneda card: padding 12px, gap 12px — Info sub-section has gap 8px */}
        <div style={{ background: 'hsl(var(--muted))', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Info: rows + separators with gap 8px */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <BreakdownRow
              label={ui('totalAmount')}
              value={fmtAmt(totalAmount, currency)}
              data-testid="BreakdownRow__624cef" />
            <Separator data-testid="Separator__624cef" />
            <BreakdownRow
              label={ui('appliedToInvoices')}
              value={lines === null ? '...' : fmtAmt(applied, currency)}
              data-testid="BreakdownRow__624cef" />
            <Separator data-testid="Separator__624cef" />
            <BreakdownRow
              label={ui('unallocated')}
              value={lines === null ? '...' : fmtAmt(unapplied, currency)}
              muted={unapplied === 0}
              data-testid="BreakdownRow__624cef" />
            {hasWriteoff && (
              <>
                <Separator data-testid="Separator__624cef" />
                <BreakdownRow
                  label={ui('writtenOffLabel')}
                  value={fmtAmt(writeoffAmount, currency)}
                  data-testid="BreakdownRow__writeoff" />
              </>
            )}
          </div>
        </div>
      </div>
      {/* Actividad: padding 8px 12px 0, column gap 10px */}
      <div style={{ padding: '8px 12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Title with 4px bottom padding */}
        <div style={{ font: '400 14px/20px Inter', color: 'hsl(var(--muted-foreground))', paddingBottom: 4 }}>
          {ui('activity')}
        </div>
        {activityItems.map((item, index) => (
          <div key={`${item.label}-${item.sortAt}-${index}`} style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Row: dot 24×24 + name */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.dot }} />
              </div>
              <span style={{ font: '500 14px/20px Inter', color: 'hsl(var(--foreground))' }}>{item.label}</span>
            </div>
            {/* Date: 24px left indent, 12px font */}
            {(item.confirmedAt || item.date) && (
              <div style={{ paddingLeft: 24, font: '400 12px/16px Inter', color: 'hsl(var(--muted-foreground))' }}>
                {item.confirmedAt ? fmtNow(item.confirmedAt) : fmtDate(item.date)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
