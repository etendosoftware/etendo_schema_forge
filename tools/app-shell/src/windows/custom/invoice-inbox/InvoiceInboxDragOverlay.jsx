import { Upload } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * ETP-6049 — "Drop to upload the invoices", over the whole inbox while files are dragged over it.
 * `pointer-events-none`: the drop lands on the container underneath, which owns the handlers.
 */
export default function InvoiceInboxDragOverlay({ visible }) {
  const ui = useUI();
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]"
      data-testid="invoice-inbox-drag-overlay"
    >
      <Upload
        className="h-8 w-8 text-primary"
        aria-hidden="true"
        data-testid="Upload__a11e06" />
      <div className="text-lg font-bold text-foreground">{ui('invoiceInboxDropOverlay')}</div>
      <div className="text-[13px] text-muted-foreground">{ui('invoiceInboxDropOverlayHint')}</div>
    </div>
  );
}
