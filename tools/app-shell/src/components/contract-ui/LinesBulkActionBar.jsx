import React from 'react';
import { Trash2 } from 'lucide-react';
import { isBulkDeleteBarVisible, getDeleteChildButtonLabel } from './detailViewHelpers.jsx';
import { deleteSelectedChildRows, toastBatchDeleteOutcome } from '@/lib/batchDelete.js';
import { toast } from 'sonner';

export function LinesBulkActionBar({
  linesLayout,
  api,
  detailEntity,
  isDocumentReadOnly,
  selectedChildRows,
  detailProcesses,
  ui,
  executingDetailProcess,
  setDetailParamDialogProcess,
  executeDetailProcessImpl,
  detailProcessDeps,
  tMenu,
  deletingChildren,
  setDeletingChildren,
  confirmDelete,
  apiBaseUrl,
  hook,
  selectedLine,
  setSelectedLine,
  setSelectedChildRows,
}) {
  return (
    <div
      data-testid="detail-bulk-action-bar"
      className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 mb-2 rounded-lg bg-muted border border-border/40 shadow-sm">
      <span className="text-sm font-medium text-foreground">
        {ui('selected', { count: selectedChildRows.length })}
      </span>
      <div className="flex items-center gap-2">
        {detailProcesses.map(p => (
          <button
            key={p.name}
            disabled={executingDetailProcess}
            onClick={() => {
              if (p.params?.some(param => !param.hidden)) {
                setDetailParamDialogProcess({ ...p, _rows: [...selectedChildRows] });
              } else {
                executeDetailProcessImpl(p, {}, undefined, detailProcessDeps);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-primary text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
            data-testid="Button__detail-process"
          >
            {executingDetailProcess ? ui('loading') : (tMenu(p.label) || p.label)}
          </button>
        ))}
        {isBulkDeleteBarVisible(linesLayout, api, detailEntity, isDocumentReadOnly, selectedChildRows) && (
          <button
            disabled={deletingChildren}
            onClick={async () => {
              if (!(await confirmDelete())) return;
              setDeletingChildren(true);
              try {
                // ETP-4656 — shared triage + single-toast-per-outcome (see
                // batchDelete.js); replaces the old two-independent-if
                // (recordsDeleted + recordsCouldNotBeDeleted) stacked-toast pattern.
                const { succeeded, failed } = await deleteSelectedChildRows({
                  selectedChildRows, api, detailEntity, apiBaseUrl,
                });
                for (const row of succeeded) {
                  hook.handleDeleteChild(row.id);
                  if (selectedLine?.id === row.id) setSelectedLine(null);
                }
                setSelectedChildRows([]);
                toastBatchDeleteOutcome(ui, { succeeded, failed, total: selectedChildRows.length });
              } catch (err) {
                toast.error(err.message || ui('networkError'));
              } finally {
                setDeletingChildren(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
            data-testid="detail-bulk-delete-button"
          >
            <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__fa3275" />
            {getDeleteChildButtonLabel(deletingChildren, ui)}
          </button>
        )}
      </div>
    </div>
  );
}

export default LinesBulkActionBar;
