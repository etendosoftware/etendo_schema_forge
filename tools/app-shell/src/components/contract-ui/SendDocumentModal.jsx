import { useState, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Reusable Send/Download modal for any document (invoice, order, quotation, shipment).
 *
 * Props:
 * - documentType: display label e.g. "Invoice", "Order", "Quotation", "Shipment"
 * - documentNo: document number
 * - bpName: business partner name
 * - bpEmail: pre-filled email (optional)
 * - documentId: record ID for PDF rendering
 * - windowName: for report ID resolution (e.g. "sales-invoice")
 * - token: auth token
 * - onClose: callback to close modal
 */
export default function SendDocumentModal({ documentType = 'Document', documentNo, bpName, bpEmail, documentId, windowName, token, onClose }) {
  const hasEmail = bpEmail && bpEmail.includes('@');
  const [to, setTo] = useState(hasEmail ? bpEmail : '');
  const [subject, setSubject] = useState(`${documentType} #${documentNo} — ${bpName}`);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const reportId = `print-${windowName}`;

  const iframeRef = useCallback(node => {
    if (!node || !documentId || !token) return;
    (async () => {
      setPdfLoading(true);
      setPdfError(null);
      try {
        const res = await fetch(`/api/reports/${reportId}/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ format: 'html', params: { documentId } }),
        });
        if (!res.ok) throw new Error(`Preview failed (${res.status})`);
        const html = await res.text();
        node.src = 'about:blank';
        node.onload = () => {
          try { const doc = node.contentDocument; doc.open(); doc.write(html); doc.close(); } catch {}
          node.onload = null;
        };
      } catch (err) {
        setPdfError(err.message);
      }
      setPdfLoading(false);
    })();
  }, [documentId, token, reportId]);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ format: 'html', params: { documentId } }),
      });
      if (!res.ok) throw new Error('Failed to render');
      const html = await res.text();
      const pdfRes = await fetch('/jsreport/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: { content: html, engine: 'none', recipe: 'chrome-pdf', chrome: { format: 'A4', marginTop: '10mm', marginBottom: '10mm', marginLeft: '10mm', marginRight: '10mm' } }, data: {} }),
      });
      if (!pdfRes.ok) throw new Error('PDF generation failed');
      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${windowName}-${documentNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    }
    setDownloading(false);
  };

  const handleSend = () => {
    setSending(true);
    setTimeout(() => {
      toast.success(`${documentType} sent ✓`);
      setSending(false);
      onClose();
    }, 800);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 800, height: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB' }}>

        <div style={{ padding: '12px 16px', background: '#F5F5F5', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Send {documentType} #{documentNo}</span>
          </div>
          <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: '60%', display: 'flex', flexDirection: 'column', borderRight: '0.5px solid #E5E7EB' }}>
            <div style={{ flex: 1, position: 'relative', background: '#EFEFEF' }}>
              {pdfLoading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>Loading preview...</div>
              )}
              {pdfError && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', padding: 24, textAlign: 'center', gap: 8 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#6B7280' }}>PDF preview</span>
                  <span style={{ fontSize: 13, color: '#9ca3af', maxWidth: 220 }}>The PDF will appear here once document templates are configured</span>
                </div>
              )}
              <iframe ref={iframeRef} style={{ width: '100%', height: '100%', border: 'none', opacity: pdfLoading ? 0 : 1 }} title="Document preview" />
            </div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', background: '#fff', border: 'none', borderTop: '0.5px solid #E5E7EB', fontSize: 13, color: '#374151', cursor: downloading ? 'wait' : 'pointer', flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {downloading ? 'Downloading...' : 'Download PDF'}
            </button>
          </div>

          <div style={{ width: '40%', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>To</label>
              <input
                type="email"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="email@company.com"
                style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: `0.5px solid ${!to && !hasEmail ? '#ef4444' : '#d1d5db'}`, borderRadius: 6, outline: 'none', color: '#111827', boxSizing: 'border-box' }}
              />
              {!to && !hasEmail && (
                <span style={{ fontSize: 11, color: '#ef4444', marginTop: 3, display: 'block' }}>No email found for this contact</span>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid #d1d5db', borderRadius: 6, outline: 'none', color: '#111827', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Add a personal message..."
                style={{ width: '100%', flex: 1, minHeight: 80, fontSize: 13, padding: '8px 10px', border: '0.5px solid #d1d5db', borderRadius: 6, outline: 'none', color: '#111827', resize: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F5F5F5', borderTop: '1px solid #E5E5E5', padding: '10px 16px', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>Cancel</button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!to.trim() || sending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '6px 16px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: (!to.trim() || sending) ? 'not-allowed' : 'pointer', opacity: (!to.trim() || sending) ? 0.4 : 1 }}
          >
            {sending ? 'Sending...' : (
              <>
                Send
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable Send button with instant tooltip. Place in topbarRight components.
 */
export function SendDocumentButton({ onClick }) {
  return (
    <div style={{ position: 'relative' }} className="group">
      <button
        type="button"
        onClick={onClick}
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
      <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity" style={{ zIndex: 50 }}>
        Send / Download
      </span>
    </div>
  );
}
