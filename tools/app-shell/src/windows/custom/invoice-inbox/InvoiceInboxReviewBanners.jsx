import { useEffect, useRef } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { formatMoney } from './invoiceInboxMoney.js';
import { confirmFailedDetail, errorCodeLabelKey } from './invoiceInboxMessages.js';
import {
  computeTotals, currencyScale, isSettledStatus, reviewBanners, totalMismatch,
} from './invoiceInboxReviewModel.js';
import { ReviewBanner } from './InvoiceInboxReviewParts.jsx';
import InvoiceInboxInvoiceLink from './InvoiceInboxInvoiceLink.jsx';

const BLOCKER_LABEL_KEYS = Object.freeze({
  exchangeRate: ['invoiceInboxBlockerExchangeRateTitle', 'invoiceInboxBlockerExchangeRateBody'],
  vendorAddress: ['invoiceInboxBlockerVendorAddressTitle', 'invoiceInboxBlockerVendorAddressBody'],
});

/**
 * ETP-6050 F5 / F7 — the banners at the TOP of the form: confirmed (green; the title shows the invoice's document number),
 * unreadable (only while the document is untouched), another error code (foreign receiver,
 * service failure… reusing `errorCodeLabelKey`) and possible duplicate (invoice and/or other
 * inbox documents; never blocks, never on a confirmed / discarded document). Which ones show is
 * decided by `reviewBanners` (pure). The total mismatch is `InvoiceInboxReviewMismatchBanner`,
 * at the bottom.
 *
 * @param {{review: object}} props
 */
