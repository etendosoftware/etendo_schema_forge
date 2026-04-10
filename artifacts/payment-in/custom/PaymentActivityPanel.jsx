import { useState, useEffect, useCallback, useRef } from 'react';
import { useUI } from '@/i18n';

const STATUS_LABELS = {
  RPPC: 'statusCleared',
  DR: 'statusDraft',
  RPAP: 'statusAwaiting',
  RPR: 'statusReceived',
  RDNC: 'statusDeposited',
  RPVD: 'statusVoided',
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
 * PaymentActivityPanel — Right-column activity chatter for Payment In.
 *
 * Rendered via DetailView's sidePanel prop (React.createElement).
 * Receives: { recordId, data, token, apiBaseUrl, api }
 *
 * - System events use paymentDate as reference date.
 * - User-added notes are persisted to the `description` field via PATCH API.
 * - Existing notes are loaded from `data.description` on mount.
 * - Layout: flex column filling full panel height; timeline scrolls; input sticks to bottom.
 * - Timeline styled with vertical connecting line and dot markers.
 */
export default function PaymentActivityPanel({ data, recordId, token, apiBaseUrl }) {
  const [linkedInvoices, setLinkedInvoices] = useState([]);
  const [persistedNotes, setPersistedNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const descriptionRef = useRef(data?.description || '');
  const ui = useUI();

  useEffect(() => {
    descriptionRef.current = data?.description || '';
  }, [data?.description]);

  // Load existing notes from data.description when panel opens or data changes
  useEffect(() => {
    if (!data?.description) {
      setPersistedNotes([]);
      return;
    }
    // Parse stored notes — each line is a note with optional timestamp prefix
    // Format stored: "YYYY-MM-DDTHH:mm:ss|Note text" or plain text (legacy)
    // Only parse lines with the timestamped format "ISO|Note text" — ignore everything else
    // (legacy description content like "Invoice No.: ..." belongs to NOTES, not Activity)
    const lines = data.description.split('\n').filter(l => l.trim());
    const notes = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const pipeIdx = line.indexOf('|');
      if (pipeIdx > 0 && pipeIdx < 30) {
        const maybeDateStr = line.slice(0, pipeIdx);
        const parsed = new Date(maybeDateStr);
        if (!Number.isNaN(parsed.getTime())) {
          notes.push({
            key: `persisted-${idx}`,
            text: line.slice(pipeIdx + 1),
            date: fmtDate(maybeDateStr),
            sortDate: parsed,
            isNote: true,
          });
        }
      }
      // Non-timestamped lines are legacy description content — skip them
    }
    setPersistedNotes(notes);
  }, [data?.description]);

  // Fetch linked invoices
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

  // Save note to description field via PATCH
  const saveNoteToDescription = useCallback(async (noteTextValue) => {
    if (!recordId || !token || !apiBaseUrl) return false;
    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Build updated description: append new timestamped note
    const timestamp = new Date().toISOString();
    const newLine = `${timestamp}|${noteTextValue}`;
    const currentDesc = descriptionRef.current;
    const updatedDesc = currentDesc ? `${currentDesc}\n${newLine}` : newLine;

    try {
      const res = await fetch(
        `${base}/payment-in/finPayment/${recordId}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ description: updatedDesc }),
        },
      );
      if (!res.ok) {
        console.error('Failed to save note:', res.status);
        return false;
      }
      descriptionRef.current = updatedDesc;
      return true;
    } catch (err) {
      console.error('Failed to save note:', err);
      return false;
    }
  }, [recordId, token, apiBaseUrl]);

  if (!data) return null;

  // All system events reference paymentDate; fallback to creationDate
  const systemDate = fmtDate(data.paymentDate || data.creationDate);
  const systemSortDate = new Date(data.paymentDate || data.creationDate || 0);

  const events = [];

  // "Payment created" uses paymentDate as the reference date
  if (data.paymentDate || data.creationDate) {
      events.push({
        key: 'created',
        text: ui('paymentCreated'),
        date: fmtDate(data.paymentDate || data.creationDate),
        sortDate: new Date(data.paymentDate || data.creationDate || 0),
        isNote: false,
      });
  }

  for (const inv of linkedInvoices) {
    events.push({
      key: `inv-${inv.id}`,
      text: ui('linkedToInvoice', { number: inv.docNo }),
      date: systemDate,
      sortDate: systemSortDate,
      isNote: false,
    });
  }

  const status = data.status || data.documentStatus;
  if (status && status !== 'DR') {
    const label = ui(STATUS_LABELS[status] || status);
    events.push({
      key: 'status',
      text: ui('statusChangedTo', { status: label }),
      date: systemDate,
      sortDate: systemSortDate,
      isNote: false,
    });
  }

  events.sort((a, b) => a.sortDate - b.sortDate);

  const allEntries = [...events, ...persistedNotes];

  const handleAddNote = async () => {
    const text = noteText.trim();
    if (!text || saving) return;
    setSaving(true);
    const success = await saveNoteToDescription(text);
    if (success) {
      // Optimistically add to local list immediately
      const now = new Date();
      setPersistedNotes(prev => [...prev, {
        key: `persisted-${Date.now()}`,
        text,
        date: fmtDate(now.toISOString()),
        sortDate: now,
        isNote: true,
      }]);
      setNoteText('');
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full p-6">

      {/* Section title */}
      <span
        className="block text-[11px] font-medium uppercase tracking-wide mb-4"
        style={{ color: '#111827', flexShrink: 0 }}
      >
        {ui('activity')}
      </span>

      {/* Timeline — grows to fill available space; scrolls when overflowing */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {allEntries.length > 0 ? (
          <div className="relative" style={{ paddingLeft: 24 }}>
            {/* Continuous vertical line — runs from first dot to last dot */}
            <div
              style={{
                position: 'absolute',
                left: 5,
                top: 6,
                bottom: allEntries.length > 1 ? 6 : '100%',
                width: 2,
                backgroundColor: '#e5e7eb',
              }}
            />

            {allEntries.map((ev, i) => (
              <div
                key={ev.key}
                className="relative flex items-start"
                style={{ paddingBottom: i < allEntries.length - 1 ? 24 : 0 }}
              >
                {/* Dot on the vertical line */}
                <span
                  style={{
                    position: 'absolute',
                    left: -24 + 2,
                    top: 2,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: ev.isNote ? '#f59e0b' : '#6b7280',
                    flexShrink: 0,
                  }}
                />
                {/* Event content */}
                <div className="min-w-0">
                  <div
                    className="text-sm leading-snug"
                    style={{ color: '#111827', fontWeight: 500 }}
                  >
                    {ev.text}
                  </div>
                  {ev.date && (
                    <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 3 }}>
                      {ev.date}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-sm" style={{ color: '#d1d5db' }}>{ui('noActivityYet')}</span>
        )}
      </div>

      {/* Add a note — pushed to bottom of flex column */}
      <div
        className="mt-auto pt-4 flex gap-2 items-center shrink-0"
        style={{ borderTop: '1px solid #e5e7eb' }}
      >
        <input
          type="text"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNote(); } }}
          placeholder={ui('addNote')}
          disabled={saving}
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleAddNote}
          disabled={!noteText.trim() || saving}
          className="shrink-0 flex items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
          style={{
            width: 32,
            height: 32,
            border: 'none',
            backgroundColor: noteText.trim() ? '#f59e0b' : '#e5e7eb',
            color: noteText.trim() ? '#ffffff' : '#9ca3af',
            cursor: noteText.trim() && !saving ? 'pointer' : 'default',
          }}
        >
          {saving ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
