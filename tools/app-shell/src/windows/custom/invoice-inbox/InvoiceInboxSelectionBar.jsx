import { Check, ClipboardCheck, Trash2 } from 'lucide-react';
import SelectionToolbar from '@/components/contract-ui/SelectionToolbar.jsx';
import { useUI } from '@/i18n';

const BAR_BUTTON_CLASS = 'inline-flex items-center gap-1.5 rounded-md px-3 py-[7px] text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';

function DisabledBarButton({ label, icon: Icon, testId, title }) {
  return (
    // A disabled button gets no pointer events, so the "coming soon" tooltip lives on the wrapper.
    <span title={title} className="inline-flex">
      <button
        type="button"
        disabled
        className={BAR_BUTTON_CLASS}
        style={{ color: 'hsl(var(--floating-toolbar-fg))' }}
        data-testid={testId}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" data-testid="Icon__ba835b" />
        {label}
      </button>
    </span>
  );
}

/** Discard of the selected rows: disabled while a discard batch runs (no double submit). */
function DiscardBarButton({ label, onDiscard, discarding }) {
  return (
    <button
      type="button"
      disabled={discarding}
      onClick={onDiscard}
      className={BAR_BUTTON_CLASS}
      style={{ color: 'hsl(var(--floating-toolbar-fg))' }}
      data-testid="invoice-inbox-bulk-discard"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" data-testid="Trash2__ba835b" />
      {label}
    </button>
  );
}

/**
 * ETP-6049 — the batch bar of the inbox. Discard opens the confirmation for the selected rows
 * (`onDiscard`); "Mark for review" and Confirm are shown DISABLED ("coming soon"): their logic
 * belongs to a later story (ETP-6051 for Confirm). Order, as in the design: Mark for review,
 * Discard, Confirm.
 */
export default function InvoiceInboxSelectionBar({ count, onClear, onDiscard, discarding = false }) {
  const ui = useUI();
  return (
    <SelectionToolbar
      visible={count > 0}
      onClose={onClear}
      closeTitle={ui('invoiceInboxClearSelection')}
      data-testid="invoice-inbox-selection-bar"
    >
      <span role="status" className="text-sm font-medium" data-testid="invoice-inbox-selection-count">
        {ui(count === 1 ? 'invoiceInboxSelectedOne' : 'invoiceInboxSelectedMany', { count })}
      </span>
      <span className="inline-flex items-center gap-1">
        <DisabledBarButton
          label={ui('invoiceInboxBulkMarkReview')}
          icon={ClipboardCheck}
          title={ui('comingSoon')}
          testId="invoice-inbox-bulk-mark-review"
          data-testid="DisabledBarButton__mr7c21" />
        <DiscardBarButton
          label={ui('invoiceInboxBulkDiscard')}
          onDiscard={onDiscard}
          discarding={discarding}
          data-testid="DiscardBarButton__ba835b" />
        <DisabledBarButton
          label={ui('invoiceInboxBulkConfirm')}
          icon={Check}
          title={ui('comingSoon')}
          testId="invoice-inbox-bulk-confirm"
          data-testid="DisabledBarButton__ba835b" />
      </span>
    </SelectionToolbar>
  );
}
