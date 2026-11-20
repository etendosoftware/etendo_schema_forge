import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { ConfirmDialog } from '@/components/OAuth2ClientDialog';
import {
  downloadRemittanceFile,
  fileActionErrorMessage,
  regenerateRemittanceFile,
  resolveLatestRemittanceFile,
} from './remittanceFileApi.js';

/**
 * ETP-6247 — «Regenerar fichero» (from the detail kebab, only on PR and SB): a simple confirmation that
 * says a new file is created and becomes the main one (the previous stays in the attachments; a bank may
 * flag the new one as a duplicate), then posts `generateFile` and downloads the new file. With no file at
 * all yet (a remittance created and processed in Classic) the same call GENERATES the first one, and the
 * words say so: the dialog looks the file up when it opens. A refusal (for example 422
 * `ETGO_RemittanceFileHasReturns`) is toasted translated and the dialog stays open.
 */
export default function RemittanceRegenerateDialog({ record, apiBaseUrl, onRefresh, onClose }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const rootApiFetch = useApiFetch(useMemo(() => getApiBase(), []));
  const [hasFile, setHasFile] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveLatestRemittanceFile(apiFetch, rootApiFetch, record?.id).then((file) => { if (!cancelled) setHasFile(Boolean(file)); });
    return () => { cancelled = true; };
  }, [apiFetch, rootApiFetch, record?.id]);

  const verb = hasFile ? 'Regenerate' : 'Generate';
  const run = async () => {
    setBusy(true);
    try {
      const result = await regenerateRemittanceFile(apiFetch, record.id);
      if (result.attachmentId) {
        await downloadRemittanceFile(rootApiFetch, { attachmentId: result.attachmentId, fileName: result.fileName })
          .catch(() => { toast.error(ui('remittanceFileDownloadError')); });
      }
      toast.success(ui(`remittanceFile${verb}d`, { fileName: result.fileName ?? '' }));
      onRefresh?.();
      onClose?.();
    } catch (err) {
      toast.error(fileActionErrorMessage(err, ui, `remittanceFile${verb}Error`));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose?.(); }}
      title={ui(`remittanceFile${verb}ConfirmTitle`)}
      description={ui(`remittanceFile${verb}ConfirmBody`)}
      confirmLabel={ui(`remittanceFile${verb}`)}
      cancelLabel={ui('cancel')}
      loading={busy}
      onConfirm={run}
      data-testid="ConfirmDialog__remittance-regenerate" />
  );
}
