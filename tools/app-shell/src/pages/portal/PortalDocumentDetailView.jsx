import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Download, Eye, FileX } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency, formatGroupedNumber } from '@/lib/formatCurrency.js';
import {
  PORTAL_ERROR, fetchPortalDocument, fetchPortalDocumentPdf,
} from '@/lib/portal/portalApi.js';
import { portalPdfFileName } from '@/lib/portal/portalInvoices.js';
import { saveBlobAsFile } from '@/lib/portal/portalDownload.js';
import {
  PortalDate, PortalDocumentStatus, PortalDueDate, PortalMoney, PortalPaymentStatus,
  PortalSection,
} from './PortalBits.jsx';
import { documentLabelKey } from './portalPresentation.js';

/** Quantities may be fractional (kg, hours): never round them to an integer. */
function formatQuantity(value) {
  return value == null ? '—'
    : formatGroupedNumber(value, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

/**
 * One document, read-only (design Documento / Movil-Documento): a document sheet with the header
 * data, the lines and the totals; a side panel with the summary, the payment block for invoices
 * (§B.2), the related documents (§B.6, navigable) and the printable (§B.7) — the same file the
 * email's download link serves, or "PDF no disponible" when the document has none.
 *
 * Comments and Accept/Reject (quotations) are not part of this story; the design shows them for
 * later work.
 */
export default function PortalDocumentDetailView({
  apiFetch, token, kind, id, identity, logoUrl, onNavigate, onInvalid, onLoaded,
}) {
  const ui = useUI();
  const [document, setDocument] = useState(null);
  const [state, setState] = useState('loading');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  // Read through a ref so a parent re-creating its callback never refetches the document.
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    let active = true;
    setState('loading');
    setDocument(null);
    fetchPortalDocument(apiFetch, token, kind, id).then((loaded) => {
      if (!active) return;
      setDocument(loaded);
      setState('ready');
      onLoadedRef.current?.(loaded);
    }).catch((error) => {
      if (!active) return;
      if (error?.code === PORTAL_ERROR.invalidLink) {
        onInvalid();
        return;
      }
      setState(error?.status === 404 ? 'notFound' : 'failed');
    });
    return () => { active = false; };
  }, [apiFetch, token, kind, id, onInvalid]);

  // An object URL pins its blob until released.
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const loadPdf = useCallback(async () => {
    setPdfBusy(true);
    setPdfFailed(false);
    try {
      return await fetchPortalDocumentPdf(apiFetch, token, kind, id);
    } catch (error) {
      if (error?.code === PORTAL_ERROR.invalidLink) onInvalid();
      else setPdfFailed(true);
      return null;
    } finally {
      setPdfBusy(false);
    }
  }, [apiFetch, token, kind, id, onInvalid]);

  const viewPdf = useCallback(async () => {
    const blob = await loadPdf();
    if (blob) setPdfUrl(URL.createObjectURL(blob));
  }, [loadPdf]);

  const downloadPdf = useCallback(async () => {
    const blob = await loadPdf();
    if (blob) saveBlobAsFile(blob, portalPdfFileName(document ?? { id }));
  }, [loadPdf, document, id]);

  if (state === 'loading') {
    return <p className="p-6 text-sm text-muted-foreground" data-testid="portal-document-loading">{ui('loading')}</p>;
  }
  if (state === 'notFound' || state === 'failed') {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="portal-document-unavailable">
        <FileX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 font-medium">
          {ui(state === 'notFound' ? 'portalDocumentNotFoundTitle' : 'portalLoadErrorTitle')}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {ui(state === 'notFound' ? 'portalDocumentNotFoundDescription' : 'portalLoadErrorDescription')}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => onNavigate({ view: 'home' })}>
          {ui('portalBackToHome')}
        </Button>
      </div>
    );
  }

  const isInvoice = document.kind === 'INVOICE';
  const hasAmounts = document.kind !== 'SHIPMENT';
  const typeLabel = ui(documentLabelKey(document));
  const taxesTotal = document.taxes.reduce((sum, tax) => sum + (tax.taxAmount ?? 0), 0);

  const pdfActions = document.hasPdf ? (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={viewPdf} disabled={pdfBusy} data-testid="portal-view-pdf">
        <Eye className="mr-2 h-4 w-4" aria-hidden="true" />{ui('portalViewPdf')}
      </Button>
      <Button onClick={downloadPdf} disabled={pdfBusy} data-testid="portal-download-pdf">
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />{ui('portalDownloadPdf')}
      </Button>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground" data-testid="portal-pdf-unavailable">
      <span className="font-medium text-foreground">{ui('portalPdfUnavailable')}</span>
      {' · '}{ui('portalPdfUnavailableHint')}
    </p>
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]" data-testid="portal-document-detail">
      {/* Document sheet (the design's preview panel), desktop only: mobile shows the lines below. */}
      <article className="hidden min-w-0 flex-col gap-5 rounded-lg border border-border p-6 lg:flex" data-testid="portal-document-sheet">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {logoUrl ? <img src={logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" /> : null}
            <span className="font-semibold">{document.issuer || identity?.tenantName}</span>
          </div>
          <div className="flex flex-col items-end text-sm">
            <span className="font-semibold">{typeLabel}</span>
            <span className="text-muted-foreground">{document.documentNo}</span>
            {document.currency ? <span className="text-xs text-muted-foreground">{document.currency}</span> : null}
          </div>
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground">{ui('portalCustomerData')}</span>
            <span><b>{ui('portalCustomerLabel')}:</b> {document.customer.name}</span>
            {document.customer.address ? <span><b>{ui('portalAddressLabel')}:</b> {document.customer.address}</span> : null}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground">{ui('portalDocumentData')}</span>
            <span><b>{ui('portalFieldDate')}:</b> <PortalDate value={document.date} /></span>
            {document.validUntil ? <span><b>{ui('portalColValidUntil')}:</b> <PortalDate value={document.validUntil} /></span> : null}
            {document.paymentMethod ? <span><b>{ui('portalFieldPaymentMethod')}:</b> {document.paymentMethod}</span> : null}
          </div>
        </div>
        <LinesTable document={document} />
        {hasAmounts ? (
          <div className="ml-auto flex w-64 flex-col gap-1 text-sm">
            <Row label={ui('portalSubtotal')} value={<PortalMoney currency={document.currency} value={document.taxBase} />} />
            <Row label={ui('portalFieldTaxes')} value={<PortalMoney currency={document.currency} value={taxesTotal} />} />
            <Row strong label={ui('portalTotal')} value={<PortalMoney currency={document.currency} value={document.grandTotal} />} />
          </div>
        ) : null}
      </article>

      {/* Side panel */}
      <aside className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5" data-testid="portal-document-summary">
          <div className="flex flex-col">
            <span className="font-semibold">{typeLabel} {document.documentNo}</span>
            <span className="text-xs text-muted-foreground">
              {ui('portalIssuedBy', { name: document.issuer || identity?.tenantName || '' })}
            </span>
          </div>
          {pdfActions}
          {pdfFailed ? <p className="text-xs text-destructive" role="alert">{ui('portalDownloadFailed')}</p> : null}
          {hasAmounts ? (
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">{ui('portalTotal')}</span>
              <PortalMoney currency={document.currency} value={document.grandTotal} className="text-xl font-semibold tabular-nums" testId="portal-document-total" />
            </div>
          ) : null}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{ui('portalFieldDate')}:</dt>
            <dd><PortalDate value={document.date} /></dd>
            {document.validUntil ? (<><dt className="text-muted-foreground">{ui('portalColValidUntil')}:</dt><dd><PortalDate value={document.validUntil} /></dd></>) : null}
            {document.scheduledDeliveryDate ? (<><dt className="text-muted-foreground">{ui('portalFieldDeliveryDate')}:</dt><dd><PortalDate value={document.scheduledDeliveryDate} /></dd></>) : null}
            <dt className="text-muted-foreground">{ui('portalColStatus')}:</dt>
            <dd><PortalDocumentStatus status={document.documentStatus} /></dd>
            {document.paymentMethod ? (<><dt className="text-muted-foreground">{ui('portalFieldPaymentMethod')}:</dt><dd>{document.paymentMethod}</dd></>) : null}
            {document.paymentTerms ? (<><dt className="text-muted-foreground">{ui('portalFieldPaymentTerms')}:</dt><dd>{document.paymentTerms}</dd></>) : null}
            {hasAmounts ? (<><dt className="text-muted-foreground">{ui('portalColTaxBase')}:</dt><dd><PortalMoney currency={document.currency} value={document.taxBase} /></dd></>) : null}
            {document.taxes.map((tax) => (
              <TaxRow key={tax.tax} tax={tax} currency={document.currency} />
            ))}
          </dl>
        </div>

        {isInvoice ? <PaymentBlock document={document} /> : null}

        {/* Mobile lines */}
        <PortalSection title={ui('portalLines')} className="lg:hidden" testId="portal-document-lines-mobile">
          {document.lines.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-muted-foreground">{ui('portalNoLines')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {document.lines.map((line, index) => (
                <li key={index} className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{line.product || line.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {[line.productCode,
                        hasAmounts
                          ? `${formatQuantity(line.quantity)} × ${formatMoneyText(document.currency, line.unitPrice)}`
                          : `${formatQuantity(line.quantity)} ${line.uom ?? ''}`.trim(),
                        line.tax].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {hasAmounts ? <PortalMoney currency={document.currency} value={line.amount} className="tabular-nums" /> : null}
                </li>
              ))}
            </ul>
          )}
        </PortalSection>

        <PortalSection title={ui('portalRelatedDocuments')} testId="portal-related">
          {document.related.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-muted-foreground">{ui('portalNoRelated')}</p>
          ) : (
            <ul className="py-1">
              {document.related.map((related) => (
                <li key={`${related.kind}:${related.id}`}>
                  <button
                    type="button"
                    onClick={() => onNavigate({ view: 'doc', kind: related.kind, id: related.id })}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm hover:bg-muted"
                    data-testid="portal-related-document"
                  >
                    <span className="min-w-0 flex-1">
                      {ui(documentLabelKey(related))} <span className="text-muted-foreground">{related.documentNo}</span>
                    </span>
                    {related.kind === 'INVOICE'
                      ? <PortalPaymentStatus document={related} />
                      : <PortalDocumentStatus status={related.documentStatus} />}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PortalSection>
      </aside>

      <Dialog open={Boolean(pdfUrl)} onOpenChange={(openState) => { if (!openState) setPdfUrl(null); }}>
        <DialogContent className="flex h-[90vh] max-w-5xl flex-col" data-testid="portal-pdf-dialog">
          <DialogHeader>
            <DialogTitle>{typeLabel} {document.documentNo}</DialogTitle>
          </DialogHeader>
          {pdfUrl ? (
            <iframe title={`${typeLabel} ${document.documentNo}`} src={pdfUrl} className="min-h-0 w-full flex-1 rounded-md border border-border" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Money inside a sentence ("2 × 75,00 €"), through the same canonical formatter. */
function formatMoneyText(currency, value) {
  return value == null ? '—' : formatCurrency(currency, value);
}

function Row({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'border-t border-border pt-1 font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function TaxRow({ tax, currency }) {
  return (
    <>
      <dt className="text-muted-foreground">{tax.tax}:</dt>
      <dd><PortalMoney currency={currency} value={tax.taxAmount} /></dd>
    </>
  );
}

/** The lines table of the document sheet. */
function LinesTable({ document }) {
  const ui = useUI();
  const hasAmounts = document.kind !== 'SHIPMENT';
  if (document.lines.length === 0) {
    return <p className="text-sm text-muted-foreground">{ui('portalNoLines')}</p>;
  }
  return (
    <table className="w-full border-collapse text-sm" data-testid="portal-document-lines">
      <thead>
        <tr className="border-b border-border text-left text-xs">
          <th className="py-2 pr-2 font-semibold">{ui('portalLineCode')}</th>
          <th className="py-2 pr-2 font-semibold">{ui('portalLineDescription')}</th>
          <th className="py-2 pr-2 text-right font-semibold">{ui('portalLineQuantity')}</th>
          {hasAmounts ? <th className="py-2 pr-2 text-right font-semibold">{ui('portalLinePrice')}</th> : null}
          {document.kind === 'QUOTATION' || document.kind === 'ORDER'
            ? <th className="py-2 pr-2 text-right font-semibold">{ui('portalLineDiscount')}</th> : null}
          {hasAmounts ? <th className="py-2 pr-2 font-semibold">{ui('portalLineTax')}</th> : null}
          {hasAmounts ? <th className="py-2 text-right font-semibold">{ui('portalLineAmount')}</th> : null}
        </tr>
      </thead>
      <tbody>
        {document.lines.map((line, index) => (
          <tr key={index} className="border-b border-border">
            <td className="py-2 pr-2 text-muted-foreground">{line.productCode || '—'}</td>
            <td className="py-2 pr-2">{line.product || line.description}</td>
            <td className="py-2 pr-2 text-right tabular-nums">
              {formatQuantity(line.quantity)}{!hasAmounts && line.uom ? ` ${line.uom}` : ''}
            </td>
            {hasAmounts ? (
              <td className="py-2 pr-2 text-right tabular-nums">
                <PortalMoney currency={document.currency} value={line.unitPrice} />
              </td>
            ) : null}
            {document.kind === 'QUOTATION' || document.kind === 'ORDER' ? (
              <td className="py-2 pr-2 text-right tabular-nums">
                {line.discount ? formatGroupedNumber(line.discount, { maximumFractionDigits: 2 }) : '–'}
              </td>
            ) : null}
            {hasAmounts ? <td className="py-2 pr-2">{line.tax || '—'}</td> : null}
            {hasAmounts ? (
              <td className="py-2 text-right tabular-nums">
                <PortalMoney currency={document.currency} value={line.amount} />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** §B.2: the invoice's payment state, due date, outstanding and instalments, as in the app. */
function PaymentBlock({ document }) {
  const ui = useUI();
  return (
    <PortalSection title={ui('portalPaymentTitle')} testId="portal-payment">
      <div className="flex flex-col gap-3 p-3.5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PortalPaymentStatus document={document} />
          <PortalDueDate document={document} />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">{ui('portalColOutstanding')}</span>
          <PortalMoney currency={document.currency} value={document.outstandingAmount} className="font-semibold tabular-nums" testId="portal-payment-outstanding" />
        </div>
        {document.installments.length > 1 ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-muted-foreground">{ui('portalInstallments')}</span>
            {document.installments.map((installment, index) => (
              <div key={index} className="flex justify-between gap-3 text-xs tabular-nums" data-testid="portal-installment">
                <PortalDate value={installment.dueDate} />
                <span>
                  <PortalMoney currency={document.currency} value={installment.amount} />
                  {' · '}{ui('portalColOutstanding')}{' '}
                  <PortalMoney currency={document.currency} value={installment.outstandingAmount} />
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </PortalSection>
  );
}
