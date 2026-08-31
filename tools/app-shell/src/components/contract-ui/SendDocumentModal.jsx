import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Mail, Search } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { hasClientPdf, buildClientPdfBlob } from '@/windows/custom/shared/documentPdfRegistry.js';
import { sendDocumentEmail } from './documentEmailSend.js';
import RecipientChipEditor from './RecipientChipEditor.jsx';
import { buildRecipientEdits, normalizeRecipientList } from './recipientEdits.js';

import { useApiFetch } from '@/auth/useApiFetch.js';
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
  messageEdits,
  language,
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
    messageEdits,
    // ETP-5003 — the caller passed this all along and it was dropped right here, so every send
    // reached the module with no language and rendered its catalog copy in Spanish while the
    // operator was reading English on screen. The module logs a WARN when it arrives empty.
    language,
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

async function renderPdfIntoIframe(node, reportId, documentId, apiFetch, setPdfLoading, setPdfError) {
  setPdfLoading(true);
  setPdfError(null);
  try {
    const res = await apiFetch(`/api/reports/${reportId}/render`, {
      method: 'POST',
      baseUrl: '',
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
        <label style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 4 }}>{ui('sendModalTo')}</label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={toRecipients.join(', ')}
            readOnly
            placeholder={emailLoading ? '' : 'email@company.com'}
            style={{ width: '100%', fontSize: 13, padding: '8px 32px 8px 10px', border: '0.5px solid hsl(var(--text-disabled))', borderRadius: 6, outline: 'none', color: 'hsl(var(--foreground))', background: 'hsl(var(--muted))', boxSizing: 'border-box' }}
          />
          <Search
            size={13}
            strokeWidth={1.5}
            color="hsl(var(--text-disabled))"
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
          style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--status-info-fg)', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
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
        <span role="alert" style={{ fontSize: 12, color: 'hsl(var(--destructive))' }}>{ui('sendModalNoToRecipient')}</span>
      )}
      {overMaxRecipients && (
        <span role="alert" style={{ fontSize: 12, color: 'hsl(var(--destructive))' }}>{ui('sendModalMaxRecipients', { max: maxRecipients })}</span>
      )}
    </div>
  );
}

function EmailFormPanel({ recipientFieldsProps, subject, message, onSubjectChange, onMessageChange, ui }) {
  return (
    <div style={{ width: '40%', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
      <RecipientFields {...recipientFieldsProps} ui={ui} data-testid="RecipientFields__afec0a" />
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 4 }}>{ui('sendModalSubject')}</label>
        <input
          type="text"
          value={subject}
          onChange={e => onSubjectChange(e.target.value)}
          style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid hsl(var(--border-subtle))', borderRadius: 6, outline: 'none', color: 'hsl(var(--foreground))', background: 'hsl(var(--card))', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 4 }}>{ui('sendModalMessage')}</label>
        <textarea
          value={message}
          onChange={e => onMessageChange(e.target.value)}
          placeholder={ui('sendModalMessagePlaceholder')}
          style={{ width: '100%', flex: 1, minHeight: 80, fontSize: 13, padding: '8px 10px', border: '0.5px solid hsl(var(--border-subtle))', borderRadius: 6, outline: 'none', color: 'hsl(var(--foreground))', background: 'hsl(var(--card))', resize: 'none', boxSizing: 'border-box' }}
        />
      </div>
    </div>
  );
}

