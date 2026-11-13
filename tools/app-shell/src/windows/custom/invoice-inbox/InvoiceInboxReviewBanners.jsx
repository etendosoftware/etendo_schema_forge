import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { errorCodeLabelKey } from './invoiceInboxMessages.js';
import {
  computeTotals, isSettledStatus, reviewBanners, totalMismatch,
} from './invoiceInboxReviewModel.js';
import { ReviewBanner } from './InvoiceInboxReviewParts.jsx';

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
  const mismatch = totalMismatch(review.document?.header, computeTotals(review.document?.lines));
  if (!mismatch) return null;
  return (
    <ReviewBanner
      tone="warning"
      testId="invoice-inbox-review-banner-mismatch"
      title={ui('invoiceInboxReviewMismatchTitle')}
      data-testid="ReviewBanner__838958">
      {ui('invoiceInboxReviewMismatchBody', {
        lines: formatCurrency(currency, mismatch.lines),
        doc: formatCurrency(currency, mismatch.document),
      })}
    </ReviewBanner>
  );
}
