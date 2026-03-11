import { ListView, DetailView } from '@/components/contract-ui';
import PaymentMethodTable from './PaymentMethodTable';
import PaymentMethodForm from './PaymentMethodForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'Payment Method' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="paymentMethod"
        Form={PaymentMethodForm}
        catalogs={catalogs}
        entityLabel="Payment Method"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="paymentMethod"
      Table={PaymentMethodTable}
      entityLabel="Payment Method"
      windowName={windowName}
      {...props}
    />
  );
}
