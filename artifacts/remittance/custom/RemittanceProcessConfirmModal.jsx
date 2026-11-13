import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/OAuth2ClientDialog';
import { useUI } from '@/i18n';
import { translateBackendError } from '@/lib/backendErrors.js';

/**
 * ETP-6148 — the window's `processConfirmModal` slot. DetailView routes a header process here
 * when its style is a danger one (`primary-danger`) — today only «Reactivar»
 * (`processOverrides.reactivate`). Reactivating deletes the payments the process created, so the
 * user confirms a translated warning first. Confirming runs the process through the generic
 * `hook.handleProcess` (`onConfirm`), which toasts, then re-reads the header and the lines.
 * `handleProcess` reports its own refusals; anything `onConfirm` still throws (an unexpected
 * failure) is shown here rather than left as an unhandled rejection — same wording path as the
 * detail kebab's actions (`translateBackendError`, falling back to `actionFailed`).
 */
export default function RemittanceProcessConfirmModal({ process, onConfirm, onClose }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const isReactivate = process?.name === 'reactivate' || process?.columnName === 'reactivate';
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose?.(); }}
      title={ui(isReactivate ? 'remittanceReactivateConfirmTitle' : 'confirm')}
      description={isReactivate ? ui('remittanceReactivateConfirmBody') : ''}
      confirmLabel={ui(isReactivate ? 'reactivate' : 'confirm')}
      cancelLabel={ui('cancel')}
      variant="destructive"
      loading={busy}
      onConfirm={async () => {
        setBusy(true);
        try {
          await onConfirm?.();
        } catch (err) {
          toast.error(translateBackendError(err?.message, ui, {
            messageKeys: err?.messageKeys,
            messageParams: err?.messageParams,
          }) || ui('actionFailed'));
        } finally {
          setBusy(false);
        }
      }}
      data-testid="ConfirmDialog__remittance-process" />
  );
}
