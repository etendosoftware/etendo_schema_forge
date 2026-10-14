import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SIF_OPEN_SEND_EVENT, getSifBodyKey, isSifSendRequestFor } from './sifSending.js';
import SifSendingModal from './SifSendingModal.jsx';

/**
 * Hosts the "send to the fiscal system" modal for the invoice open in the form view,
 * on behalf of the form kebab entry (`SifSendMenuItem`).
 *
 * ETP-5700 — the kebab cannot keep the modal: `DetailMoreActionsMenu` unmounts its
 * content as soon as the menu closes. The invoice window mounts this host next to its
 * form (`sales-invoice/index.jsx`, `purchase-invoice/index.jsx`) unconditionally, so the
 * request is never lost, whatever the topbar renders. The kebab entry already computed
 * the pending targets with `useInvoiceSifSending` (the gate shared with the topbar
 * button), so the host only opens the modal for them.
 *
 * After a successful send it fires `${specName}:invoice-updated`, the event the window's
 * topbar already listens to in order to refresh the record.
 *
 * @param {object} props
 * @param {string} props.apiBaseUrl the window's NEO base (`/sws/neo/<spec>`)
 * @param {string} props.recordId the open invoice id
 */
export default function SifSendModalHost({ apiBaseUrl, recordId }) {
  const specName = apiBaseUrl?.split('/').filter(Boolean).pop() || 'sales-invoice';
  const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
  const [request, setRequest] = useState(null);
  const sentRef = useRef(false);

  useEffect(() => {
    if (!recordId) return undefined;
    const onRequest = (event) => {
      if (!isSifSendRequestFor(event, specName, recordId)) return;
      const pendingTargets = event.detail?.pendingTargets;
      if (!pendingTargets?.sendSii && !pendingTargets?.sendTbai) return;
      sentRef.current = false;
      setRequest({ recordId: event.detail.recordId, pendingTargets });
    };
    window.addEventListener(SIF_OPEN_SEND_EVENT, onRequest);
    return () => window.removeEventListener(SIF_OPEN_SEND_EVENT, onRequest);
  }, [specName, recordId]);

  if (!request || typeof document === 'undefined') return null;

  return createPortal(
    <SifSendingModal
      pendingTargets={request.pendingTargets}
      bodyKey={getSifBodyKey(specName, request.pendingTargets)}
      base={base}
      specName={specName}
      recordId={request.recordId}
      titleId="send-to-sif-menu-title"
      onClose={() => {
        const sent = sentRef.current;
        sentRef.current = false;
        setRequest(null);
        if (sent) {
          window.dispatchEvent(new CustomEvent(`${specName}:invoice-updated`, { detail: { invoiceId: request.recordId } }));
        }
      }}
      onAfterSend={(next) => {
        if (Object.values(next).some((r) => r?.ok)) sentRef.current = true;
      }}
      data-testid="SifSendingModal__menuHost" />,
    document.body,
  );
}
