import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal';

/**
 * Wires the row-hover "Send document" envelope so it opens SendDocumentModal
 * WITH a client-generated PDF preview.
 *
 * The hover envelope in RowQuickActions only calls `onEmail(row)`; it never
 * renders the modal itself. When a window does NOT provide its own `onEmail`,
 * ListView falls back to a generic SendDocumentModal mounted WITHOUT
 * `pdfBlobUrl` — so the preview panel shows the "PDF not configured" card even
 * though the side-panel preview (which passes a blob) works. This hook lets a
 * window supply its per-document PDF hook so the hover envelope opens with the
 * same preview the side panel uses.
 *
 * Mirrors the pattern already used inline by sales-invoice
 * (tools/app-shell/src/windows/custom/sales-invoice/index.jsx). Extracted here
 * so every documental window can reuse it without duplicating the emailRow
 * state + PDF hook + modal-portal wiring.
 *
 * Usage:
 *   const { onEmail, emailModalPortal } = useRowEmailModal({
 *     usePdf: useOrderPdf, apiBaseUrl, token, windowName,
 *     documentType: tMenu('Sales Order'),
 *   });
 *   // rowQuickActions.onEmail = onEmail
 *   // render {emailModalPortal}
 *
 * @param {object}   opts
 * @param {Function} opts.usePdf       window PDF hook: (id, apiBaseUrl, token) => { pdfUrl, loading }
 * @param {string}   opts.apiBaseUrl
 * @param {string}   opts.token
 * @param {string}   opts.windowName
 * @param {string}   opts.documentType localized document label shown in the modal header
 * @param {boolean} [opts.allowEmail=true]
 * @returns {{ onEmail: Function, emailModalPortal: React.ReactNode, emailRow: object|null, setEmailRow: Function }}
 */
// Stable no-op fallback so the hook is always called (rules of hooks) even when
// a caller does not supply a PDF hook — the modal then simply has no preview.
function useNoPdf() {
  return { pdfUrl: null, loading: false };
}

export function useRowEmailModal({ usePdf, apiBaseUrl, token, windowName, documentType, allowEmail = true }) {
  const [emailRow, setEmailRow] = useState(null);
  // `usePdf` is a stable hook reference (module-level import) supplied by the
  // window; it stays constant across renders, so selecting the hook here and
  // calling it unconditionally respects the rules of hooks.
  const pdfHook = typeof usePdf === 'function' ? usePdf : useNoPdf;
  const { pdfUrl, loading } = pdfHook(emailRow?.id ?? null, apiBaseUrl, token);

  const onEmail = useCallback((row) => setEmailRow(row), []);

  const emailModalPortal = emailRow
    ? createPortal(
        <SendDocumentModal
          documentType={documentType}
          documentNo={emailRow.documentNo}
          bpName={emailRow['businessPartner$_identifier']}
          bPartnerId={emailRow.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={emailRow.id}
          windowName={windowName}
          token={token}
          allowEmail={allowEmail}
          pdfBlobUrl={pdfUrl}
          pdfBlobLoading={loading}
          onClose={() => setEmailRow(null)}
          data-testid="SendDocumentModal__rowEmail" />,
        document.body,
      )
    : null;

  return { onEmail, emailModalPortal, emailRow, setEmailRow };
}
