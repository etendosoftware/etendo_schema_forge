import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Mail, Search } from 'lucide-react';
import { useUI } from '@/i18n';
import { sendDocumentEmail } from './documentEmailSend.js';
import RecipientChipEditor from './RecipientChipEditor.jsx';
import { buildRecipientEdits, normalizeRecipientList } from './recipientEdits.js';

// ETP-4226 — default send policy: editable To/CC recipients everywhere unless
// the window's `decisions.json → window.sendDocument` override says otherwise.
const DEFAULT_SEND_POLICY = { editableRecipients: true, cc: true, maxRecipients: 10 };

function resolveEmailSendErrorMessage(ui, data, documentType) {
  if (data?.status === 'THROTTLED') {
    return ui('sendModalThrottled', { seconds: data.retryAfterSeconds ?? '' });
  }
  if (data?.status === 'DUPLICATE') {
    return ui('sendModalDuplicate', { documentType });
  }
  if (data?.status === 'UNAUTHORIZED') {
    return ui('sendModalUnauthorized');
  }
  if (data?.status === 'VALIDATION_FAILED') {
    return data.message || ui('sendModalValidationFailed');
  }
  if (data?.status === 'NO_RECIPIENT') {
    return ui('sendModalNoRecipient', { documentType });
  }
  if (data?.status === 'SUPPRESSED') {
    return ui('sendModalSuppressed');
  }
  if (data?.status === 'KILL_SWITCHED') {
    return ui('sendModalUnavailable');
  }
  if (data?.status === 'PROVIDER_FAILED') {
    return ui('sendModalProviderFailed');
  }
  return data?.message || ui('sendModalSendFailed', { documentType });
}

function resolveEmailSendSuccessMessage(ui, status, documentType) {
  return status === 'DUPLICATE'
    ? ui('sendModalDuplicate', { documentType })
    : ui('sendModalSentSuccess', { documentType });
}

function resolveEmailSendExceptionMessage(ui, documentType) {
  return ui('sendModalSendFailed', { documentType });
}

async function sendDocumentFromModal({
  apiBaseUrl,
  token,
  documentId,
  windowName,
  documentNo,
  pdfBlob,
  pdfBlobUrl,
  cachePreviewBeforeSend,
  documentType,
  ui,
  setSendFeedback,
  onClose,
  recipientEdits,
}) {
  const data = await sendDocumentEmail({
    apiBaseUrl,
    token,
    documentId,
    windowName,
    documentNo,
    pdfBlob: cachePreviewBeforeSend ? pdfBlob : null,
    pdfBlobUrl: cachePreviewBeforeSend ? pdfBlobUrl : null,
    recipientEdits,
  });

  if (data.status === 'SENT' || data.status === 'DUPLICATE') {
    const successMessage = resolveEmailSendSuccessMessage(ui, data.status, documentType);
    toast.success(successMessage);
    setSendFeedback({ type: 'success', message: successMessage });
    onClose();
    return;
  }

  const errorMessage = resolveEmailSendErrorMessage(ui, data, documentType);
  setSendFeedback({ type: 'error', message: errorMessage });
  toast.error(errorMessage);
}

async function renderPdfIntoIframe(node, reportId, documentId, token, setPdfLoading, setPdfError) {
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
}

