import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { errorCodeLabelKey } from './invoiceInboxMessages.js';
import { resultState } from './invoiceInboxUploadResult.js';

const STATE_ICONS = {
  reading: { Icon: Loader2, className: 'animate-spin text-muted-foreground' },
  mixed: { Icon: Loader2, className: 'animate-spin text-muted-foreground' },
  done: { Icon: CheckCircle2, className: 'text-status-success-foreground' },
  doneWithErrors: { Icon: AlertCircle, className: 'text-destructive' },
};

/** The headline of the panel for its state. */
export function resultTitle(summary, ui) {
  const state = resultState(summary);
  const { total, read, failed, pending } = summary;
  if (state === 'reading') return ui('invoiceInboxResultReadingTitle', { done: total - pending, total });
  if (state === 'mixed') return ui('invoiceInboxResultMixed', { read, failed, pending });
  if (state === 'doneWithErrors') return ui('invoiceInboxResultDoneWithErrors', { read, failed });
  if (read === 0) return ui('invoiceInboxResultTitle');
  return ui(read === 1 ? 'invoiceInboxResultDoneOne' : 'invoiceInboxResultDoneMany', { count: read });
}

/** The line under the headline: keep working while reading, review them when all went well. */
export function resultHint(summary, ui) {
  const state = resultState(summary);
  if (state === 'reading' || state === 'mixed') return ui('invoiceInboxResultReadingHint');
  if (state === 'done' && summary.read > 0) return ui('invoiceInboxResultAllGoodHint');
  return null;
}

function DetailLines({ summary, ui }) {
  const lines = summary.reasons.map(({ code, count }) => ({
    key: code,
    text: ui('invoiceInboxResultReasonLine', { count, reason: ui(errorCodeLabelKey(code)) }),
    className: 'text-destructive',
    testId: `invoice-inbox-result-reason-${code}`,
  }));
  if (summary.handled) {
    lines.push({ key: 'handled', text: ui('invoiceInboxResultHandled', { count: summary.handled }), testId: 'invoice-inbox-result-handled' });
  }
  if (summary.gone) {
    lines.push({ key: 'gone', text: ui('invoiceInboxResultGone', { count: summary.gone }), testId: 'invoice-inbox-result-gone' });
  }
  if (!lines.length) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-xs">
      {lines.map((line) => (
        <li key={line.key} className={line.className ?? 'text-muted-foreground'} data-testid={line.testId}>{line.text}</li>
      ))}
    </ul>
  );
}

/**
 * Closes the panel: drops the finished documents from the record. Offered only once nothing is
 * still being read, so a document is never forgotten before its outcome is known.
 */
function DismissButton({ ui, onDismiss }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label={ui('close')}
      title={ui('close')}
      className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
      data-testid="invoice-inbox-result-dismiss"
    >
      <X className="h-4 w-4" aria-hidden="true" data-testid="X__6b19e6" />
    </button>
  );
}

function ResultLoadError({ ui, onRetry }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-2">
      <span className="flex-1 text-sm text-destructive" data-testid="invoice-inbox-result-title">
        {ui('invoiceInboxResultLoadError')}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} data-testid="invoice-inbox-result-retry">
        {ui('retry')}
      </Button>
    </div>
  );
}

/**
 * ETP-6049 — "Resultado de tus cargas": what became of the documents this browser uploaded, read
 * from the server, shown under the upload cards once delivery is over (the "Cargando X de N" tray
 * only shows while files are sent). Hidden when nothing is recorded.
 *
 * Counts: read, with error (one line per reason), still being read, already handled
 * (confirmed/discarded), no longer available. The user acts from the list's tabs (e.g. "Con
 * error"); the panel has no navigation of its own. The close X drops the finished documents from
 * the record (offered once nothing is being read). `aria-live="polite"`: the headline is
 * re-announced when the counts change.
 *
 * @param {object} props
 * @param {{ids: string[], summary: object, loadError: boolean, retry: Function, dismiss: Function}} props.result
 */
export default function InvoiceInboxUploadResult({ result }) {
  const ui = useUI();
  if (!result.ids.length) return null;
  const { summary } = result;
  const { Icon, className } = STATE_ICONS[resultState(summary)];
  const hint = resultHint(summary, ui);
  return (
    <section
      className="overflow-hidden rounded-xl border border-border"
      aria-live="polite"
      aria-atomic="false"
      aria-label={ui('invoiceInboxResultAria')}
      data-testid="invoice-inbox-result"
    >
      {result.loadError ? (
        <ResultLoadError ui={ui} onRetry={result.retry} data-testid="ResultLoadError__6b19e6" />
      ) : (
        <div className="flex items-start gap-3 p-2">
          <Icon
            className={`h-5 w-5 flex-none ${className}`}
            aria-hidden="true"
            data-testid="Icon__6b19e6" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold" data-testid="invoice-inbox-result-title">{resultTitle(summary, ui)}</div>
            {hint && <div className="text-xs text-muted-foreground" data-testid="invoice-inbox-result-hint">{hint}</div>}
            <DetailLines summary={summary} ui={ui} data-testid="DetailLines__6b19e6" />
          </div>
          {summary.pending === 0 && <DismissButton ui={ui} onDismiss={result.dismiss} data-testid="DismissButton__6b19e6" />}
        </div>
      )}
    </section>
  );
}
