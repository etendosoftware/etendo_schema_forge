import InvoiceTopbarExtra from '@generated/sales-invoice/custom/InvoiceTopbarExtra';
import { useInvoiceUpdatedListener } from '../shared/useInvoiceUpdatedListener.js';
import FollowUpDocumentButton from '@/components/follow-up-documents/FollowUpDocumentButton.jsx';
import { SALES_INVOICE_FOLLOW_UP } from '../shared/invoiceFollowUp.js';

/* eslint-disable react/prop-types */

// ETP-5260 — Clone/Copy-link moved to the topbarSecondary slot
// (SalesInvoiceSecondaryActions). This component now only nests
// InvoiceTopbarExtra (payment-status badge and the Send-by-email modal host —
// both stay in topbarRight, at the extreme right after Save/Confirm, per the
// DF; see SalesInvoiceSecondaryActions' doc comment for the rationale).
// ETP-5700 — the fiscal send action is no longer a topbar button: in the form
// view it lives only in the kebab (SifSendMenuItem).
//
// ETP-5576 — also hosts the generic "Gestionar envío" follow-up button + modal (primary
// document-flow action, so topbarRight). The modal is opened either by the button or by
// draftMode.afterProcess right after Confirm (see index.jsx).
export default function SalesInvoiceTopbar({ data, recordId, token, apiBaseUrl, onRefresh, windowReadOnly }) {
  useInvoiceUpdatedListener('sales-invoice', recordId, onRefresh);

  if (!data || !recordId) return null;

  return (
    <>
      <FollowUpDocumentButton
        data={data}
        apiBaseUrl={apiBaseUrl}
        spec={SALES_INVOICE_FOLLOW_UP.spec}
        options={SALES_INVOICE_FOLLOW_UP.options}
        summary={SALES_INVOICE_FOLLOW_UP.summary}
        questionKey={SALES_INVOICE_FOLLOW_UP.questionKey}
        onRefresh={onRefresh}
        windowReadOnly={windowReadOnly}
        data-testid="FollowUpDocumentButton__5c4da7" />
      <InvoiceTopbarExtra
      data={data}
      recordId={recordId}
      token={token}
      apiBaseUrl={apiBaseUrl}
      data-testid="InvoiceTopbarExtra__5c4da7" />
    </>
  );
}
