import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';

/**
 * ETP-4656 — small, generic "N selected" bar with a "Delete selected" trigger
 * and a cancel/clear button, shown above a table/list in place of its normal
 * toolbar while a multi-select bulk-delete selection is active. Mirrors
 * ListView's selection-bar swap (filter bar ↔ selection bar) but as a
 * standalone component so the Financial Accounts main list and its
 * Movements/Statements tabs (none of which use ListView) can reuse it instead
 * of re-implementing the same count+actions row three times.
 *
 * Reuses the same `bulkDeleteSelected`/`selected` i18n keys as the grid bulk
 * delete — no new wording.
 *
 * @param {{ count: number, onDelete: () => void, onCancel: () => void, deleting?: boolean }} props
 */
export function BulkDeleteSelectionBar({ count, onDelete, onCancel, deleting = false }) {
  const ui = useUI();
  if (!count) return null;

  return (
    <div
      className="flex h-10 items-center justify-between gap-2.5"
      data-testid="bulk-delete-selection-bar">
      <span
        role="status"
        className="text-sm font-semibold text-[hsl(var(--foreground))]"
        data-testid="bulk-delete-selection-count">
        {ui('selected', { count })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={deleting}
          data-testid="bulk-delete-selection-cancel">
          <X className="h-4 w-4" data-testid="X__bulkbar" />
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="gap-1.5"
          onClick={onDelete}
          disabled={deleting}
          data-testid="bulk-delete-selection-trigger">
          <Trash2 className="h-4 w-4" data-testid="Trash2__bulkbar" />
          {ui('bulkDeleteSelected')} ({count})
        </Button>
      </div>
    </div>
  );
}
