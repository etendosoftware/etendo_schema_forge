import { lazy, Suspense, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Download, Mail, Maximize, Plus, Search, X } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { hasClientPdf, buildClientPdfBlob } from '@/windows/custom/shared/documentPdfRegistry.js';
import { sendDocumentEmail } from './documentEmailSend.js';
import RecipientChipEditor from './RecipientChipEditor.jsx';
import { buildRecipientEdits, normalizeRecipientList } from './recipientEdits.js';

import { useApiFetch } from '@/auth/useApiFetch.js';

// ETP-5598 — loaded on demand: the modal is imported by every list (ListView), and
// react-pdf/pdfjs is only needed once a PDF blob is actually previewed.
const PdfViewer = lazy(() => import('@/windows/custom/shared/PdfViewer.jsx'));

// ETP-4226 — default send policy: editable To/CC recipients everywhere unless
// the window's `decisions.json → window.sendDocument` override says otherwise.
const DEFAULT_SEND_POLICY = { editableRecipients: true, cc: true, maxRecipients: 10 };

// ETP-5293 — reasonCode → i18n key map for a VALIDATION_FAILED rejection of the
// modal's own messageEdits form. Only the reachable-from-this-UI codes get
// dedicated copy; MESSAGE_EDITS_INVALID_TYPE / MESSAGE_EDITS_UNKNOWN_FIELD only
// happen on a malformed raw API call and fall back to sendModalValidationFailed.
const VALIDATION_REASON_KEYS = {
  MESSAGE_EDITS_MISSING_SUBJECT_OR_MESSAGE: 'sendModalErrorMissingSubjectOrMessage',
  MESSAGE_EDITS_SUBJECT_TOO_LONG: 'sendModalErrorSubjectTooLong',
  MESSAGE_EDITS_MESSAGE_TOO_LONG: 'sendModalErrorMessageTooLong',
};

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
    // ETP-5293 — the raw backend `message` is English-only and must never reach
    // the user; map the structured reasonCode to translated copy instead.
    const key = data?.reasonCode && VALIDATION_REASON_KEYS[data.reasonCode];
    if (key) {
      return ui(key, {
        maxSubjectLength: data.maxSubjectLength,
        maxMessageLength: data.maxMessageLength,
      });
    }
    return ui('sendModalValidationFailed');
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
  onSent,
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
    // ETP-5069 — a plain cancel also calls onClose(), so a caller could not tell a
    // successful send apart from a dismissal, and the outcome the module reported
    // (status/auditId/requestId) was dropped as the modal unmounted. `onSent` is the
    // success-only signal; it stays optional so every existing caller is unaffected.
    onSent?.({ status: data.status, auditId: data.auditId, requestId: data.requestId });
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
      // ETP-5424 — a document render is a long call; opt out of the default timeout.
      timeout: 0,
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
// ETP-5598 — field styles from the Figma "Enviar" pop-up: 14px labels, 40px inputs.
// Colours are the exact Figma values, declared as `--sf-*` tokens in tools/app-shell/src/index.css.
const FIELD_LABEL_STYLE = { fontSize: 14, lineHeight: '24px', fontWeight: 500, color: 'hsl(var(--sf-gray-900))', display: 'block', marginBottom: 8 };
const FIELD_INPUT_STYLE = { width: '100%', minHeight: 40, fontSize: 14, lineHeight: '22px', fontWeight: 400, padding: '8px 12px', border: '1px solid hsl(var(--sf-border-input))', borderRadius: 8, outline: 'none', color: 'hsl(var(--sf-gray-900))', background: 'hsl(var(--sf-surface-overlay))', boxShadow: 'var(--sf-shadow-xs)', boxSizing: 'border-box' };
const REQUIRED_MARK = <span style={{ color: 'hsl(var(--sf-text-required))', marginLeft: 2 }}>*</span>;
const SF_ICON = 'hsl(var(--sf-icon-outline-secondary))';

