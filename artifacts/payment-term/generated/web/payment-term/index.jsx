import { ListView, DetailView } from '@/components/contract-ui';
import PaymentTermTable from './PaymentTermTable';
import PaymentTermForm from './PaymentTermForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'Payment Term' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="paymentTerm"
        Form={PaymentTermForm}
        catalogs={catalogs}
        entityLabel="Payment Term"
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
      entity="paymentTerm"
      Table={PaymentTermTable}
      entityLabel="Payment Terms"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
