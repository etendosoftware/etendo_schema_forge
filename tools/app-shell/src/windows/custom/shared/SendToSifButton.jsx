import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { SIF_OPEN_SEND_EVENT, isSifSendRequestFor } from './sifSending.js';
import { useInvoiceSifSending } from './useInvoiceSifSending.js';
import SifSendingModal from './SifSendingModal.jsx';

export default function SendToSifButton({ data, recordId, apiBaseUrl, status, onSave, isDirty, isDocumentReadOnly }) {
  const ui = useUI();
  const [modalOpen, setModalOpen] = useState(false);
  const [sentSuccessfully, setSentSuccessfully] = useState(false);

  // ETP-5087: fiscal config keyed by the INVOICE's own org — see useInvoiceSifSending.js.
  const { specName, pendingTargets, hasPendingTargets, labelKey, bodyKey, base } =
    useInvoiceSifSending({ data, apiBaseUrl });
  const updateEventName = `${specName}:invoice-updated`;
  const canSend = status === 'CO' && hasPendingTargets && !isDocumentReadOnly;
  // Same id resolution SifSendMenuItem uses when it addresses the request.
  const currentId = data?.id || recordId;

  // ETP-5700 — the form kebab entry (SifSendMenuItem) asks this button to open its modal:
  // the kebab unmounts its own content as soon as the menu closes, so it cannot host it.
  useEffect(() => {
    if (!canSend) return undefined;
    const onRequest = (event) => {
      if (isSifSendRequestFor(event, specName, currentId)) setModalOpen(true);
    };
    window.addEventListener(SIF_OPEN_SEND_EVENT, onRequest);
    return () => window.removeEventListener(SIF_OPEN_SEND_EVENT, onRequest);
  }, [canSend, specName, currentId]);

  if (!canSend) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-2 text-sm leading-6 font-medium hover:opacity-80 cursor-pointer h-10"
        style={{ padding: '0 12px', borderRadius: '8px', border: '1px solid hsl(var(--border-subtle))', color: 'hsl(var(--foreground))', background: 'hsl(var(--card))' }}
        data-testid="SendToSifButton__send"
      >
        {ui(labelKey)}
      </button>
      {modalOpen && (
        <SifSendingModal
          pendingTargets={pendingTargets}
          bodyKey={bodyKey}
          base={base}
          specName={specName}
          recordId={recordId}
          onSave={onSave}
          isDirty={isDirty}
          onClose={() => {
            setModalOpen(false);
            if (sentSuccessfully) {
              window.dispatchEvent(new CustomEvent(updateEventName, { detail: { invoiceId: recordId } }));
              setSentSuccessfully(false);
            }
          }}
          onAfterSend={(next) => {
            if (Object.values(next).some((r) => r?.ok)) setSentSuccessfully(true);
          }}
          data-testid="SifSendingModal__1d018f" />
      )}
    </>
  );
}
