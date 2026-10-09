import { useState } from 'react';
import { useUI } from '@/i18n';
import { useInvoiceSifSending } from './useInvoiceSifSending.js';
import SifSendingModal from './SifSendingModal.jsx';

export default function SendToSifButton({ data, recordId, apiBaseUrl, status, onSave, isDirty, windowReadOnly }) {
  const ui = useUI();
  const [modalOpen, setModalOpen] = useState(false);
  const [sentSuccessfully, setSentSuccessfully] = useState(false);

  // ETP-5087: fiscal config keyed by the INVOICE's own org — see useInvoiceSifSending.js.
  const { specName, pendingTargets, hasPendingTargets, labelKey, bodyKey, base } =
    useInvoiceSifSending({ data, apiBaseUrl });
  const updateEventName = `${specName}:invoice-updated`;
  // ETP-5205 hides the button under the Solo Lectura tier — that is `windowReadOnly`.
  // ETP-5700: it used to read `isDocumentReadOnly`, which DetailView ALSO sets for every
  // processed document (lockWhenProcessed), i.e. for every completed invoice — the only
  // state in which sending is possible — so the button never showed where it applies.
  const canSend = status === 'CO' && hasPendingTargets && !windowReadOnly;

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
