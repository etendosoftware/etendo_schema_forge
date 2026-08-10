import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { WRITEOFF_EPSILON } from '@/components/contract-ui/writeoffMath.js';

function fmtAmt(val, currency) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(currency || 'EUR', n);
}

const PAID_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC']);

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
  const [postedAt, setPostedAt] = useState(null);

  const isIn = dir === 'in';
  const status = data?.status || '';
  const isDraft = !PAID_STATUSES.has(status);
  const totalAmount = parseFloat(data?.amount ?? 0);
  const currency = data?.['currency$_identifier'];
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
      const isReactivate = e.detail?.process?.columnName === 'etprReactivatePayment';
      setEvents(appendEvent(data.id, isReactivate ? 'reactivated' : 'confirmed', new Date()));
    };
    window.addEventListener('neo:processSuccess', handler);
    return () => window.removeEventListener('neo:processSuccess', handler);
  }, [data?.id]);

  useEffect(() => {
    if (!data?.id || !token || !apiBaseUrl) return;
    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
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
  }, [data?.id, token, apiBaseUrl, isIn, specName]);

  const appliedLines = lines ?? [];
  const applied = appliedLines.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  const unapplied = Math.max(0, totalAmount - applied);

  const paymentDate = data?.paymentDate;
  const createdDate = data?.creationDate || data?.created || paymentDate;

  const sign = isIn ? '+ ' : '− ';
  const titleKey = isIn ? 'amountLabelIn' : 'amountLabelOut';

  const hasConfirmedEvent = events.some(ev => ev.type === 'confirmed');
  const eventLabelKey = (ev) => {
    const reactivatedKey = isIn ? 'cobroReactivado' : 'pagoReactivado';
    const confirmedKey = isIn ? 'cobroConfirmado' : 'pagoConfirmado';
    return ev.type === 'reactivated' ? reactivatedKey : confirmedKey;
  };
  const activityItems = [
    {
      label: ui(isIn ? 'cobroCreado' : 'pagoCreado'),
      date: createdDate,
      dot: isDraft ? 'var(--status-warning-fg)' : 'var(--status-success-fg)',
    },
    // Every confirm/reactivate ever recorded — a full cycle (confirm →
    // reactivate → confirm) shows as three separate rows, not just the
    // latest occurrence of each type.
    ...events.map(ev => ({
      label: ui(eventLabelKey(ev)),
      confirmedAt: new Date(ev.at),
      date: null,
      dot: ev.type === 'reactivated' ? 'hsl(var(--muted-foreground))' : 'var(--status-success-fg)',
    })),
    // Fallback for the rare case where the record is currently confirmed but
    // no event (live or backfilled) could be recorded — still show it once.
    ...(!isDraft && !hasConfirmedEvent ? [{
      label: ui(isIn ? 'cobroConfirmado' : 'pagoConfirmado'),
      confirmedAt: null,
      date: paymentDate,
      dot: 'var(--status-success-fg)',
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
