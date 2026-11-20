import { useCallback, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CircleNotchIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetDescription, SheetOverlay, SheetPortal,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { isReviewReadOnly } from './invoiceInboxReviewModel.js';
import { useInvoiceInboxReviewEditor } from './useInvoiceInboxReviewEditor.js';
import InvoiceInboxReviewHeader from './InvoiceInboxReviewHeader.jsx';
import InvoiceInboxReviewSaveStatus from './InvoiceInboxReviewSaveStatus.jsx';
import InvoiceInboxReviewViewer from './InvoiceInboxReviewViewer.jsx';
import InvoiceInboxReviewForm from './InvoiceInboxReviewForm.jsx';
import InvoiceInboxReviewFooter from './InvoiceInboxReviewFooter.jsx';

/**
 * The shell of the review panel (the design's drawer), flush to the right edge and the full
 * viewport height: width `min(1280px, 100vw - 48px)`, 16px radius on the left corners, a 260ms
 * slide-in, over a veil of `rgba(27, 26, 31, .45)` with a 200ms fade. Built from the shared
 * `Sheet` pieces (root, portal, overlay, title, close) with the Radix content directly, because
 * `SheetContent` always draws its own absolute close button and its fixed overlay tint; the
 * close X lives in the header row instead. Used only by this window.
 */
const VEIL_CLASS = 'bg-[rgba(27,26,31,.45)]';
const DRAWER_CLASS = [
  'fixed inset-y-0 right-0 z-50 flex h-full w-[min(1280px,calc(100vw-48px))] flex-col',
  'overflow-hidden rounded-l-2xl bg-card shadow-2xl outline-none',
  'data-[state=open]:[animation:slide-in-from-right_260ms_ease-out]',
  'data-[state=closed]:[animation:slide-out-to-right_200ms_ease-in_forwards]',
].join(' ');
/** The form pane: `min(560px, 55%)`, never under 420px (nor wider than the drawer: a 420px viewport leaves a 372px drawer). */
const FORM_PANE_CLASS = 'flex w-[min(560px,55%)] min-w-[min(420px,100%)] flex-none flex-col border-l border-border bg-card';

function FormSkeleton() {
  return (
    <div className="space-y-4" data-testid="invoice-inbox-review-loading" aria-busy="true">
      <Skeleton className="h-16 w-full" data-testid="Skeleton__review-1" />
      <Skeleton className="h-24 w-full" data-testid="Skeleton__review-2" />
      <Skeleton className="h-40 w-full" data-testid="Skeleton__review-3" />
    </div>
  );
}

function ReviewError({ errorKey, errorText, onRetry }) {
  const ui = useUI();
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-[var(--status-destructive-bg)] p-4 text-sm text-destructive"
      role="alert"
      data-testid="invoice-inbox-review-error">
      <p data-testid="invoice-inbox-review-error-text">{errorText ?? ui(errorKey)}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} data-testid="invoice-inbox-review-retry">
        {ui('retry')}
      </Button>
    </div>
  );
}

/**
 * ETP-6050 F3 — the review panel: a drawer on the shared `Sheet` pieces (see `DRAWER_CLASS`) with
 * the original document on the left (the remaining width) and the form on the right
 * (`min(560px, 55%)`, own scroll and a fixed footer). It closes on an outside click, on the X of
 * its header and on Escape (Radix defaults).
 *
 * `row` is the list row of the open document (its file name and status fill the header while the
 * review read is in flight); the read and the edits are `useInvoiceInboxReviewEditor` (S2: autosave
 * over the `apply` action). The form is editable unless the document is not (`editable: false`:
 * confirmed, discarded, foreign receiver); the viewer has no write operations. ETP-6051: "Confirmar
 * factura" runs the editor's `confirm` and hands the answer to the page (`onConfirmed(result, document)`),
 * which moves to the next pending document or closes the panel; without `onConfirmed` the button stays
 * the disabled "Próximamente" one. Closing, moving to another document and discarding first wait for
 * the pending saves (`flush`) and stay put when one failed. Discard goes through the page's
 * ETP-6049 flow (`onDiscard`).
 *
 * @param {{id: string|null, row: object|null, nav: object, apiFetch: Function, apiBaseUrl: string,
 *   token?: string|null, onClose: () => void, onDiscard: (row: object) => void,
 *   discarding?: boolean, onConfirmed?: (result: object, document: object) => void}} props `nav` is the object `useInvoiceInboxReviewNav` returns
 */
