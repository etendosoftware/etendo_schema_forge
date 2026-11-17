import { forwardRef } from 'react';
import { Copy, Mail, Upload } from 'lucide-react';
import { useUI } from '@/i18n';
import { ACCEPT_ATTRIBUTE } from './invoiceInboxUploadPolicy.js';

const CARD_CLASS = 'flex min-w-0 items-center gap-3.5 rounded-xl p-2';
const ICON_BOX_CLASS = 'flex h-10 w-10 flex-none items-center justify-center rounded-[10px]';

/**
 * ETP-6049 — the hidden multi-file input behind "Cargar facturas" and the drop card. Rendered
 * once by the page; both triggers click it through the forwarded ref.
 */
export const InvoiceInboxFileInput = forwardRef(function InvoiceInboxFileInput({ onFiles }, ref) {
  return (
    <input
      ref={ref}
      type="file"
      multiple
      accept={ACCEPT_ATTRIBUTE}
      className="hidden"
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        // Reset so picking the same file again still fires a change.
        event.target.value = '';
        if (files.length) onFiles(files);
      }}
      data-testid="invoice-inbox-file-input"
    />
  );
});

/**
 * ETP-6049 — "Or forward them to…" card. A MOCKUP in this story: there is no inbound e-mail yet
 * (out of phase 1), so the address is a translated example and "Copiar" is disabled.
 */
function InvoiceInboxEmailCard() {
  const ui = useUI();
  const comingSoon = ui('comingSoon');
  return (
    <div className={`${CARD_CLASS} border border-border bg-muted/40`} data-testid="invoice-inbox-email-card">
      <span className={`${ICON_BOX_CLASS} border border-border bg-card text-muted-foreground`}>
        <Mail className="h-5 w-5" aria-hidden="true" data-testid="Mail__6da916" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{ui('invoiceInboxEmailLabel')}</div>
        <div className="truncate font-mono text-[13px] font-bold">{ui('invoiceInboxEmailExample')}</div>
      </div>
      {/* A disabled button gets no pointer events, so the tooltip lives on the wrapper. */}
      <span title={comingSoon} className="inline-flex">
        <button
          type="button"
          disabled
          aria-label={`${ui('copy')} — ${comingSoon}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="invoice-inbox-email-copy"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" data-testid="Copy__6da916" />
          {ui('copy')}
        </button>
      </span>
    </div>
  );
}

/**
 * ETP-6049 — the upload cards above the list: the drop / pick card and the e-mail mockup.
 *
 * @param {object} props
 * @param {() => void} props.onPick opens the file picker
 */
export default function InvoiceInboxDropZone({ onPick }) {
  const ui = useUI();
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
      <button
        type="button"
        onClick={onPick}
        className={`${CARD_CLASS} cursor-pointer border-[1.5px] border-dashed border-border bg-card text-left transition-colors hover:bg-muted/30`}
        data-testid="invoice-inbox-dropzone"
      >
        <span className={`${ICON_BOX_CLASS} bg-primary/10 text-primary`}>
          <Upload className="h-5 w-5" aria-hidden="true" data-testid="Upload__6da916" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">
            {ui('invoiceInboxDropTitle')}{' '}
            <span className="text-primary">{ui('invoiceInboxDropSelect')}</span>
          </span>
          <span className="block text-xs text-muted-foreground">{ui('invoiceInboxDropHint')}</span>
        </span>
      </button>
      <InvoiceInboxEmailCard data-testid="InvoiceInboxEmailCard__6da916" />
    </div>
  );
}
