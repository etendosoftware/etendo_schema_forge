import { CheckIcon, CircleNotchIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';

/**
 * ETP-6050 S2 (F4) — the save indicator of the drawer header, rendered inside its `aria-live`
 * slot: "Guardando…" while a write is open, "Guardado" for two seconds after it lands, and the
 * reason (translated by the code of the refusal, or the already translated text of a network
 * error) with a retry button when it failed. Nothing while idle.
 *
 * @param {{save: {status: 'idle'|'saving'|'saved'|'error', errorKey: string|null,
 *   errorText: string|null}, onRetry: () => void}} props
 */
export default function InvoiceInboxReviewSaveStatus({ save, onRetry }) {
  const ui = useUI();
  if (save.status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5" data-state="saving" data-testid="invoice-inbox-review-save-state">
        <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" data-testid="Loader2__review-saving" />
        {ui('invoiceInboxSaveSaving')}
      </span>
    );
  }
  if (save.status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5" data-state="saved" data-testid="invoice-inbox-review-save-state">
        <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" data-testid="Check__review-saved" />
        {ui('invoiceInboxSaveSaved')}
      </span>
    );
  }
  if (save.status === 'error') {
    return (
      <span className="inline-flex min-w-0 items-center gap-2 text-destructive" data-state="error" data-testid="invoice-inbox-review-save-state">
        <span className="max-w-[320px] truncate" title={save.errorText ?? ui(save.errorKey)} data-testid="invoice-inbox-review-save-error">
          {save.errorText ?? ui(save.errorKey)}
        </span>
        {/* A refused permission is not transient: retrying would only be refused again. */}
        {save.code !== 'access_denied' && (
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold underline underline-offset-2"
          data-testid="invoice-inbox-review-save-retry">
          {ui('retry')}
        </button>
        )}
      </span>
    );
  }
  return null;
}
