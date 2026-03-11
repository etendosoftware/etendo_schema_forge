import { ListView, DetailView } from '@/components/contract-ui';
import PaymentOutTable from './PaymentOutTable';
import PaymentOutForm from './PaymentOutForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'accounting', name: 'Payment Out' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="paymentOut"
        Form={PaymentOutForm}
        catalogs={catalogs}
        entityLabel="Payment Out"
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
      entity="paymentOut"
      Table={PaymentOutTable}
      entityLabel="Payment Outs"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
