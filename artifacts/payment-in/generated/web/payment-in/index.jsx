import { ListView, DetailView } from '@/components/contract-ui';
import PaymentInTable from './PaymentInTable';
import PaymentInForm from './PaymentInForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'accounting', name: 'Payment In' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="paymentIn"
        Form={PaymentInForm}
        catalogs={catalogs}
        entityLabel="Payment In"
        windowName={windowName}
        recordId={recordId}
<<<<<<< HEAD
        window={windowMeta}
=======
>>>>>>> origin/main
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="paymentIn"
      Table={PaymentInTable}
      entityLabel="Payment In"
      windowName={windowName}
<<<<<<< HEAD
      window={windowMeta}
=======
>>>>>>> origin/main
      {...props}
    />
  );
}