async function fetchAndDownloadPdf(reportId, documentId, windowName, documentNo, apiFetch) {
  const res = await apiFetch(`/api/reports/${reportId}/render`, {
    method: 'POST',
    baseUrl: '',
    body: JSON.stringify({ format: 'html', params: { documentId } }),
  });
  if (!res.ok) throw new Error('Failed to render');
  const html = await res.text();
  const pdfRes = await apiFetch('/jsreport/api/report', {
    method: 'POST',
    baseUrl: '',
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

async function loadBusinessPartnerEmail({ apiBaseUrl, apiFetch, bPartnerId, hasEmail, setTo, isCancelled }) {
  const contactsBaseUrl = resolveContactsBaseUrl(apiBaseUrl);
  const response = await apiFetch(`${contactsBaseUrl}/businessPartner/${bPartnerId}`, { baseUrl: '' });
  const data = response.ok ? await response.json() : null;
  if (isCancelled()) return;
  const records = data?.response?.data ?? data?.data ?? [];
  const withEmail = records.filter(record => record?.etgoEmail?.includes('@'));
  if (!hasEmail && withEmail.length > 0) setTo(withEmail[0].etgoEmail);
}

function renderPdfPreviewNode({ node, pdfBlobUrl, pdfBlobLoading, documentId, token, apiFetch, reportId, setPdfError, setPdfLoading }) {
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
    renderPdfIntoIframe(node, reportId, documentId, apiFetch, setPdfLoading, setPdfError);
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
    <div style={{ width: allowEmail ? '60%' : '100%', display: 'flex', flexDirection: 'column', borderRight: allowEmail ? '0.5px solid hsl(var(--border-subtle))' : 'none' }}>
      <div style={{ flex: 1, position: 'relative', background: 'hsl(var(--border-subtle))' }}>
        {pdfLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-disabled))', fontSize: 13, gap: 10 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'sfSpin 0.9s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>{ui('sendModalLoadingPreview')}</span>
          </div>
        )}
        {pdfError && !waitingForBlob && !pdfLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-disabled))', padding: 24, textAlign: 'center', gap: 8 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--text-disabled))" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>{ui('sendModalPdfPreview')}</span>
            <span style={{ fontSize: 13, color: 'hsl(var(--text-disabled))', maxWidth: 220 }}>{ui('sendModalPdfNotConfigured')}</span>
          </div>
        )}
        <iframe ref={iframeRef} style={{ width: '100%', height: '100%', border: 'none', opacity: pdfLoading ? 0 : 1 }} title="Document preview" />
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', background: 'hsl(var(--card))', border: 'none', borderTop: '0.5px solid hsl(var(--border-subtle))', fontSize: 13, color: 'hsl(var(--foreground))', cursor: downloading ? 'wait' : 'pointer', flexShrink: 0 }}
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
 * - cachePreviewBeforeSend: uploads pdfBlob/pdfBlobUrl as the record's marked
 *   "main" attachment (see documentEmailSend.js's WINDOW_ATTACHMENT_TABLE) before sending.
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
  const apiFetch = useApiFetch(apiBaseUrl);
  const { locale } = useLocaleSwitch();

  // ETP-4912 — most callers hand over the PDF their own useXxxPdf hook produced. The
  // generic one (ListView's fallback modal) has no hook, so it used to leave this empty
  // and the modal both PREVIEWED and ATTACHED the print-* artifact — a different document
  // than the one on screen. When the window can render itself (documentPdfRegistry), build
  // that same PDF here instead. Windows outside the registry keep the old behaviour.
  const [ownPdfUrl, setOwnPdfUrl] = useState(null);
  const [ownPdfLoading, setOwnPdfLoading] = useState(false);
  useEffect(() => {
    if (pdfBlobUrl || pdfBlob || !documentId) return undefined;
    if (!hasClientPdf(windowName)) return undefined;
    let cancelled = false;
    let url = null;
    setOwnPdfLoading(true);
    buildClientPdfBlob({ windowName, documentId, apiBaseUrl, token, ui })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setOwnPdfUrl(url);
      })
      .catch((err) => console.warn('[SendDocumentModal] client PDF failed:', err?.message))
      .finally(() => { if (!cancelled) setOwnPdfLoading(false); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowName, documentId, apiBaseUrl, token, pdfBlobUrl, pdfBlob]);

  const effectivePdfUrl = pdfBlobUrl || ownPdfUrl;
  const effectivePdfLoading = pdfBlobLoading || ownPdfLoading;

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
    if (!bPartnerId || !apiBaseUrl) return;
    let cancelled = false;
    setEmailLoading(true);
    loadBusinessPartnerEmail({
      apiBaseUrl,
      apiFetch,
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
  }, [hasEmail, bPartnerId, apiBaseUrl, token, apiFetch]);

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

  // ETP-4717 — subject/message are editable. The auto-derived defaults are
  // kept around so handleSend can tell whether the operator actually changed
  // either one; an untouched send must stay byte-identical to the legacy
  // payload (no `messageEdits` key at all).
  // ETP-5003 — the operator must read exactly what the customer will receive, so both fields start
  // filled with the copy the backend composes when nothing is edited.
  //
  // ⚠ KEEP IN SYNC with the module's message catalog, which owns the same two sentences for a send
  // that carries no edits:
  //   com.etendoerp.go/.../email/render/messages/emails_*.properties
  //   → document.subject.withRecipient  and  document.body
  // They are composed here rather than fetched, to save the round trip. That trade only holds while
  // both sides say the same thing — they diverged once already, and the operator read one subject
  // while the customer received another. `defaultCopyInSync.test.js` fails when they drift; fix the
  // mismatch rather than relaxing the test.
  const defaultSubject = `${documentType} #${documentNo} — ${bpName}`;
  // ETP-5003 — the greeting is part of the editable message, not something the backend adds
  // afterwards: the operator has to be able to read and change how the customer is addressed.
  // The module skips its own greeting whenever a message is supplied, so this is the only one.
  const defaultMessage = [
    bpName ? ui('sendModalDefaultGreeting', { bpName }) : null,
    ui('sendModalDefaultMessage', { documentType, documentNo }),
  ].filter(Boolean).join('\n\n');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(!effectivePdfUrl);
  // True while the parent is still generating the blob via useInvoicePdf — suppress
  // the fallback report-render fetch and show a spinner instead of the error card.
  const waitingForBlob = effectivePdfLoading && !effectivePdfUrl;
  const [pdfError, setPdfError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const reportId = `print-${windowName}`;

  const iframeRef = useCallback(node => {
    if (!node) return;
    renderPdfPreviewNode({
      node,
      pdfBlobUrl: effectivePdfUrl,
      pdfBlobLoading: effectivePdfLoading,
      documentId,
      token,
      apiFetch,
      reportId,
      setPdfError,
      setPdfLoading,
    });
  }, [documentId, token, apiFetch, reportId, effectivePdfUrl, effectivePdfLoading]);

  const handleDownload = async () => {
    if (downloading) return;

    // If a blob URL is already available, download it directly
    if (effectivePdfUrl) {
      downloadExistingPdfBlobUrl(effectivePdfUrl, windowName, documentNo);
      return;
    }

    setDownloading(true);
    try {
      await fetchAndDownloadPdf(reportId, documentId, windowName, documentNo, apiFetch);
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
      // ETP-5003 — subject and message always travel, edited or not. They used to be omitted when
      // untouched, leaving the module to recompose them from its own catalog in whatever language
      // the command carried: a command with no language rebuilt them in Spanish while the operator
      // had just read them in English on this very screen. Sending what is on screen removes the
      // whole class of divergence — there is no second copy left to drift.
      const messageEdits = { subject, message };
      await sendDocumentFromModal({
        apiBaseUrl,
        token,
        documentId,
        windowName,
        documentNo,
        pdfBlob,
        // The attached PDF must be the one the modal is showing — including when it was
        // built here from the registry rather than handed in (ETP-4912). This value is
        // what cacheDocumentPreviewFile uploads as the record's marked attachment, i.e.
        // it IS the file the customer receives.
        pdfBlobUrl: effectivePdfUrl,
        cachePreviewBeforeSend,
        documentType,
        ui,
        setSendFeedback,
        onClose,
        recipientEdits,
        language: locale,
        messageEdits,
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
      <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
        <div onClick={e => e.stopPropagation()} style={{ width: 800, height: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: 'hsl(var(--card))', boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--border-subtle))', animation: isClosing ? 'sfSlideUpOut 280ms ease-in forwards' : 'sfSlideDownIn 280ms ease-out' }}>
          <div style={{ padding: '12px 16px', background: 'hsl(var(--muted))', borderBottom: '1px solid hsl(var(--border-subtle))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={16} strokeWidth={1.5} color="hsl(var(--foreground))" data-testid="Mail__afec0a" />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{ui('sendModalTitle', { documentType, documentNo })}</span>
            </div>
            <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-disabled))' }}>&times;</button>
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
              onSubjectChange={setSubject}
              onMessageChange={setMessage}
              ui={ui}
              data-testid="EmailFormPanel__afec0a" />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: allowEmail ? 'space-between' : 'flex-end', background: 'hsl(var(--muted))', borderTop: '1px solid hsl(var(--border-subtle))', padding: '10px 16px', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid hsl(var(--border-subtle))', background: 'transparent', color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}>{allowEmail ? ui('cancel') : ui('close')}</button>
          {sendFeedback && (
            <span role="status" style={{ flex: 1, marginLeft: 12, marginRight: 12, fontSize: 12, color: sendFeedback.type === 'error' ? 'hsl(var(--destructive))' : 'var(--status-success-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sendFeedback.message}
            </span>
          )}
          {allowEmail && (
          <button
            type="button"
            onClick={handleSend}
            disabled={sendDisabled}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '6px 16px', borderRadius: 6, border: 'none', background: 'hsl(var(--foreground))', color: 'hsl(var(--card))', cursor: sendDisabled ? 'not-allowed' : 'pointer', opacity: sendDisabled ? 0.4 : 1 }}
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
        className="flex items-center justify-center p-[7px] rounded-md bg-card border border-[hsl(var(--border-control))] shadow-[0px_1px_2px_0px_hsl(var(--foreground))0D] text-muted-foreground hover:bg-[hsl(var(--muted))] hover:text-foreground transition-colors"
      >
        <Mail className="h-[15px] w-[15px]" data-testid="Mail__afec0a" />
      </button>
      <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[11px] text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity" style={{ zIndex: 50 }}>
        {label}
      </span>
    </div>
  );
}
