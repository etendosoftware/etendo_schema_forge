import { useLocaleSwitch, useUI } from '@/i18n';
import { CurrencyRatePicker } from '@/components/contract-ui/CurrencyRatePicker.jsx';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { missingSet } from './invoiceInboxReviewModel.js';
import { DATE_FIELD_ICON, ReviewField, ReviewTag, SectionTitle } from './InvoiceInboxReviewParts.jsx';
import InvoiceInboxReviewBanners, { InvoiceInboxReviewMismatchBanner } from './InvoiceInboxReviewBanners.jsx';
import InvoiceInboxReviewVendor from './InvoiceInboxReviewVendor.jsx';
import InvoiceInboxReviewLines from './InvoiceInboxReviewLines.jsx';
import InvoiceInboxReviewTotals from './InvoiceInboxReviewTotals.jsx';

/**
 * The currency of the invoice, read only, through the same `CurrencyRatePicker` the purchase and
 * sales documents use, so it shows "EUR — 1,00" exactly like them. The invoice is created in the
 * organization's currency (decision 1), so the rate is 1 (no conversion) and there is no
 * `apiBaseUrl`: the picker fetches no currency options (the spec has no `currencyOptions` action).
 */
function CurrencyField({ review, currency }) {
  const ui = useUI();
  return (
    <CurrencyRatePicker
      field={{ key: 'currency', id: 'invoice-inbox-currency' }}
      value={review.currency?.id}
      displayValue={review.currency?.isoCode ?? currency}
      formData={{ eTGOCurrencyRate: 1 }}
      resolvedLabel={ui('invoiceInboxReviewFieldCurrency')}
      isReadOnly
      data-testid="CurrencyRatePicker__review" />
  );
}

/** "Cabecera": invoice number and date (2 columns), then the currency (read only, decision 1). */
function HeaderSection({ review, currency, missing, readOnly, locked, locale }) {
  const ui = useUI();
  const header = review.document?.header;
  const dateMissing = missing.has('invoiceDate');
  const date = header?.invoiceDate
    ? formatCalendarDate(header.invoiceDate, locale)
    : (header?.invoiceDateRaw ?? '');
  return (
    <section className="flex flex-col gap-3" data-testid="invoice-inbox-review-header-section">
      <SectionTitle
        testId="invoice-inbox-review-header-title"
        data-testid="SectionTitle__fd4b42">{ui('invoiceInboxReviewSectionHeader')}</SectionTitle>
      <div className="grid grid-cols-2 gap-3.5">
        <ReviewField
          label={ui('invoiceInboxReviewFieldInvoiceNo')}
          value={header?.documentNo}
          readOnly={readOnly}
          disabled={locked}
          testId="invoice-inbox-review-invoice-no"
          data-testid="ReviewField__fd4b42" />
        <ReviewField
          label={ui('invoiceInboxReviewFieldInvoiceDate')}
          value={date}
          readOnly={readOnly}
          disabled={locked}
          required
          icon={DATE_FIELD_ICON}
          invalid={dateMissing}
          tag={dateMissing
            ? <ReviewTag
            tone="warning"
            label={ui('invoiceInboxReviewReviewTag')}
            testId="invoice-inbox-review-invoice-date-tag"
            data-testid="ReviewTag__fd4b42" />
            : null}
          error={dateMissing ? ui('invoiceInboxReviewDateRequired') : null}
          testId="invoice-inbox-review-invoice-date"
          data-testid="ReviewField__fd4b42" />
        <CurrencyField review={review} currency={currency} data-testid="CurrencyField__review" />
      </div>
    </section>
  );
}

/**
 * ETP-6050 F5 — the right pane's content: banners (failed, confirmed, duplicate) at the top,
 * Proveedor, Cabecera, Líneas, the totals card and, at the bottom, the total-mismatch banner. It
 * only reads the document (`review.document`, the `CURRENT_DATA` v1 contract plus the review
 * enrichment); `readOnly` is true in S1 and `locked` (nobody can edit this document at all:
 * confirmed, discarded, foreign receiver) additionally hides the add / delete affordances.
 * `settled` (confirmed / discarded) switches to the plain-text vendor, disabled header fields
 * and the compact line list.
 *
 * @param {{review: object, currency: string, readOnly?: boolean, locked?: boolean,
 *   settled?: boolean}} props
 */
export default function InvoiceInboxReviewForm({
  review, currency, readOnly = true, locked = false, settled = false,
}) {
  const { locale } = useLocaleSwitch();
  const document = review.document ?? {};
  const missing = missingSet(document);
  return (
    <div className="flex flex-col gap-[22px]" data-testid="invoice-inbox-review-form" data-readonly={readOnly || undefined}>
      <InvoiceInboxReviewBanners review={review} data-testid="InvoiceInboxReviewBanners__form" />
      <InvoiceInboxReviewVendor
        document={document}
        missing={missing}
        readOnly={readOnly}
        locked={settled}
        data-testid="InvoiceInboxReviewVendor__form" />
      <HeaderSection
        review={review}
        currency={currency}
        missing={missing}
        readOnly={readOnly}
        locked={settled}
        locale={locale}
        data-testid="HeaderSection__form" />
      <InvoiceInboxReviewLines
        key={review.id}
        document={document}
        currency={currency}
        readOnly={readOnly}
        showActions={!locked}
        locked={settled}
        data-testid="InvoiceInboxReviewLines__form" />
      <InvoiceInboxReviewTotals
        header={document.header}
        lines={document.lines}
        currency={currency}
        data-testid="InvoiceInboxReviewTotals__form" />
      <InvoiceInboxReviewMismatchBanner review={review} currency={currency} data-testid="InvoiceInboxReviewMismatchBanner__form" />
    </div>
  );
}
