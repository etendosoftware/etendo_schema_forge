import GeneratedApp from '@generated/payment-out/generated/web/payment-out/index.jsx';
import RelatedDocuments from './RelatedDocuments.jsx';

export default function PaymentOutWindow(props) {
  return (
    <GeneratedApp
      {...props}
      secondaryTabs={[]}
      notesField="description"
      customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
    />
  );
}
