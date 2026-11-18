import { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { Button } from '@/components/ui/button';
import {
  FILE_STATUSES,
  downloadRemittanceFile,
  fileActionErrorMessage,
  resolveLatestRemittanceFile,
} from './remittanceFileApi.js';

/**
 * ETP-6247 — «Descargar fichero» in the detail's top action bar (the `topbarSecondary` slot, left of
 * Reactivar / Guardar), an outline button with the download icon. Visible on a confirmed remittance
 * (PR, SB, CT, PT, CP, PP; the same rule as the row menu's item). It only downloads: the main SEPA file
 * is resolved like everywhere else (`resolveLatestRemittanceFile`: `fileReadiness.latestFile`, then the
 * newest `.xml` attachment) and saved with `downloadRemittanceFile`. A spinner shows while it runs; no
 * file and a failure toast their translated message.
 */
export default function RemittanceDownloadButton({ data, apiBaseUrl }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const rootApiFetch = useApiFetch(useMemo(() => getApiBase(), []));
  const [busy, setBusy] = useState(false);
  if (!data?.id || !FILE_STATUSES.has(data.remittanceStatus)) return null;

  const download = async () => {
    setBusy(true);
    try {
      const file = await resolveLatestRemittanceFile(apiFetch, rootApiFetch, data.id);
      if (!file) {
        toast.error(ui('remittanceFileNone'));
        return;
      }
      await downloadRemittanceFile(rootApiFetch, file);
    } catch (err) {
      toast.error(fileActionErrorMessage(err, ui, 'remittanceFileDownloadError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={download}
      disabled={busy}
      data-testid="remittance-file-download">
      {busy
        ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" data-testid="Loader2__download" />
        : <Download className="mr-1.5 h-4 w-4" aria-hidden="true" data-testid="Download__download" />}
      {ui('remittanceFileDownload')}
    </Button>
  );
}
