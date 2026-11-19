import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/OAuth2ClientDialog';
import { InfoBanner } from '@/components/InfoBanner';
import { WarningIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { translateBackendError } from '@/lib/backendErrors.js';
import RemittanceConfirmDialog from './RemittanceConfirmDialog.jsx';
import RemittanceReturnDialog from './RemittanceReturnDialog.jsx';
import RemittanceCollectDialog from './RemittanceCollectDialog.jsx';
import RemittanceSentDialog from './RemittanceSentDialog.jsx';

/**
 * ETP-6148 — the window's `processConfirmModal` slot. DetailView routes a header process here
 * when its style is a danger one (`primary-danger`, «Reactivar») or when it declares
 * `confirmModal` (ETP-6247: «Confirmar», `processOverrides.confirm`; «Devolver», «Pasar a Cobrada» and
 * «Pasar a Enviada al banco»). «Confirmar» gets its own
 * dialog (RemittanceConfirmDialog), which runs the atomic `confirm` action itself, downloads the
 * SEPA file and refreshes through `onRefresh`. Reactivating deletes the payments the process created, so the
 * user confirms a translated warning first. Confirming runs the process through the generic
 * `hook.handleProcess` (`onConfirm`), which toasts, then re-reads the header and the lines.
 * `handleProcess` reports its own refusals; anything `onConfirm` still throws (an unexpected
 * failure) is shown here rather than left as an unhandled rejection — same wording path as the
 * detail kebab's actions (`translateBackendError`, falling back to `actionFailed`).
 */
export default function RemittanceProcessConfirmModal({ process, onConfirm, onClose, record, apiBaseUrl, onRefresh }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  if (process?.name === 'confirm') {
    return (
      <RemittanceConfirmDialog
        process={process}
        record={record}
        apiBaseUrl={apiBaseUrl}
        onRefresh={onRefresh}
        onClose={onClose}
        data-testid="RemittanceConfirmDialog__remittance" />
    );
  }
  if (process?.name === 'returnLines') {
    return (
      <RemittanceReturnDialog
        record={record}
        apiBaseUrl={apiBaseUrl}
        onRefresh={onRefresh}
        onClose={onClose}
        data-testid="RemittanceReturnDialog__remittance" />
    );
  }
  if (process?.name === 'markSent') {
    return (
      <RemittanceSentDialog
        record={record}
        apiBaseUrl={apiBaseUrl}
        onRefresh={onRefresh}
        onClose={onClose}
        data-testid="RemittanceSentDialog__remittance" />
    );
  }
  if (process?.name === 'markCollected') {
    return (
      <RemittanceCollectDialog
        record={record}
        apiBaseUrl={apiBaseUrl}
        onRefresh={onRefresh}
        onClose={onClose}
        data-testid="RemittanceCollectDialog__remittance" />
    );
  }
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
      data-testid="ConfirmDialog__remittance-process">
      {/* The bank already has the file of a remittance Enviada al banco (SB): say what editing it means. */}
      {isReactivate && record?.remittanceStatus === 'SB' && (
        <InfoBanner tone="warning" icon={WarningIcon} dismissible={false} data-testid="remittance-reactivate-sent-warning">
          {ui('remittanceReactivateSentWarning')}
        </InfoBanner>
      )}
    </ConfirmDialog>
  );
}
