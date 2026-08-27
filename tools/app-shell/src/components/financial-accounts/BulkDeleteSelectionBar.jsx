import { Trash2 } from 'lucide-react';
import SelectionToolbar from '@/components/contract-ui/SelectionToolbar.jsx';
import { useUI } from '@/i18n';

/**
 * ETP-4656 / ETP-4972 — generic "N selected" bulk-delete affordance for the
 * Financial Accounts main list and its Movements/Statements tabs (none of
 * which use ListView, so they can't reach ListView's own selection bar).
 *
 * Originally an in-flow bar rendered above the tab's own toolbar — ETP-4972
 * live-QA caught this: every other list/lines selection bar in the app had
 * already been migrated to the floating, viewport-fixed `SelectionToolbar`,
 * but this standalone component was missed, so "Movimientos" alone still
 * showed its delete action pinned at the top instead of the floating pill.
 * Migrated to the same shell; the standalone cancel/X button is gone —
 * `SelectionToolbar` already provides one. Icon-only delete (no border, no
 * "(count)" label), matching the applied Figma instance for every other
 * SelectionToolbar consumer.
 *
 * Reuses the same `delete`/`selected` i18n keys as the grid bulk delete — no
 * new wording.
 *
 * @param {{ count: number, onDelete: () => void, onCancel: () => void, deleting?: boolean }} props
 */
export function BulkDeleteSelectionBar({ count, onDelete, onCancel, deleting = false }) {
  const ui = useUI();

  return (
    <SelectionToolbar
      visible={count > 0}
      onClose={onCancel}
      closeTitle={ui('close')}
      data-testid="bulk-delete-selection-bar">
      <span
        role="status"
        className="text-sm font-medium"
        data-testid="bulk-delete-selection-count">
        {ui('selected', { count })}
      </span>
      <button
        type="button"
        disabled={deleting}
        title={ui('delete')}
        aria-label={ui('delete')}
        onClick={onDelete}
        className="inline-flex items-center justify-center rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        data-testid="bulk-delete-selection-trigger">
        <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__bulkbar" />
      </button>
    </SelectionToolbar>
  );
}
