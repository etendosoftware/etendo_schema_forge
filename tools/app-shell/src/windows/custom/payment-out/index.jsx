import GeneratedApp from '@generated/payment-out/generated/web/payment-out/index.jsx';
import RelatedDocuments from './RelatedDocuments.jsx';
import { AttachmentsTab } from '@/components/attachments';
import { useUI } from '@/i18n';

export default function PaymentOutWindow(props) {
  const ui = useUI();
  return (
    <GeneratedApp
      {...props}
      secondaryTabs={[]}
      notesField="description"
      customTabs={[{ key: 'related', label: ui('relatedDocuments'), Component: RelatedDocuments }, { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: 'FIN_Payment', config: {} } }]}
      data-testid="GeneratedApp__608fd4" />
  );
}
