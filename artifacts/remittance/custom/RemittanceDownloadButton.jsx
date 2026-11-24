import { useMemo, useState } from 'react';
import { DownloadSimpleIcon, CircleNotchIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
  FILE_STATUSES,
  downloadRemittanceFile,
  fileActionErrorMessage,
  resolveLatestRemittanceFile,
} from './remittanceFileApi.js';

/**
 * ETP-6247 — «Descargar fichero» in the detail's top action bar (the `topbarSecondary` slot, left of
 * Reactivar / Guardar), an icon-only 40x40 square button with a tooltip, the same chrome as Copy link / Clone / Send (CopyRecordLinkButton). Visible on a confirmed remittance
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

  const label = ui('remittanceFileDownload');
  return (
    <TooltipProvider data-testid="TooltipProvider__remittance-download">
      <Tooltip delayDuration={150} data-testid="Tooltip__remittance-download">
        <TooltipTrigger asChild data-testid="TooltipTrigger__remittance-download">
          <button
            type="button"
            onClick={download}
            disabled={busy}
            aria-label={label}
            data-testid="remittance-file-download"
            className="h-10 w-10 flex items-center justify-center rounded-lg bg-card border border-[hsl(var(--border-control))] shadow-[0px_1px_2px_0px_hsl(var(--foreground))0D] text-[#828FA3] hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-60">
            {busy
              ? <CircleNotchIcon className="h-5 w-5 animate-spin" aria-hidden="true" data-testid="Loader2__download" />
              : <DownloadSimpleIcon className="h-5 w-5" aria-hidden="true" data-testid="Download__download" />}
          </button>
        </TooltipTrigger>
        <TooltipContent data-testid="TooltipContent__remittance-download">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
