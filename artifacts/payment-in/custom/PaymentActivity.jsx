import { useState, useEffect } from 'react';

const STATUS_LABELS = {
  RPPC: 'Payment Cleared',
  DR: 'Draft',
  RPAP: 'Awaiting Payment',
  RPR: 'Received',
  RDNC: 'Not Cleared',
  RPVD: 'Voided',
};

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function todayFmt() {
  return fmtDate(new Date().toISOString());
}

/**
 * PaymentActivity — Timeline events for Payment In.
 * Rendered inside SectionBlock by PaymentBottomPanel (no own title).
 *
 * System events use paymentDate as the reference date.
 * User-added notes are stored in local state and appended to the timeline.
 */
export default function PaymentActivity({ data, recordId, token, apiBaseUrl }) {
  const [linkedInvoices, setLinkedInvoices] = useState([]);
  const [localNotes, setLocalNotes] = useState([]);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (!recordId || !token || !apiBaseUrl) return;
    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    (async () => {
      try {
        const res = await fetch(
          `${base}/payment-in/finPaymentScheduleDetail?parentId=${recordId}&_startRow=0&_endRow=100`,
          { headers },
        );
        if (!res.ok) return;
        const details = (await res.json())?.response?.data || [];
        const scheduleIds = [...new Set(details.map(d => d.invoicePaymentSchedule).filter(Boolean))];
        if (scheduleIds.length === 0) return;

        const invoices = [];
        await Promise.all(scheduleIds.map(async (schedId) => {
          try {
            const r = await fetch(`${base}/sales-invoice/paymentPlan/${schedId}`, { headers });
            if (!r.ok) return;
            const row = (await r.json())?.response?.data?.[0];
            if (row?.invoice) {
              const ident = row['invoice$_identifier'] || '';
              const docNo = ident.split(' - ')[0] || '';
              if (docNo && !invoices.some(i => i.id === row.invoice)) {
                invoices.push({ id: row.invoice, docNo });
              }
            }
          } catch { /* silent */ }
        }));
        setLinkedInvoices(invoices);
      } catch { /* silent */ }
    })();
  }, [recordId, token, apiBaseUrl]);

  if (!data) return null;

  // System events use paymentDate as the reference date; fall back to creationDate
  const systemDate = fmtDate(data.paymentDate || data.creationDate);
  const systemSortDate = new Date(data.paymentDate || data.creationDate);

  const events = [];

  // Created
  if (data.creationDate) {
    events.push({
      key: 'created',
      text: 'Created',
      date: fmtDate(data.creationDate),
      sortDate: new Date(data.creationDate),
    });
  }

  // Linked invoices — date = paymentDate
  for (const inv of linkedInvoices) {
    events.push({
      key: `inv-${inv.id}`,
      text: `Linked to Invoice #${inv.docNo}`,
      date: systemDate,
      sortDate: systemSortDate,
    });
  }

  // Status change — date = paymentDate
  const status = data.status || data.documentStatus;
  if (status && status !== 'DR') {
    const label = STATUS_LABELS[status] || status;
    events.push({
      key: 'status',
      text: `Status changed to ${label}`,
      date: systemDate,
      sortDate: systemSortDate,
    });
  }

  events.sort((a, b) => a.sortDate - b.sortDate);

  // User-added notes appended after system events (most recent activity)
  const allEntries = [...events, ...localNotes];

  const handleAddNote = () => {
    const text = noteText.trim();
    if (!text) return;
    setLocalNotes(prev => [
      ...prev,
      { key: `note-${Date.now()}`, text, date: todayFmt(), sortDate: new Date() },
    ]);
    setNoteText('');
  };

  return (
    <div>
      {/* Timeline entries */}
      {allEntries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          {allEntries.map((ev) => (
            <div key={ev.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {/* Bullet */}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#d1d5db',
                  flexShrink: 0,
                  position: 'relative',
                  top: 1,
                }}
              />
              {/* Event text */}
              <span className="text-sm" style={{ color: '#374151' }}>{ev.text}</span>
              {/* Dotted filler */}
              <span
                className="flex-1"
                style={{ borderBottom: '1px dotted #e5e7eb', minWidth: 16, marginBottom: 3 }}
              />
              {/* Date */}
              <span className="text-xs shrink-0" style={{ color: '#9ca3af' }}>{ev.date}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add a note — input + (+) button */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNote(); } }}
          placeholder="Add a note..."
          className="flex-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
          style={{
            padding: '7px 12px',
            border: '1px dashed #e5e7eb',
            borderRadius: 6,
            backgroundColor: '#ffffff',
            color: '#374151',
          }}
        />
        <button
          type="button"
          onClick={handleAddNote}
          disabled={!noteText.trim()}
          className="shrink-0 flex items-center justify-center text-sm font-medium transition-colors disabled:opacity-40"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            color: '#374151',
            cursor: noteText.trim() ? 'pointer' : 'default',
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
