import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

function fmtAmount(amount, currencyId) {
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyId || 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
  catch { return n.toFixed(2); }
}

function fmtDate(raw) {
  if (!raw) return '';
  try {
    // Parse as local date to avoid UTC timezone shift (e.g. "2026-04-06" → Apr 5 in UTC-n)
    const str = String(raw);
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const d = match ? new Date(+match[1], +match[2] - 1, +match[3]) : new Date(raw);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return ''; }
}

function fmtInvoiceDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_MAP = {
  RPPC: { label: 'Cleared', dot: '#059669', bg: '#d1fae5', color: '#065f46' },
  RPR:  { label: 'Received', dot: '#059669', bg: '#d1fae5', color: '#065f46' },
  RPAP: { label: 'Awaiting', dot: '#d97706', bg: '#fef3c7', color: '#92400e' },
  RDNC: { label: 'Deposited', dot: '#2563eb', bg: '#dbeafe', color: '#1e40af' },
  DR:   { label: 'Draft', dot: '#9ca3af', bg: '#f3f4f6', color: '#374151' },
  RPVD: { label: 'Voided', dot: '#9ca3af', bg: '#f3f4f6', color: '#6b7280' },
};

const STATUS_LABELS = {
  RPPC: 'Payment Cleared', DR: 'Draft', RPAP: 'Awaiting Payment',
  RPR: 'Received', RDNC: 'Not Cleared', RPVD: 'Voided',
};

