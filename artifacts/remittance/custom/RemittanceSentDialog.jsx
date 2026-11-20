import { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import ActionChoiceModal from '@/components/contract-ui/ActionChoiceModal.jsx';
import { fileActionErrorMessage, markRemittanceSent } from './remittanceFileApi.js';
import RemittanceStatusChange from './RemittanceStatusChange.jsx';

/**
 * ETP-6247 — «Pasar a Enviada al banco» (`markSent`, `confirmModal`, routed by
 * RemittanceProcessConfirmModal). Built on ActionChoiceModal with no options, like the collect
 * dialog: the status change as two chips («Pendiente de envío → Enviada al banco») and one sentence
 * of what it does (informational: nothing is created or settled). It posts the action itself;
 * success toasts, refreshes and closes, a refusal toasts (translated) and keeps the dialog open.
 */
export default function RemittanceSentDialog({ record, apiBaseUrl, onRefresh, onClose }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [busy, setBusy] = useState(false);

  const handleSent = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await markRemittanceSent(apiFetch, record?.id);
      toast.success(ui('remittanceSentSuccess'));
      onRefresh?.();
      onClose?.();
    } catch (err) {
      toast.error(fileActionErrorMessage(err, ui, 'remittanceMarkSentError'));
      setBusy(false);
    }
  };

  const content = (
    <ActionChoiceModal
      title={ui('remittanceSentTitle')}
      options={[]}
      onCancel={() => { if (!busy) onClose?.(); }}
      onContinue={handleSent}
      loading={busy}
      primaryLabel={ui('remittanceAdvanceToSent')}
      loadingLabel={ui('remittanceAdvanceToSent')}
      testId="remittance-sent-dialog"
      data-testid="ActionChoiceModal__remittance-sent">
      <div className="flex flex-col gap-5">
        <RemittanceStatusChange from="PR" to="SB" data-testid="RemittanceStatusChange__sent" />
        <p className="m-0 text-center text-sm text-[hsl(var(--muted-foreground))]" data-testid="remittance-sent-effect">
          {ui('remittanceSentEffect')}
        </p>
      </div>
    </ActionChoiceModal>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