// ETP-4226 — editable-recipients To/CC block. The read-only branch below is
// the `sendPolicy.editableRecipients: false` opt-out (legacy rendering).
function RecipientFields({ editableRecipients, ccEnabled, toRecipients, ccRecipients, onToChange, onCcChange, onToValidityChange, onCcValidityChange, emailLoading, noToRecipient, overMaxRecipients, maxRecipients, ui }) {
  const [ccExpanded, setCcExpanded] = useState(false);
  if (!editableRecipients) {
    return (
      <div style={{ position: 'relative' }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>{ui('sendModalTo')}</label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={toRecipients.join(', ')}
            readOnly
            placeholder={emailLoading ? '' : 'email@company.com'}
            style={{ width: '100%', fontSize: 13, padding: '8px 32px 8px 10px', border: '0.5px solid #d1d5db', borderRadius: 6, outline: 'none', color: '#111827', background: '#f9fafb', boxSizing: 'border-box' }}
          />
          <Search
            size={13}
            strokeWidth={1.5}
            color="#9ca3af"
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            data-testid="Search__afec0a" />
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <RecipientChipEditor
        recipients={toRecipients}
        onChange={onToChange}
        label={ui('sendModalTo')}
        testIdPrefix="send-modal-to"
        onValidityChange={onToValidityChange}
        data-testid="RecipientChipEditor__afec0a" />
      {ccEnabled && !ccExpanded && (
        <button
          type="button"
          data-testid="send-modal-add-cc"
          onClick={() => setCcExpanded(true)}
          style={{ alignSelf: 'flex-start', fontSize: 12, color: '#2563eb', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
        >
          {ui('sendModalAddCc')}
        </button>
      )}
      {ccEnabled && ccExpanded && (
        <RecipientChipEditor
          recipients={ccRecipients}
          onChange={onCcChange}
          label={ui('sendModalCc')}
          testIdPrefix="send-modal-cc"
          onValidityChange={onCcValidityChange}
          data-testid="RecipientChipEditor__afec0a" />
      )}
      {noToRecipient && (
        <span role="alert" style={{ fontSize: 12, color: '#dc2626' }}>{ui('sendModalNoToRecipient')}</span>
      )}
      {overMaxRecipients && (
        <span role="alert" style={{ fontSize: 12, color: '#dc2626' }}>{ui('sendModalMaxRecipients', { max: maxRecipients })}</span>
      )}
    </div>
  );
}

function EmailFormPanel({ recipientFieldsProps, subject, message, ui }) {
  return (
    <div style={{ width: '40%', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
      <RecipientFields {...recipientFieldsProps} ui={ui} data-testid="RecipientFields__afec0a" />
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>{ui('sendModalSubject')}</label>
        <input
          type="text"
          value={subject}
          readOnly
          style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid #d1d5db', borderRadius: 6, outline: 'none', color: '#111827', background: '#f9fafb', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>{ui('sendModalMessage')}</label>
        <textarea
          value={message}
          readOnly
          placeholder={ui('sendModalMessagePlaceholder')}
          style={{ width: '100%', flex: 1, minHeight: 80, fontSize: 13, padding: '8px 10px', border: '0.5px solid #d1d5db', borderRadius: 6, outline: 'none', color: '#111827', background: '#f9fafb', resize: 'none', boxSizing: 'border-box' }}
        />
      </div>
    </div>
  );
}

async function fetchAndDownloadPdf(reportId, documentId, windowName, documentNo, token) {
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
}

function resolveInitialEmail(bpEmail) {
  return bpEmail?.includes('@') ? bpEmail : '';
}

function resolveContactsBaseUrl(apiBaseUrl) {
  return apiBaseUrl.replace(/\/[^/]+$/, '/contacts');
}

async function loadBusinessPartnerEmail({ apiBaseUrl, token, bPartnerId, hasEmail, setTo, isCancelled }) {
  const contactsBaseUrl = resolveContactsBaseUrl(apiBaseUrl);
  const response = await fetch(`${contactsBaseUrl}/businessPartner/${bPartnerId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = response.ok ? await response.json() : null;
  if (isCancelled()) return;
  const records = data?.response?.data ?? data?.data ?? [];
  const withEmail = records.filter(record => record?.etgoEmail?.includes('@'));
  if (!hasEmail && withEmail.length > 0) setTo(withEmail[0].etgoEmail);
}

function renderPdfPreviewNode({ node, pdfBlobUrl, pdfBlobLoading, documentId, token, reportId, setPdfError, setPdfLoading }) {
  if (pdfBlobUrl) {
    node.src = `${pdfBlobUrl}#toolbar=0&navpanes=0&scrollbar=1`;
    setPdfError(null);
    setPdfLoading(false);
    return;
  }

  if (pdfBlobLoading) {
    setPdfError(null);
    setPdfLoading(true);
    return;
  }

  if (documentId && token) {
    renderPdfIntoIframe(node, reportId, documentId, token, setPdfLoading, setPdfError);
  }
}

function downloadExistingPdfBlobUrl(pdfBlobUrl, windowName, documentNo) {
  const a = document.createElement('a');
  a.href = pdfBlobUrl;
  a.download = `${windowName || 'invoice'}-${documentNo}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Left column of the modal: PDF preview (with loading/error states) plus the
 * download button. Extracted to keep SendDocumentModal's complexity in check.
 */
function DocumentPreviewPane({ allowEmail, pdfLoading, pdfError, waitingForBlob, iframeRef, downloading, onDownload, ui }) {
  return (
    <div style={{ width: allowEmail ? '60%' : '100%', display: 'flex', flexDirection: 'column', borderRight: allowEmail ? '0.5px solid #E5E7EB' : 'none' }}>
      <div style={{ flex: 1, position: 'relative', background: '#EFEFEF' }}>
        {pdfLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13, gap: 10 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'sfSpin 0.9s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>{ui('sendModalLoadingPreview')}</span>
          </div>
        )}
        {pdfError && !waitingForBlob && !pdfLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', padding: 24, textAlign: 'center', gap: 8 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#6B7280' }}>{ui('sendModalPdfPreview')}</span>
            <span style={{ fontSize: 13, color: '#9ca3af', maxWidth: 220 }}>{ui('sendModalPdfNotConfigured')}</span>
          </div>
        )}
        <iframe ref={iframeRef} style={{ width: '100%', height: '100%', border: 'none', opacity: pdfLoading ? 0 : 1 }} title="Document preview" />
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', background: '#fff', border: 'none', borderTop: '0.5px solid #E5E7EB', fontSize: 13, color: '#374151', cursor: downloading ? 'wait' : 'pointer', flexShrink: 0 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        {downloading ? ui('sendModalDownloading') : ui('downloadPdf')}
      </button>
    </div>
  );
}

/**
 * Reusable Send/Download modal for any document (invoice, order, quotation, shipment).
 *
 * Props:
 * - documentType: display label e.g. "Invoice", "Order", "Quotation", "Shipment"
 * - documentNo: document number
 * - bpName: business partner name
 * - bpEmail: pre-filled email (optional, falls back to fetched email if absent)
 * - bPartnerId: business partner record id; used to fetch etgoEmail from /contacts
 * - apiBaseUrl: NEO Headless API base URL (required if bPartnerId is provided)
 * - documentId: record ID for PDF rendering
 * - windowName: for report ID resolution (e.g. "sales-invoice")
 * - token: auth token
 * - onClose: callback to close modal
 *
 * Optional PDF preview support:
 * - pdfBlobUrl: object URL created from a pre-rendered PDF blob.
 * - pdfBlob: pre-rendered PDF blob to cache before sending.
 * - pdfBlobLoading: disables send while a cacheable preview is still loading.
 * - cachePreviewBeforeSend: caches pdfBlob/pdfBlobUrl through /preview-file before sending.
 * When pdfBlobUrl is provided, preview and download use it directly and bypass
 * the /api/reports render endpoint.
 *
 * ETP-4226 — recipient policy:
 * - sendPolicy: spec-derived override object merged over
 *   `{ editableRecipients: true, cc: true, maxRecipients: 10 }`. Pass the
 *   window's `sendDocument` config verbatim (one opaque prop).
 */
export default function SendDocumentModal({ documentType = 'Document', documentNo, bpName, bpEmail, bPartnerId, apiBaseUrl, documentId, windowName, token, onClose, pdfBlobUrl, pdfBlob, pdfBlobLoading = false, cachePreviewBeforeSend = true, isClosing = false, allowEmail = true, sendPolicy = {} }) {
  const ui = useUI();
  const policy = useMemo(() => ({ ...DEFAULT_SEND_POLICY, ...(sendPolicy || {}) }), [sendPolicy]);
  const editableRecipients = policy.editableRecipients !== false;
  const initialEmail = resolveInitialEmail(bpEmail);
  const hasEmail = Boolean(initialEmail);
  const [toRecipients, setToRecipients] = useState(() => (initialEmail ? [initialEmail] : []));
  const [ccRecipients, setCcRecipients] = useState([]);
  const [invalidDrafts, setInvalidDrafts] = useState({ to: false, cc: false });
  // Server-proposed base recipient list used for diffing in buildRecipientEdits.
  // Captures the contact email whether it came from the bpEmail prop or the fetch.
  const baseRecipientsRef = useRef(initialEmail ? [initialEmail] : []);
  const [emailLoading, setEmailLoading] = useState(false);

  // Fetch trusted contact data to seed the server-resolved recipient proposal.
  useEffect(() => {
    if (!bPartnerId || !apiBaseUrl || !token) return;
    let cancelled = false;
    setEmailLoading(true);
    loadBusinessPartnerEmail({
      apiBaseUrl,
      token,
      bPartnerId,
      hasEmail,
      setTo: (email) => {
        baseRecipientsRef.current = [email];
        // Merge ahead of any address the user typed while loading.
        setToRecipients(prev => normalizeRecipientList([email, ...prev]));
      },
      isCancelled: () => cancelled,
    })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEmailLoading(false); });
    return () => { cancelled = true; };
  }, [hasEmail, bPartnerId, apiBaseUrl, token]);

  // Cross-channel precedence mirror (backend `to > cc`): an address present in
  // To is silently dropped from CC, and adding it to CC merges into To.
  const handleToChange = useCallback((next) => {
    const normalized = normalizeRecipientList(next);
    const toKeys = new Set(normalized.map(address => address.toLowerCase()));
    setToRecipients(normalized);
    setCcRecipients(prev => prev.filter(address => !toKeys.has(address.toLowerCase())));
  }, []);

  const handleCcChange = useCallback((next) => {
    setCcRecipients(() => {
      const toKeys = new Set(toRecipients.map(address => address.toLowerCase()));
      return normalizeRecipientList(next).filter(address => !toKeys.has(address.toLowerCase()));
    });
  }, [toRecipients]);

  const handleToValidityChange = useCallback((isValid) => {
    setInvalidDrafts(prev => ({ ...prev, to: !isValid }));
  }, []);

  const handleCcValidityChange = useCallback((isValid) => {
    setInvalidDrafts(prev => ({ ...prev, cc: !isValid }));
  }, []);

  const subject = `${documentType} #${documentNo} — ${bpName}`;
  const message = '';
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(!pdfBlobUrl);
  // True while the parent is still generating the blob via useInvoicePdf — suppress
  // the fallback report-render fetch and show a spinner instead of the error card.
  const waitingForBlob = pdfBlobLoading && !pdfBlobUrl;
  const [pdfError, setPdfError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const reportId = `print-${windowName}`;

  const iframeRef = useCallback(node => {
    if (!node) return;
    renderPdfPreviewNode({
      node,
      pdfBlobUrl,
      pdfBlobLoading,
      documentId,
      token,
      reportId,
      setPdfError,
      setPdfLoading,
    });
  }, [documentId, token, reportId, pdfBlobUrl, pdfBlobLoading]);

  const handleDownload = async () => {
    if (downloading) return;

    // If a blob URL is already available, download it directly
    if (pdfBlobUrl) {
      downloadExistingPdfBlobUrl(pdfBlobUrl, windowName, documentNo);
      return;
    }

    setDownloading(true);
    try {
      await fetchAndDownloadPdf(reportId, documentId, windowName, documentNo, token);
    } catch (err) {
      toast.error(err.message);
    }
    setDownloading(false);
  };

  const handleSend = async () => {
    if (sending || !documentId) return;
    setSending(true);
    setSendFeedback(null);
    try {
      // Untouched sends yield null here, keeping the command byte-identical to
      // the legacy one (client idempotencyKey, no recipientEdits).
      const recipientEdits = editableRecipients
        ? buildRecipientEdits(baseRecipientsRef.current, { to: toRecipients, cc: ccRecipients })
        : null;
      await sendDocumentFromModal({
        apiBaseUrl,
        token,
        documentId,
        windowName,
        documentNo,
        pdfBlob,
        pdfBlobUrl,
        cachePreviewBeforeSend,
        documentType,
        ui,
        setSendFeedback,
        onClose,
        recipientEdits,
      });
    } catch {
      const errorMessage = resolveEmailSendExceptionMessage(ui, documentType);
      setSendFeedback({ type: 'error', message: errorMessage });
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
  };

  const shouldCachePreview = cachePreviewBeforeSend && Boolean(pdfBlob || pdfBlobUrl || pdfBlobLoading);
  const hasCacheablePreview = Boolean(pdfBlob || pdfBlobUrl);
  const waitingForCacheablePreview = shouldCachePreview && pdfBlobLoading && !hasCacheablePreview;
  // ETP-4226 — recipient gating only applies to the editable default; the
  // read-only opt-out keeps the exact legacy disable conditions.
  const hasInvalidDraft = invalidDrafts.to || invalidDrafts.cc;
  const noToRecipient = editableRecipients && toRecipients.length === 0;
  const overMaxRecipients = editableRecipients
    && toRecipients.length + ccRecipients.length > policy.maxRecipients;
  const sendDisabled = !documentId || sending || waitingForCacheablePreview
    || (editableRecipients && (hasInvalidDraft || noToRecipient || overMaxRecipients));

  return (
    <>
      <style>{`
        @keyframes sfSlideDownIn { from { transform: translateY(-40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes sfSlideUpOut  { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-40px); opacity: 0; } }
        @keyframes sfSpin { to { transform: rotate(360deg); } }
      `}</style>
      <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div onClick={e => e.stopPropagation()} style={{ width: 800, height: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB', animation: isClosing ? 'sfSlideUpOut 280ms ease-in forwards' : 'sfSlideDownIn 280ms ease-out' }}>
          <div style={{ padding: '12px 16px', background: '#F5F5F5', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={16} strokeWidth={1.5} color="#374151" data-testid="Mail__afec0a" />
              <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{ui('sendModalTitle', { documentType, documentNo })}</span>
            </div>
            <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
          </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <DocumentPreviewPane
            allowEmail={allowEmail}
            pdfLoading={pdfLoading}
            pdfError={pdfError}
            waitingForBlob={waitingForBlob}
            iframeRef={iframeRef}
            downloading={downloading}
            onDownload={handleDownload}
            ui={ui}
            data-testid="DocumentPreviewPane__afec0a" />

          {allowEmail && (
            <EmailFormPanel
              recipientFieldsProps={{
                editableRecipients,
                ccEnabled: policy.cc !== false,
                toRecipients,
                ccRecipients,
                onToChange: handleToChange,
                onCcChange: handleCcChange,
                onToValidityChange: handleToValidityChange,
                onCcValidityChange: handleCcValidityChange,
                emailLoading,
                noToRecipient,
                overMaxRecipients,
                maxRecipients: policy.maxRecipients,
              }}
              subject={subject}
              message={message}
              ui={ui}
              data-testid="EmailFormPanel__afec0a" />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: allowEmail ? 'space-between' : 'flex-end', background: '#F5F5F5', borderTop: '1px solid #E5E5E5', padding: '10px 16px', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>{allowEmail ? ui('cancel') : ui('close')}</button>
          {sendFeedback && (
            <span role="status" style={{ flex: 1, marginLeft: 12, marginRight: 12, fontSize: 12, color: sendFeedback.type === 'error' ? '#dc2626' : '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sendFeedback.message}
            </span>
          )}
          {allowEmail && (
          <button
            type="button"
            onClick={handleSend}
            disabled={sendDisabled}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '6px 16px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: sendDisabled ? 'not-allowed' : 'pointer', opacity: sendDisabled ? 0.4 : 1 }}
          >
            {sending ? ui('sendModalSending') : (
              <>
                {ui('sendModalSend')}
                <Mail size={14} strokeWidth={1.5} data-testid="Mail__afec0a" />
              </>
            )}
          </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

/**
 * Reusable Send button with instant tooltip. Place in topbarRight components.
 */
export function SendDocumentButton({ onClick }) {
  const ui = useUI();
  const label = ui('quickAction.email');
  return (
    <div style={{ position: 'relative' }} className="group">
      <button
        type="button"
        data-testid="action-send-email"
        onClick={onClick}
        aria-label={label}
        className="flex items-center justify-center p-[7px] rounded-md bg-white border border-[#D1D4DB] shadow-[0px_1px_2px_0px_#1212170D] text-muted-foreground hover:bg-[#F1F5F9] hover:text-foreground transition-colors"
      >
        <Mail className="h-[15px] w-[15px]" data-testid="Mail__afec0a" />
      </button>
      <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity" style={{ zIndex: 50 }}>
        {label}
      </span>
    </div>
  );
}