function fmtActivityDate(raw) {
  if (!raw) return '';
  try {
    const str = String(raw);
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function isTechnicalDescription(value) {
  if (!value || typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^(Invoice No\.|Order No\.|Factura|Pedido|Payment)/i.test(trimmed);
}

export default function PaymentBottomPanel({
  recordId, data, token, apiBaseUrl, api,
  summary, notesField, onFieldChange, notesFocused, setNotesFocused,
}) {
  const [remaining, setRemaining] = useState(0);
  const [linkedInvoices, setLinkedInvoices] = useState([]);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const hdrs = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (!data?.id || !token || !base) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${base}/payment-in/finPaymentScheduleDetail?parentId=${data.id}&_startRow=0&_endRow=100`, { headers: hdrs });
        if (!res.ok || cancelled) return;
        const details = (await res.json())?.response?.data || [];
        const applied = details.filter(d => d.invoicePaymentSchedule).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
        if (!cancelled) setRemaining(Math.max(0, (parseFloat(data.amount) || 0) - applied));
        const scheduleIds = [...new Set(details.map(d => d.invoicePaymentSchedule).filter(Boolean))];
        const invoices = [];
        await Promise.all(scheduleIds.map(async (schedId) => {
          try {
            const r = await fetch(`${base}/sales-invoice/paymentPlan/${schedId}`, { headers: hdrs });
            if (!r.ok) return;
            const row = (await r.json())?.response?.data?.[0];
            if (row?.invoice && !invoices.some(i => i.id === row.invoice)) {
              const outstanding = parseFloat(row.outstandingAmount) || 0;
              invoices.push({
                id: row.invoice,
                identifier: row['invoice$_identifier'] || '',
                amount: row.amount,
                isPaid: outstanding <= 0,
              });
            }
          } catch { /* silent */ }
        }));
        if (!cancelled) setLinkedInvoices(invoices);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [data?.id, data?.amount, token, base, hdrs]);

  const currency = data?.['currency$_identifier'] || 'EUR';
  const bpName = data?.['businessPartner$_identifier'] || '';
  const paymentDate = fmtDate(data?.paymentDate);
  const paymentMethod = data?.['paymentMethod$_identifier'] || '';
  const financialAccount = data?.['account$_identifier'] || data?.['finFinancialAccount$_identifier'] || '';
  const status = data?.status;
  const statusInfo = STATUS_MAP[status] || STATUS_MAP.DR;

  // Activity timeline
  const [persistedNotes, setPersistedNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const descriptionRef = useRef(data?.description || '');

  useEffect(() => { descriptionRef.current = data?.description || ''; }, [data?.description]);

  useEffect(() => {
    if (!data?.description) { setPersistedNotes([]); return; }
    const lines = data.description.split('\n').filter(l => l.trim());
    const notes = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const pipeIdx = line.indexOf('|');
      if (pipeIdx > 0 && pipeIdx < 30) {
        const maybeDateStr = line.slice(0, pipeIdx);
        const parsed = new Date(maybeDateStr);
        if (!isNaN(parsed.getTime())) {
          notes.push({ key: `note-${idx}`, text: line.slice(pipeIdx + 1), date: fmtActivityDate(maybeDateStr), sortDate: parsed, isNote: true });
        }
      }
    }
    setPersistedNotes(notes);
  }, [data?.description]);

  const saveNote = useCallback(async (text) => {
    if (!recordId || !token || !base) return false;
    const timestamp = new Date().toISOString();
    const newLine = `${timestamp}|${text}`;
    const updatedDesc = descriptionRef.current ? `${descriptionRef.current}\n${newLine}` : newLine;
    try {
      const res = await fetch(`${base}/payment-in/finPayment/${recordId}`, { method: 'PATCH', headers: hdrs, body: JSON.stringify({ description: updatedDesc }) });
      if (!res.ok) return false;
      descriptionRef.current = updatedDesc;
      return true;
    } catch { return false; }
  }, [recordId, token, base, hdrs]);

  const handleAddNote = async () => {
    const text = noteText.trim();
    if (!text || saving) return;
    setSaving(true);
    if (await saveNote(text)) {
      setPersistedNotes(prev => [...prev, { key: `note-${Date.now()}`, text, date: fmtActivityDate(new Date().toISOString()), sortDate: new Date(), isNote: true }]);
      setNoteText('');
    }
    setSaving(false);
  };

  const activityEvents = useMemo(() => {
    const events = [];
    const sysDate = fmtActivityDate(data?.paymentDate || data?.creationDate);
    const sysSortDate = new Date(data?.paymentDate || data?.creationDate || 0);
    if (data?.paymentDate || data?.creationDate) {
      events.push({ key: 'created', text: 'Payment created', date: sysDate, sortDate: sysSortDate, isNote: false });
    }
    for (const inv of linkedInvoices) {
      const docNo = (inv.identifier || '').split(' - ')[0] || '';
      events.push({ key: `inv-${inv.id}`, text: `Linked to Invoice #${docNo}`, date: sysDate, sortDate: sysSortDate, isNote: false });
    }
    const st = data?.status;
    if (st && st !== 'DR') {
      events.push({ key: 'status', text: `Status → ${STATUS_LABELS[st] || st}`, date: sysDate, sortDate: sysSortDate, isNote: false });
    }
    events.sort((a, b) => a.sortDate - b.sortDate);
    return [...events, ...persistedNotes];
  }, [data, linkedInvoices, persistedNotes]);

  const navigateToInvoice = (invoiceId) => {
    const bp = window.location.pathname.replace(/\/payment-in\/.*$/, '');
    window.location.href = `${bp}/sales-invoice/${invoiceId}`;
  };

  const documentNo = data?.documentNo || '';
  const fields = [
    { label: 'Customer', value: bpName },
    { label: 'Payment Date', value: paymentDate },
    { label: 'Method', value: paymentMethod },
    { label: 'Deposit to', value: financialAccount, isAccount: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: -12 }}>

      {/* Hero */}
      <div style={{ backgroundColor: '#F5F5F5', borderRadius: 10, padding: '14px 16px' }}>
        {/* Doc No pretitle + Amount + badge */}
        <div style={{ paddingBottom: 14, borderBottom: '0.5px solid #E5E7EB', marginBottom: 0 }}>
          {documentNo && <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7280', marginBottom: 2 }}>#{documentNo}</div>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 32, fontWeight: 500, color: '#111827', lineHeight: 1 }}>{fmtAmount(data?.amount, currency)}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, backgroundColor: statusInfo.bg, color: statusInfo.color, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusInfo.dot }} />
              {statusInfo.label}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            {[currency, paymentMethod].filter(Boolean).join(' \u00b7 ')}
          </div>
        </div>

        {/* Detail grid — 4 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', backgroundColor: '#fff', borderRadius: 8, border: '0.5px solid #d1d5db', overflow: 'hidden', marginTop: 14 }}>
          {fields.map((f, i) => (
            <div key={f.label} style={{ padding: '14px 18px', borderLeft: i > 0 ? '0.5px solid #d1d5db' : 'none' }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: f.isAccount ? '#2563eb' : '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                {f.isAccount && f.value && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                )}
                {f.value || '\u2014'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Unallocated credit */}
      {remaining > 0 && (
        <div style={{ backgroundColor: '#FFFBEB', borderLeft: '3px solid #F59E0B', borderRadius: '0 6px 6px 0', padding: '10px 14px' }}>
          <span style={{ fontSize: 13, color: '#92400e' }}><strong>{fmtAmount(remaining, currency)}</strong> unallocated credit</span>
        </div>
      )}

      {/* Invoice cards */}
      {linkedInvoices.length > 0 && (
        <div>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 6 }}>Invoice</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {linkedInvoices.map(inv => {
              const parts = (inv.identifier || '').split(' - ');
              const docNo = parts[0] || '';
              const dateStr = fmtInvoiceDate(parts[1]);
              const subtitle = [bpName, dateStr].filter(Boolean).join(' · ');
              const badgeColor = inv.isPaid
                ? { bg: '#d1fae5', color: '#065f46', dot: '#059669', label: 'Paid' }
                : { bg: '#fef3c7', color: '#92400e', dot: '#d97706', label: 'Pending' };
              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => navigateToInvoice(inv.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, backgroundColor: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#2563eb' }}>Invoice #{docNo}</div>
                    {subtitle && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{subtitle}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {inv.amount && <span style={{ fontSize: 13, fontWeight: 500, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(inv.amount, currency)}</span>}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, backgroundColor: badgeColor.bg, color: badgeColor.color, fontSize: 11, fontWeight: 500 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: badgeColor.dot }} />
                      {badgeColor.label}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity card */}
      <div style={{ border: '0.5px solid #d1d5db', borderRadius: 10, overflow: 'hidden' }}>
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: '#F8F9FA', borderBottom: '0.5px solid #d1d5db' }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Activity</span>
          {activityEvents.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 500, backgroundColor: '#e5e7eb', color: '#6B7280', padding: '1px 6px', borderRadius: 9999 }}>{activityEvents.length}</span>
          )}
        </div>

        {/* Timeline */}
        {activityEvents.length > 0 && (
          <div style={{ position: 'relative', padding: '14px 14px 14px 28px' }}>
            <div style={{ position: 'absolute', left: 12, top: 20, bottom: 14, width: 1.5, backgroundColor: '#e5e7eb' }} />
            {activityEvents.map((ev, i) => (
              <div key={ev.key} style={{ position: 'relative', paddingBottom: i < activityEvents.length - 1 ? 16 : 0 }}>
                <span style={{ position: 'absolute', left: -20 + 1, top: 3, width: 8, height: 8, borderRadius: '50%', backgroundColor: ev.isNote ? '#EF9F27' : '#9ca3af' }} />
                {ev.isNote ? (
                  <div>
                    <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>{ev.userName || 'You'} &middot; {ev.date}</div>
                    <div style={{ backgroundColor: '#F5F5F5', borderRadius: 8, padding: '8px 12px', maxWidth: '85%' }}>
                      <div style={{ fontSize: 13, color: '#111827' }}>{ev.text}</div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, color: '#374151' }}>{ev.text}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{ev.date}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Card footer — Add note */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderTop: '0.5px solid #d1d5db', background: '#fff' }}>
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNote(); } }}
            placeholder="Add a note..."
            disabled={saving}
            style={{ flex: 1, fontSize: 13, padding: '7px 10px', border: '0.5px solid #d1d5db', borderRadius: 6, outline: 'none', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' }}
          />
          <button
            type="button"
            onClick={handleAddNote}
            disabled={!noteText.trim() || saving}
            style={{ fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 6, border: 'none', backgroundColor: noteText.trim() ? '#18181b' : '#e5e7eb', color: noteText.trim() ? '#fff' : '#9ca3af', cursor: noteText.trim() && !saving ? 'pointer' : 'default', flexShrink: 0 }}
          >
            {saving ? '...' : 'Add'}
          </button>
        </div>
      </div>

    </div>
  );
}