export default function InvoiceInboxReviewDrawer({
  id, row, nav, apiFetch, apiBaseUrl, token = null, onClose, onDiscard, discarding = false, onConfirmed = null,
}) {
  const ui = useUI();
  const orgCurrency = useCurrency();
  const editor = useInvoiceInboxReviewEditor(apiFetch, id);
  const { review, loading, errorKey, errorText, reload, flush } = editor;
  const open = Boolean(id);
  // Closing, moving on and discarding wait for the saves; a failed save keeps the panel where it is.
  const closingRef = useRef(false);
  const requestClose = useCallback(async () => {
    // A confirm in flight cannot be left: its answer decides where the panel goes next.
    if (closingRef.current || editor.confirming) return;
    closingRef.current = true;
    try {
      if (await flush()) onClose();
    } finally {
      closingRef.current = false;
    }
  }, [flush, onClose, editor.confirming]);
  const goPrev = useCallback(async () => { if (!editor.confirming && (await flush())) nav.goPrev(); }, [flush, nav, editor.confirming]);
  const goNext = useCallback(async () => { if (!editor.confirming && (await flush())) nav.goNext(); }, [flush, nav, editor.confirming]);
  const discard = useCallback(async () => { if (!editor.confirming && (await flush())) onDiscard(review ?? row); }, [flush, onDiscard, review, row, editor.confirming]);
  const confirmEditor = editor.confirm;
  const confirm = useCallback(async () => {
    const result = await confirmEditor();
    if (result) onConfirmed?.(result, review ?? row);
  }, [confirmEditor, onConfirmed, review, row]);
  const headerDocument = review ?? row ?? {};
  const currency = review?.currency?.isoCode ?? orgCurrency;
  const locked = review ? isReviewReadOnly(review, false) : false;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => { if (!next) requestClose(); }}
      data-testid="Sheet__invoice-inbox-review">
      <SheetPortal data-testid="SheetPortal__invoice-inbox-review">
        <SheetOverlay className={VEIL_CLASS} data-testid="invoice-inbox-review-veil" />
        <DialogPrimitive.Content
          className={DRAWER_CLASS}
          onCloseAutoFocus={(event) => { event.preventDefault(); nav.restoreFocus(); }}
          data-testid="invoice-inbox-review-drawer">
        <SheetDescription className="sr-only" data-testid="SheetDescription__b26584">{ui('invoiceInboxReviewAria')}</SheetDescription>
        <InvoiceInboxReviewHeader
          document={headerDocument}
          position={nav.position}
          total={nav.total}
          canPrev={nav.canPrev && !editor.confirming}
          canNext={nav.canNext && !nav.advancing && !editor.confirming}
          onPrev={goPrev}
          onNext={goNext}
          saveStatus={<InvoiceInboxReviewSaveStatus save={editor.save} onRetry={editor.retry} data-testid="InvoiceInboxReviewSaveStatus__drawer" />}
          data-testid="InvoiceInboxReviewHeader__drawer" />
        <div className="flex min-h-0 flex-1">
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            style={{ backgroundColor: 'hsl(var(--border-subtle))' }}
            data-testid="invoice-inbox-review-left">
            {id && (
              <InvoiceInboxReviewViewer
                key={id}
                documentId={id}
                fileName={headerDocument.fileName}
                token={token}
                apiBaseUrl={apiBaseUrl}
                data-testid="InvoiceInboxReviewViewer__drawer" />
            )}
          </div>
          <div className={FORM_PANE_CLASS} data-testid="invoice-inbox-review-right">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-6 pt-[18px]" data-testid="invoice-inbox-review-scroll">
              {loading && !review && <FormSkeleton data-testid="FormSkeleton__drawer" />}
              {!loading && !review && (errorKey || errorText) && (
                <ReviewError
                  errorKey={errorKey}
                  errorText={errorText}
                  onRetry={reload}
                  data-testid="ReviewError__drawer" />
              )}
              {review && (
                <InvoiceInboxReviewForm
                  key={review.id}
                  review={review}
                  currency={currency}
                  readOnly={locked}
                  locked={locked}
                  settled={locked}
                  editor={editor}
                  apiBaseUrl={apiBaseUrl}
                  data-testid="InvoiceInboxReviewForm__drawer" />
              )}
              {nav.advancing && (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" data-testid="invoice-inbox-review-advancing">
                  <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" data-testid="Loader2__review-advancing" />
                  {ui('invoiceInboxReviewLoadingNext')}
                </p>
              )}
            </div>
            {review && (
              <InvoiceInboxReviewFooter
                review={review}
                locked={locked}
                onDiscard={discard}
                discarding={discarding}
                onMarkReviewed={editor.markReviewed}
                onConfirm={onConfirmed ? confirm : null}
                saving={editor.saving}
                marking={editor.marking}
                confirming={editor.confirming}
                data-testid="InvoiceInboxReviewFooter__drawer" />
            )}
          </div>
        </div>
        </DialogPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