export default function InvoiceInboxReviewBanners({ review }) {
  const ui = useUI();
  const banners = reviewBanners(review);
  const header = review.document?.header;
  if (!banners.length) return null;
  return (
    <div className="flex flex-col gap-2.5" data-testid="invoice-inbox-review-banners">
      {banners.map((banner) => {
        switch (banner.kind) {
          case 'confirmed': {
            // The document NUMBER, not the DAL identifier ("no - date - amount"); the identifier only
            // when an older answer carries no `documentNo`.
            const doc = review.invoice?.documentNo ?? review.invoice?.identifier ?? '';
            return (
              <ReviewBanner
                key="confirmed"
                tone="success"
                testId="invoice-inbox-review-banner-confirmed"
                title={ui('invoiceInboxReviewConfirmedTitle', { doc })}
                data-testid="ReviewBanner__838958">
                {ui('invoiceInboxReviewConfirmedBody')}
                {review.invoice?.id && (
                  <InvoiceInboxInvoiceLink
                    invoiceId={review.invoice.id}
                    className="ml-1 font-medium underline"
                    testId="invoice-inbox-review-invoice-link"
                    data-testid="InvoiceInboxInvoiceLink__838958">
                    {ui('invoiceInboxReviewOpenInvoice', { doc })}
                  </InvoiceInboxInvoiceLink>
                )}
              </ReviewBanner>
            );
          }
          case 'unreadable':
            return (
              <ReviewBanner
                key="unreadable"
                tone="destructive"
                testId="invoice-inbox-review-banner-unreadable"
                title={ui('invoiceInboxReviewUnreadableTitle')}
                data-testid="ReviewBanner__838958">
                {ui('invoiceInboxReviewUnreadableBody')}
              </ReviewBanner>
            );
          case 'error':
            return (
              <ReviewBanner
                key="error"
                tone="destructive"
                testId={`invoice-inbox-review-banner-error-${banner.code}`}
                title={ui(errorCodeLabelKey(banner.code))}
                data-testid="ReviewBanner__838958" />
            );
          case 'confirmFailed':
            return (
              <ReviewBanner
                key="confirmFailed"
                tone="destructive"
                testId="invoice-inbox-review-banner-confirm-failed"
                title={ui(errorCodeLabelKey('CONFIRM_FAILED'))}
                data-testid="ReviewBanner__838958">
                {confirmFailedDetail(ui, banner.info, banner.detail) || ui('invoiceInboxConfirmFailedNoDetail')}
              </ReviewBanner>
            );
          case 'blocker': {
            const [titleKey, bodyKey] = BLOCKER_LABEL_KEYS[banner.blocker];
            return (
              <ReviewBanner
                key={`blocker-${banner.blocker}`}
                tone="destructive"
                testId={`invoice-inbox-review-banner-blocker-${banner.blocker}`}
                title={ui(titleKey)}
                data-testid="ReviewBanner__838958">
                {ui(bodyKey)}
              </ReviewBanner>
            );
          }
          case 'duplicate':
            return (
              <ReviewBanner
                key="duplicate"
                tone="warning"
                testId="invoice-inbox-review-banner-duplicate"
                title={ui('invoiceInboxReviewDuplicateTitle')}
                data-testid="ReviewBanner__838958">
                {ui('invoiceInboxReviewDuplicateBody', {
                  doc: banner.invoice.documentNo ?? '',
                  no: header?.documentNo ?? '',
                })}
              </ReviewBanner>
            );
          case 'duplicateInbox':
            return (
              <ReviewBanner
                key="duplicateInbox"
                tone="warning"
                testId="invoice-inbox-review-banner-duplicate-inbox"
                title={ui('invoiceInboxReviewDuplicateInboxTitle')}
                data-testid="ReviewBanner__838958">
                {ui('invoiceInboxReviewDuplicateInboxBody', {
                  files: banner.files.map((file) => file.fileName).filter(Boolean).join(', '),
                })}
              </ReviewBanner>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

/**
 * The "total does not match" banner (decision 4: non-blocking, only when `totalSource` is
 * `printed` and the lines add up to something else). It goes at the BOTTOM of the form, after the
 * totals card, and never on a confirmed / discarded document.
 *
 * @param {{review: object, currency: string}} props
 */
export function InvoiceInboxReviewMismatchBanner({ review, currency }) {
  const ui = useUI();
  if (isSettledStatus(review.status)) return null;
  const scale = currencyScale(review.currency);
  const mismatch = totalMismatch(review.document?.header, computeTotals(review.document?.lines, scale), scale);
  if (!mismatch) return null;
  return (
    <ReviewBanner
      tone="warning"
      testId="invoice-inbox-review-banner-mismatch"
      title={ui('invoiceInboxReviewMismatchTitle')}
      data-testid="ReviewBanner__838958">
      {ui('invoiceInboxReviewMismatchBody', {
        lines: formatMoney(currency, mismatch.lines, scale),
        doc: formatMoney(currency, mismatch.document, scale),
      })}
    </ReviewBanner>
  );
}

/**
 * ETP-6050 S2-D4 — the notice shown after the document was reloaded because it changed under the
 * editor (`stale_document`, `processing`, `not_editable`, `not_reviewable`): the unsaved local
 * edits were dropped. Dismissible; the text is the translated message of the refusal's code.
 *
 * @param {{noticeKey: string, onDismiss: () => void}} props
 */
export function InvoiceInboxReviewNotice({ noticeKey, onDismiss }) {
  const ui = useUI();
  return (
    <div className="relative" data-testid="invoice-inbox-review-notice-wrap">
      <ReviewBanner
        tone="warning"
        testId="invoice-inbox-review-notice"
        title={ui('invoiceInboxSaveReloadedTitle')}
        data-testid="ReviewBanner__notice">
        {ui(noticeKey)}
      </ReviewBanner>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={ui('close')}
        title={ui('close')}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-current opacity-70 hover:opacity-100"
        data-testid="invoice-inbox-review-notice-dismiss">
        <XIcon className="h-3.5 w-3.5" aria-hidden="true" data-testid="X__review-notice" />
      </button>
    </div>
  );
}

/**
 * ETP-6051 — a confirm refusal that retrying cannot fix (a duplicate invoice, a price list with tax
 * included, a missing exchange rate or vendor address, the plan quota…): a full-width banner at the
 * top of the form with its complete, wrapping text and no retry. Dismissible; it also goes away on
 * the next edit or confirm.
 *
 * @param {{refusalKey: string, onDismiss: () => void}} props
 */
export function InvoiceInboxReviewRefusal({ refusalKey, onDismiss }) {
  const ui = useUI();
  const ref = useRef(null);
  // The form pane scrolls: bring the cause into view even when the user was down in the lines.
  useEffect(() => { ref.current?.scrollIntoView?.({ block: 'nearest' }); }, []);
  return (
    <div ref={ref} className="relative" data-testid="invoice-inbox-review-refusal-wrap">
      <ReviewBanner
        tone="destructive"
        testId="invoice-inbox-review-refusal"
        title={ui('invoiceInboxConfirmRefusedTitle')}
        data-testid="ReviewBanner__refusal">
        <span className="pr-6">{ui(refusalKey)}</span>
      </ReviewBanner>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={ui('close')}
        title={ui('close')}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-current opacity-70 hover:opacity-100"
        data-testid="invoice-inbox-review-refusal-dismiss">
        <XIcon className="h-3.5 w-3.5" aria-hidden="true" data-testid="X__review-refusal" />
      </button>
    </div>
  );
}