// ETP-5294 — `toTouched` gates the `noToRecipient` error so it never flashes
// on open while the async business-partner-email fetch is still resolving
// `toRecipients` from its initial `[]`. `sendDisabled` below still uses the
// raw (untouched-agnostic) `noToRecipient`, so the Send button stays
// correctly disabled the whole time — only the visible message is gated.
function RecipientFields({ editableRecipients, ccEnabled, toRecipients, ccRecipients, onToChange, onCcChange, onToValidityChange, onCcValidityChange, emailLoading, noToRecipient, toTouched, overMaxRecipients, maxRecipients, ui }) {
  const [ccExpanded, setCcExpanded] = useState(false);
  if (!editableRecipients) {
    return (
      <div style={{ position: 'relative' }}>
        <label style={FIELD_LABEL_STYLE}>{ui('sendModalTo')}</label>
        <div style={{ position: 'relative' }}>
          <input
            className="sf-send-field"
            type="text"
            value={toRecipients.join(', ')}
            readOnly
            placeholder={emailLoading ? '' : 'email@company.com'}
            style={{ ...FIELD_INPUT_STYLE, paddingRight: 32, background: 'hsl(var(--muted))' }}
          />
          <Search
            size={13}
            strokeWidth={1.5}
            color={SF_ICON}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            data-testid="Search__afec0a" />
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <RecipientChipEditor
        recipients={toRecipients}
        onChange={onToChange}
        label={<>{ui('sendModalTo')}{REQUIRED_MARK}</>}
        testIdPrefix="send-modal-to"
        onValidityChange={onToValidityChange}
        data-testid="RecipientChipEditor__afec0a" />
      {ccEnabled && !ccExpanded && (
        <button
          type="button"
          data-testid="send-modal-add-cc"
          onClick={() => setCcExpanded(true)}
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, lineHeight: '24px', fontWeight: 500, color: 'hsl(var(--sf-gray-900))', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
        >
          <Plus size={20} strokeWidth={1.5} color={SF_ICON} data-testid="Plus__afec0a" />
          <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{ui('sendModalAddCc')}</span>
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
      {noToRecipient && toTouched && (
        <span role="alert" style={{ fontSize: 12, color: 'hsl(var(--destructive))' }}>{ui('sendModalNoToRecipient')}</span>
      )}
      {overMaxRecipients && (
        <span role="alert" style={{ fontSize: 12, color: 'hsl(var(--destructive))' }}>{ui('sendModalMaxRecipients', { max: maxRecipients })}</span>
      )}
    </div>
  );
}

// ETP-5294 — `subjectTouched` gates `noSubject`'s error the same way
// `toTouched` gates the To field's, so clearing the auto-filled default
// behaves consistently with an empty To: no eager flash, but the message
// appears once the operator actually interacts with the field. `onBlur`
// also marks it touched so leaving the field empty without further typing
// still surfaces the error.
function EmailFormPanel({ recipientFieldsProps, subject, message, onSubjectChange, onSubjectBlur, noSubject, subjectTouched, onMessageChange, ui }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', boxSizing: 'border-box' }}>
      <RecipientFields {...recipientFieldsProps} ui={ui} data-testid="RecipientFields__afec0a" />
      <div>
        <label style={FIELD_LABEL_STYLE}>{ui('sendModalSubject')}{REQUIRED_MARK}</label>
        <input
          className="sf-send-field"
          type="text"
          value={subject}
          onChange={e => onSubjectChange(e.target.value)}
          onBlur={onSubjectBlur}
          style={{ ...FIELD_INPUT_STYLE, ...((noSubject && subjectTouched) ? { borderColor: 'hsl(var(--destructive))' } : {}) }}
        />
        {noSubject && subjectTouched && (
          <span role="alert" style={{ display: 'block', fontSize: 12, color: 'hsl(var(--destructive))', marginTop: 4 }}>{ui('sendModalNoSubject')}</span>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <label style={FIELD_LABEL_STYLE}>{ui('sendModalMessage')}</label>
        <textarea
          className="sf-send-field"
          value={message}
          onChange={e => onMessageChange(e.target.value)}
          placeholder={ui('sendModalMessagePlaceholder')}
          style={{ ...FIELD_INPUT_STYLE, flex: 1, minHeight: 80, resize: 'none' }}
        />
      </div>
    </div>
  );
}

async function fetchAndDownloadPdf(reportId, documentId, windowName, documentNo, apiFetch) {
  const res = await apiFetch(`/api/reports/${reportId}/render`, {
    method: 'POST',
    // ETP-5424 — a document render is a long call; opt out of the default timeout.
    timeout: 0,
    baseUrl: '',
    body: JSON.stringify({ format: 'html', params: { documentId } }),
  });
  if (!res.ok) throw new Error('Failed to render');
  const html = await res.text();
  const pdfRes = await apiFetch('/jsreport/api/report', {
    method: 'POST',
    // ETP-5424 — a document render is a long call; opt out of the default timeout.
    timeout: 0,
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

// ETP-5294 — Bug 2: an empty (or whitespace-only) Subject had no validation at
// all, so it silently sent. Only meaningful when the email panel (and its
// Subject field) is actually rendered. Extracted (rather than inlined in the
// component body) to keep SendDocumentModal's cognitive complexity in check.
function resolveNoSubject(allowEmail, subject) {
  return allowEmail && !subject.trim();
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

// ETP-5598 — only the HTML fallback goes through the iframe now. A PDF blob is shown by
// PdfViewer (react-pdf), so the browser's own PDF viewer (dark side bands, full-width
// sheet, horizontal scroll) never renders in this modal.
function renderPdfPreviewNode({ node, pdfBlobLoading, documentId, apiFetch, reportId, setPdfError, setPdfLoading }) {
  if (pdfBlobLoading) {
    setPdfError(null);
    setPdfLoading(true);
    return;
  }

  if (documentId) {
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
 * Left column of the modal: the document preview with its loading/error states.
 * A PDF blob (`pdfUrl`) is rendered by PdfViewer — sheet fitted to the pane width
 * (24px top / 28px sides, cut by the bottom edge and scrolled), zoom bar top right,
 * as in the Figma "Enviar" pop-up. Without one, the HTML render of the print-* report goes into the iframe
 * (react-pdf cannot render HTML, so that path has no zoom). Extracted to keep
 * SendDocumentModal's complexity in check.
 */
const PREVIEW_PANE_WIDTH = 496;
const PREVIEW_PADDING = { top: 24, right: 28, bottom: 0, left: 28 };
const PREVIEW_CONTROL_COLORS = {
  background: 'hsl(var(--sf-surface-overlay))',
  border: 'hsl(var(--sf-border-input))',
  divider: 'hsl(var(--sf-border-input))',
  shadow: 'var(--sf-shadow-xs)',
  icon: SF_ICON,
  iconActive: 'hsl(var(--sf-gray-900))',
};

function DocumentPreviewPane({ allowEmail, pdfUrl, pdfLoading, pdfError, waitingForBlob, iframeRef, ui }) {
  return (
    <div style={{ ...(allowEmail ? { width: PREVIEW_PANE_WIDTH, flexShrink: 0 } : { flex: 1 }), display: 'flex', flexDirection: 'column' }}>
      <div data-testid="send-modal-preview" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: 'hsl(var(--sf-gray-100))' }}>
        {pdfUrl ? (
          <Suspense
            fallback={<PreviewLoading ui={ui} data-testid="PreviewLoading__afec0a" />}
            data-testid="Suspense__afec0a">
            <PdfViewer url={pdfUrl} contentPadding={PREVIEW_PADDING} fitIcon={Maximize} controlColors={PREVIEW_CONTROL_COLORS} data-testid="PdfViewer__afec0a" />
          </Suspense>
        ) : (
          <HtmlPreviewFrame pdfLoading={pdfLoading} pdfError={pdfError} waitingForBlob={waitingForBlob} iframeRef={iframeRef} ui={ui} data-testid="HtmlPreviewFrame__afec0a" />
        )}
      </div>
    </div>
  );
}

function PreviewLoading({ ui }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-disabled))', fontSize: 13, gap: 10 }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'sfSpin 0.9s linear infinite' }}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <span>{ui('sendModalLoadingPreview')}</span>
    </div>
  );
}

function HtmlPreviewFrame({ pdfLoading, pdfError, waitingForBlob, iframeRef, ui }) {
  return (
    <>
      {pdfLoading && <PreviewLoading ui={ui} data-testid="PreviewLoading__afec0a" />}
      {pdfError && !waitingForBlob && !pdfLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-disabled))', padding: 24, textAlign: 'center', gap: 8 }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--text-disabled))" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>{ui('sendModalPdfPreview')}</span>
          <span style={{ fontSize: 13, color: 'hsl(var(--text-disabled))', maxWidth: 220 }}>{ui('sendModalPdfNotConfigured')}</span>
        </div>
      )}
      <iframe ref={iframeRef} style={{ width: '100%', height: '100%', border: 'none', opacity: pdfLoading ? 0 : 1 }} title="Document preview" />
    </>
  );
}

// Figma "Button md / Pill": 40px high, Inter 500 14/24, 20px leading icon, 8px gap.
const PILL_BUTTON = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: '8px 12px', borderRadius: 9999, fontSize: 14, lineHeight: '24px', fontWeight: 500, boxSizing: 'border-box', whiteSpace: 'nowrap' };

function DownloadPdfButton({ downloading, onDownload, ui }) {
  return (
    <button
      type="button"
      data-testid="send-modal-download"
      onClick={onDownload}
      disabled={downloading}
      style={{ ...PILL_BUTTON, border: '1px solid hsl(var(--sf-border-input))', background: 'hsl(var(--sf-surface-overlay))', boxShadow: 'var(--sf-shadow-xs)', color: 'hsl(var(--sf-gray-900))', cursor: downloading ? 'wait' : 'pointer' }}
    >
      <Download size={20} strokeWidth={1.5} color={SF_ICON} data-testid="Download__afec0a" />
      {downloading ? ui('sendModalDownloading') : ui('downloadPdf')}
    </button>
  );
}

function SendButton({ onSend, sendDisabled, sending, ui }) {
  return (
    <button
      type="button"
      onClick={onSend}
      disabled={sendDisabled}
      style={{ ...PILL_BUTTON, border: 'none', ...(sendDisabled
        // Figma primary-gray-disabled: #D1D4DB with white text and icon (white in both themes).
        ? { background: 'hsl(var(--sf-primary-gray-disabled))', color: 'hsl(var(--sf-on-primary-gray-disabled))' }
        : { background: 'hsl(var(--foreground))', color: 'hsl(var(--card))' }), cursor: sendDisabled ? 'not-allowed' : 'pointer' }}
    >
      {sending ? ui('sendModalSending') : (
        <>
          <Mail size={20} strokeWidth={1.5} data-testid="Mail__afec0a" />
          {ui('sendModalSend')}
        </>
      )}
    </button>
  );
}

/**
 * Footer: Cancel (tertiary) on the left; Download PDF (secondary outline) + Send
 * (primary) on the right. Without the email panel there is no Send — the footer is
 * right-aligned with Download next to Close.
 */
function SendModalFooter({ allowEmail, onClose, sendFeedback, downloading, onDownload, onSend, sendDisabled, sending, ui }) {
  const closeButton = (
    <button type="button" onClick={onClose} style={{ ...PILL_BUTTON, border: 'none', background: 'transparent', color: 'hsl(var(--sf-gray-900))', cursor: 'pointer' }}>{allowEmail ? ui('cancel') : ui('close')}</button>
  );
  const downloadButton = <DownloadPdfButton downloading={downloading} onDownload={onDownload} ui={ui} data-testid="DownloadPdfButton__afec0a" />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: allowEmail ? 'space-between' : 'flex-end', gap: allowEmail ? 0 : 8, background: 'hsl(var(--sf-surface-overlay))', borderTop: '1px solid hsl(var(--sf-gray-100))', padding: '11px 20px 4px', minHeight: 56, boxSizing: 'border-box', flexShrink: 0 }}>
      {allowEmail ? closeButton : downloadButton}
      {sendFeedback && (
        <span role="status" style={{ flex: 1, marginLeft: 12, marginRight: 12, fontSize: 12, color: sendFeedback.type === 'error' ? 'hsl(var(--destructive))' : 'var(--status-success-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sendFeedback.message}
        </span>
      )}
      {allowEmail ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {downloadButton}
          <SendButton onSend={onSend} sendDisabled={sendDisabled} sending={sending} ui={ui} data-testid="SendButton__afec0a" />
        </div>
      ) : closeButton}
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
 * - onSent: optional callback fired only on a successful send (SENT / DUPLICATE),
 *   just before onClose(), with `{ status, auditId, requestId }`. Lets a caller
 *   distinguish "the document was sent" from "the user cancelled" — both of which
 *   reach onClose — e.g. to invalidate the email-history card (ETP-5069).
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
export default function SendDocumentModal({ documentType = 'Document', documentNo, bpName, bpEmail, bPartnerId, apiBaseUrl, documentId, windowName, token, onClose, onSent, pdfBlobUrl, pdfBlob, pdfBlobLoading = false, cachePreviewBeforeSend = true, isClosing = false, allowEmail = true, sendPolicy = {} }) {
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
    // A caller-side build may be in flight before its url arrives.
    if (pdfBlobUrl || pdfBlob || pdfBlobLoading || !documentId) return undefined;
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
  }, [windowName, documentId, apiBaseUrl, token, pdfBlobUrl, pdfBlob, pdfBlobLoading]);

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

  // ETP-5294 — "touched" gates for the required-field error messages below.
  // `toRecipients` starts empty and is only seeded once the async contact-email
  // fetch resolves (or never, if there is none), so deriving the error straight
  // from `toRecipients.length === 0` made it flash on every open. Both flags
  // start false and are flipped only by a real user action — never by the fetch
  // effect — mirroring the "touched" pattern already used by DataTable.
  const [toTouched, setToTouched] = useState(false);
  const [subjectTouched, setSubjectTouched] = useState(false);

  // Cross-channel precedence mirror (backend `to > cc`): an address present in
  // To is silently dropped from CC, and adding it to CC merges into To.
  const handleToChange = useCallback((next) => {
    setToTouched(true);
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
    // Only fires as a byproduct of real typing/blur/keydown inside
    // RecipientChipEditor (never on mount), so it doubles as a touch signal —
    // covers e.g. blurring an empty input without typing anything.
    setToTouched(true);
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
  const handleSubjectChange = useCallback((value) => {
    setSubjectTouched(true);
    setSubject(value);
  }, []);
  const handleSubjectBlur = useCallback(() => setSubjectTouched(true), []);
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

  // The iframe (HTML path) marks the preview as loading while a blob is still being
  // built; once the blob URL arrives the iframe unmounts, so clear that state here.
  useEffect(() => {
    if (!effectivePdfUrl) return;
    setPdfLoading(false);
    setPdfError(null);
  }, [effectivePdfUrl]);

  const iframeRef = useCallback(node => {
    if (!node) return;
    renderPdfPreviewNode({
      node,
      pdfBlobLoading: effectivePdfLoading,
      documentId,
      apiFetch,
      reportId,
      setPdfError,
      setPdfLoading,
    });
  }, [documentId, apiFetch, reportId, effectivePdfLoading]);

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
    // ETP-5294 — a submit attempt (even one blocked by `sendDisabled`, e.g. a
    // future keyboard-only flow that reaches this handler) always surfaces
    // both required-field errors, matching the "or attempted to submit" half
    // of the touched gate.
    setToTouched(true);
    setSubjectTouched(true);
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
        onSent,
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
  const noSubject = resolveNoSubject(allowEmail, subject);
  const sendDisabled = !documentId || sending || waitingForCacheablePreview || noSubject
    || (editableRecipients && (hasInvalidDraft || noToRecipient || overMaxRecipients));

  return (
    <>
      <style>{`
        @keyframes sfSlideDownIn { from { transform: translateY(-40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes sfSlideUpOut  { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-40px); opacity: 0; } }
        @keyframes sfSpin { to { transform: rotate(360deg); } }
      `}</style>
      <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
        <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: 1020, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)', padding: '8px 0', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 'var(--radius)', backgroundColor: 'hsl(var(--sf-surface-overlay))', boxShadow: 'var(--sf-shadow-overlay)', animation: isClosing ? 'sfSlideUpOut 280ms ease-in forwards' : 'sfSlideDownIn 280ms ease-out' }}>
          <div style={{ height: 48, padding: '8px 40px 11px 20px', boxSizing: 'border-box', background: 'hsl(var(--sf-surface-overlay))', borderBottom: '1px solid hsl(var(--sf-gray-100))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 20, lineHeight: '28px', fontWeight: 600, color: 'hsl(var(--sf-gray-900))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ui('sendModalTitle', { documentType, documentNo })}</span>
          </div>

        <div style={{ height: 432, flexShrink: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <DocumentPreviewPane
            allowEmail={allowEmail}
            pdfUrl={effectivePdfUrl}
            pdfLoading={pdfLoading}
            pdfError={pdfError}
            waitingForBlob={waitingForBlob}
            iframeRef={iframeRef}
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
                toTouched,
                overMaxRecipients,
                maxRecipients: policy.maxRecipients,
              }}
              subject={subject}
              message={message}
              onSubjectChange={handleSubjectChange}
              onSubjectBlur={handleSubjectBlur}
              noSubject={noSubject}
              subjectTouched={subjectTouched}
              onMessageChange={setMessage}
              ui={ui}
              data-testid="EmailFormPanel__afec0a" />
          )}
        </div>

        <SendModalFooter
          allowEmail={allowEmail}
          onClose={onClose}
          sendFeedback={sendFeedback}
          downloading={downloading}
          onDownload={handleDownload}
          onSend={handleSend}
          sendDisabled={sendDisabled}
          sending={sending}
          ui={ui}
          data-testid="SendModalFooter__afec0a" />
        {/* Figma "Close": xs round tertiary button floating on the modal root, not in the header row. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={ui('close')}
          className="bg-transparent hover:bg-muted transition-colors"
          style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, padding: 2, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9999, border: 'none', cursor: 'pointer', color: SF_ICON }}
        >
          <X size={20} strokeWidth={1.5} data-testid="X__afec0a" />
        </button>
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
