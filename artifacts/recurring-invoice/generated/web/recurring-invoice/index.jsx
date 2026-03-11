import { ListView, DetailView } from '@/components/contract-ui';
import RecurringInvoiceTable from './RecurringInvoiceTable';
import RecurringInvoiceForm from './RecurringInvoiceForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'finance', name: 'Recurring Invoice' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="recurringInvoice"
        Form={RecurringInvoiceForm}
        catalogs={catalogs}
        entityLabel="Recurring Invoice"
        windowName={windowName}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="recurringInvoice"
      Table={RecurringInvoiceTable}
      entityLabel="Recurring Invoices"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
