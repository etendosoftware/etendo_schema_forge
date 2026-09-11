import InvoiceTopbarExtra from '@generated/sales-invoice/custom/InvoiceTopbarExtra';
import { useInvoiceUpdatedListener } from '../shared/useInvoiceUpdatedListener.js';

/* eslint-disable react/prop-types */

// ETP-5260 — Clone/Copy-link moved to the topbarSecondary slot
// (SalesInvoiceSecondaryActions). This component now only nests
// InvoiceTopbarExtra (payment-status badge, SendToSif, Send-by-email — all of
// which stay in topbarRight, at the extreme right after Save/Confirm, per the
// DF; see SalesInvoiceSecondaryActions' doc comment for the rationale).
export default function SalesInvoiceTopbar({ data, recordId, token, apiBaseUrl, api, onProcess, onRefresh }) {
  useInvoiceUpdatedListener('sales-invoice', recordId, onRefresh);

  if (!data || !recordId) return null;

  return (
    <InvoiceTopbarExtra
      data={data}
      recordId={recordId}
      token={token}
      apiBaseUrl={apiBaseUrl}
      api={api}
      onProcess={onProcess}
      data-testid="InvoiceTopbarExtra__5c4da7" />
  );
}
