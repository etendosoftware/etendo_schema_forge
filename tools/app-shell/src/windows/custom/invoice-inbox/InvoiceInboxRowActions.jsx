import { IconicDotsVerticalIcon, IconicEditIcon, IconicTrashIcon } from '@/components/ui/custom-icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ROW_ACTION_BUTTON_DESTRUCTIVE, ROW_ACTION_BUTTON_NEUTRAL } from '@/components/contract-ui/rowVisuals.js';
import { useUI } from '@/i18n';
import { isProcessingRow, isSelectableRow } from './invoiceInboxFilters.js';

/** Buttons the widest row shows (edit, kebab, trash): DataTable sizes the reserved cell with it. */
export const INVOICE_INBOX_ROW_ACTION_COUNT = 3;

/**
 * Same placement as the canonical band (`RowQuickActions`, `AccountRowActions`): absolute inside
 * DataTable's sticky quick-actions cell, hidden at rest, shown on row hover or keyboard focus. The
 * cell paints the fade itself for a custom `render`, so this container has no background.
 */
const ACTIONS_CLASS = 'absolute right-0 inset-y-0 z-10 flex h-full flex-row items-center justify-end gap-0.5 px-3 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100';
const INERT_CLASS = 'cursor-not-allowed opacity-50';

function stop(event) {
  event.stopPropagation();
}

/** A button with a Radix tooltip (it also opens on keyboard focus). */
function ActionButton({ label, tooltip, className, onClick, inert = false, testId, children }) {
  return (
    <Tooltip delayDuration={0} data-testid="Tooltip__invoice-inbox-row">
      <TooltipTrigger asChild data-testid="TooltipTrigger__invoice-inbox-row">
        <button
          type="button"
          // `aria-disabled`, not `disabled`: a disabled button gets no pointer events, and the
          // "coming soon" tooltip must still open.
          aria-disabled={inert || undefined}
          aria-label={label}
          className={inert ? `${className} ${INERT_CLASS}` : className}
          onClick={(event) => { stop(event); if (!inert) onClick?.(); }}
          data-testid={testId}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent data-testid="TooltipContent__invoice-inbox-row">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * ETP-6049 — the hover actions of an inbox row, rendered through DataTable's `rowQuickActions`
 * custom `render` slot (the slot `AccountRowActions` uses), with the shared row-action visuals
 * (`rowVisuals.js`) and Iconic icons of `RowQuickActions`. The canonical `RowQuickActions` cannot
 * express this row: its Edit always runs `onEdit` under an "Edit" title, its kebab only shows
 * with menu items and opens a menu, and its trash is "Delete".
 *
 * - Edit (pencil): shown, inert, "coming soon" — it will open the review panel (ETP-6050).
 * - More (kebab): shown, inert, "coming soon" — confirm from here arrives with ETP-6051.
 * - Discard (red trash): only on rows that can be discarded (`isSelectableRow`: PENDING_REVIEW,
 *   ERROR, READY); opens the same confirmation as the batch bar, for this row.
 * - PROCESSING rows show no action.
 */
export default function InvoiceInboxRowActions({ row, onDiscard }) {
  const ui = useUI();
  if (isProcessingRow(row)) return null;
  const soon = (key) => ui('invoiceInboxRowActionSoon', { action: ui(key) });
  const discardLabel = ui('invoiceInboxBulkDiscard');
  return (
    <TooltipProvider data-testid="TooltipProvider__invoice-inbox-row">
      <div className={ACTIONS_CLASS} onClick={stop} data-testid={`invoice-inbox-row-actions-${row.id}`}>
        <ActionButton
          label={ui('quickAction.edit')}
          tooltip={soon('quickAction.edit')}
          className={ROW_ACTION_BUTTON_NEUTRAL}
          inert
          testId={`invoice-inbox-row-edit-${row.id}`}
          data-testid="ActionButton__invoice-inbox-row">
          <IconicEditIcon className="h-5 w-5" data-testid="IconicEditIcon__invoice-inbox-row" />
        </ActionButton>
        <ActionButton
          label={ui('quickAction.more')}
          tooltip={soon('quickAction.more')}
          className={ROW_ACTION_BUTTON_NEUTRAL}
          inert
          testId={`invoice-inbox-row-more-${row.id}`}
          data-testid="ActionButton__invoice-inbox-row">
          <IconicDotsVerticalIcon className="h-5 w-5" data-testid="IconicDotsVerticalIcon__invoice-inbox-row" />
        </ActionButton>
        {isSelectableRow(row) && (
          <ActionButton
            label={discardLabel}
            tooltip={discardLabel}
            className={ROW_ACTION_BUTTON_DESTRUCTIVE}
            onClick={() => onDiscard?.(row)}
            testId={`invoice-inbox-row-discard-${row.id}`}
            data-testid="ActionButton__invoice-inbox-row">
            <IconicTrashIcon className="h-5 w-5" data-testid="IconicTrashIcon__invoice-inbox-row" />
          </ActionButton>
        )}
      </div>
    </TooltipProvider>
  );
}
