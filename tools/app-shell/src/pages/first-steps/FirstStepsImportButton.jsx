import { useCallback, useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { ImportDialog } from '@etendosoftware/app-shell-core/components/import/ImportDialog.jsx';
import { useAuthOptional } from '@etendosoftware/app-shell-core/auth';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { useWindowImportDialog } from '@/components/contract-ui/useWindowImportDialog.js';
import { loadImportConfig } from '@/pages/first-steps/firstStepsImport.js';

/**
 * ETP-5190 — runs a window's REAL import from inside the checklist.
 *
 * "Carga masiva de productos" used to be a link to the product list, where the user then had
 * to find the import button themselves; the step is the import, so it opens the same
 * `ImportDialog` the list view opens, with the same descriptor, the same batch endpoint and
 * the same review queue — `useWindowImportDialog` is shared with `ListView` precisely so the
 * two can never diverge.
 *
 * Renders nothing when the window declares no import: a step that cannot act should not offer
 * a button that does nothing.
 */
export default function FirstStepsImportButton({ step, ui, disabled = false }) {
  const [open, setOpen] = useState(false);
  const token = useAuthOptional()?.token ?? null;
  const apiBaseUrl = getApiBase();
  // `undefined` = still loading, `null` = this window declares no import. The contract and the
  // descriptor are pulled in on demand so they stay out of the entry chunk; this component only
  // renders once its row is expanded, so the fetch starts when the user opens the step.
  const [importConfig, setImportConfig] = useState(undefined);
  useEffect(() => {
    let cancelled = false;
    loadImportConfig(step.importSpec).then((config) => {
      if (!cancelled) setImportConfig(config ?? null);
    });
    return () => { cancelled = true; };
  }, [step.importSpec]);

  const importDialogProps = useWindowImportDialog({ importConfig, apiBaseUrl, token });

  // Unlike the list view there is no grid behind this dialog to refresh, so a fully clean run
  // is the only thing that closes it — a run with failures keeps the review queue on screen.
  const handleImported = useCallback(({ failedCount }) => {
    if (failedCount === 0) setOpen(false);
  }, []);

  // Only a window that genuinely has no import hides the button; while it loads the button is
  // shown but inert, so the row does not visibly reflow under the user.
  if (importConfig === null) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || importConfig === undefined}
        className="flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium text-foreground cursor-pointer hover:bg-muted/50"
        data-testid={`first-steps-import-${step.id}`}
      >
        <Upload className="h-3.5 w-3.5" data-testid={`first-steps-import-icon-${step.id}`} />
        {ui('import')}
      </button>
      {open && importConfig && (
        <ImportDialog
          open={open}
          onOpenChange={setOpen}
          config={importConfig}
          {...importDialogProps}
          onImported={handleImported}
          data-testid={`first-steps-import-dialog-${step.id}`} />
      )}
    </>
  );
}
