import { useMemo } from 'react';
import { useLocaleSwitch, useUI } from '@/i18n';
import { CurrencyRatePicker } from '@/components/contract-ui/CurrencyRatePicker.jsx';
import { DateField } from '@/components/ui/date-field';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { buildOp, currencyScale, MAX_DOCUMENT_NO, missingSet } from './invoiceInboxReviewModel.js';
import { DATE_FIELD_ICON, ReviewField, ReviewTag, SectionTitle } from './InvoiceInboxReviewParts.jsx';
import { CommitInput } from './InvoiceInboxReviewInputs.jsx';
import { ReviewEditorContext, useReviewEditor } from './useInvoiceInboxReviewEditor.js';
import InvoiceInboxReviewBanners, { InvoiceInboxReviewMismatchBanner, InvoiceInboxReviewNotice, InvoiceInboxReviewRefusal } from './InvoiceInboxReviewBanners.jsx';
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
  const editor = useReviewEditor();
  const editable = Boolean(editor) && !readOnly;
  const header = review.document?.header;
  const dateMissing = missing.has('invoiceDate');
  const tooLong = review.errorCode === 'REFERENCE_TOO_LONG';
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
          invalid={tooLong}
          error={tooLong ? ui('invoiceInboxReviewReferenceTooLong', { max: MAX_DOCUMENT_NO }) : null}
          testId="invoice-inbox-review-invoice-no"
          control={editable ? (
            <CommitInput
              id="invoice-inbox-review-invoice-no"
              value={header?.documentNo ?? ''}
              display={(value) => String(value ?? '')}
              invalid={tooLong}
              maxLength={200}
              onCommit={(value) => editor.commit('header:documentNo', buildOp.setHeader({ documentNo: value }))}
              testId="invoice-inbox-review-invoice-no"
              data-testid="CommitInput__fd4b42" />
          ) : null}
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
          control={editable ? (
            <div aria-invalid={dateMissing || undefined} data-testid="invoice-inbox-review-invoice-date-control">
              <DateField
                id="invoice-inbox-review-invoice-date"
                value={header?.invoiceDate ?? ''}
                className={dateMissing ? 'border-destructive bg-[var(--status-destructive-bg)]' : undefined}
                onChange={(iso) => {
                  // The shared field only reports a real day or ''; an unchanged day writes nothing.
                  if ((iso || null) === (header?.invoiceDate || null)) return;
                  editor.commit('header:invoiceDate', buildOp.setHeader({ invoiceDate: iso || null }));
                }}
                data-testid="invoice-inbox-review-invoice-date" />
              {!header?.invoiceDate && header?.invoiceDateRaw && (
                <p className="mt-1.5 text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid="invoice-inbox-review-invoice-date-raw">
                  {ui('invoiceInboxReviewDateRawHint', { date: header.invoiceDateRaw })}
                </p>
              )}
            </div>
          ) : null}
          data-testid="ReviewField__fd4b42" />
        <CurrencyField review={review} currency={currency} data-testid="CurrencyField__review" />
      </div>
    </section>
  );
}

/**
 * ETP-6050 F5 — the right pane's content: banners (failed, confirmed, duplicate) and the reload
 * notice at the top, Proveedor, Cabecera, Líneas, the totals card and, at the bottom, the
 * total-mismatch banner. It renders the EFFECTIVE review (server answer plus pending edits, see
 * `useInvoiceInboxReviewEditor`) and provides the editor to the inputs through context; without an
 * `editor` (or with `readOnly`) it is the read-only form of S1. `locked` (nobody can edit this
 * document at all: confirmed, discarded, foreign receiver) additionally hides the add / delete
 * affordances. `settled` switches to the plain-text vendor, disabled header fields and the compact
 * line list.
 *
 * @param {{review: object, currency: string, readOnly?: boolean, locked?: boolean,
 *   settled?: boolean, editor?: object|null, apiBaseUrl?: string}} props
 */
export default function InvoiceInboxReviewForm({
  review, currency, readOnly = true, locked = false, settled = false, editor = null, apiBaseUrl = '',
}) {
  const { locale } = useLocaleSwitch();
  const document = review.document ?? {};
  const missing = missingSet(document);
  const scale = currencyScale(review.currency);
  const context = useMemo(() => (editor ? { ...editor, apiBaseUrl } : null), [editor, apiBaseUrl]);
  return (
    <ReviewEditorContext.Provider value={readOnly ? null : context}>
      <div className="flex flex-col gap-[22px]" data-testid="invoice-inbox-review-form" data-readonly={readOnly || undefined}>
        {editor?.notice && (
          <InvoiceInboxReviewNotice
            noticeKey={editor.notice.key}
            onDismiss={editor.dismissNotice}
            data-testid="InvoiceInboxReviewNotice__form" />
        )}
        {editor?.refusal && (
          <InvoiceInboxReviewRefusal
            refusalKey={editor.refusal.key}
            onDismiss={editor.dismissRefusal}
            data-testid="InvoiceInboxReviewRefusal__form" />
        )}
        <InvoiceInboxReviewBanners review={review} data-testid="InvoiceInboxReviewBanners__form" />
        <InvoiceInboxReviewVendor
          document={document}
          missing={missing}
          readOnly={readOnly}
          locked={settled}
          apiBaseUrl={apiBaseUrl}
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
          document={document}
          currency={currency}
          scale={scale}
          readOnly={readOnly}
          showActions={!locked}
          locked={settled}
          apiBaseUrl={apiBaseUrl}
          data-testid="InvoiceInboxReviewLines__form" />
        <InvoiceInboxReviewTotals
          lines={document.lines}
          currency={currency}
          scale={scale}
          invoiceTotal={review.invoice?.grandTotal ?? null}
          data-testid="InvoiceInboxReviewTotals__form" />
        <InvoiceInboxReviewMismatchBanner review={review} currency={currency} data-testid="InvoiceInboxReviewMismatchBanner__form" />
      </div>
    </ReviewEditorContext.Provider>
  );
}
