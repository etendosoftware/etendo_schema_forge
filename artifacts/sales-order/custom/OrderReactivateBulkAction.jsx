import BulkDocumentAction from '@/components/contract-ui/BulkDocumentAction';
import { useUI } from '@/i18n';

export default function OrderReactivateBulkAction(props) {
  const ui = useUI();

  const rowFilter = (row, action) => {
    if (action === 'RE' && row.hasLinkedDocuments) {
      return ui('cannotReactivateLinkedDocs');
    }
    return true;
  };

  return <BulkDocumentAction {...props} rowFilter={rowFilter} labelKey="process" />;
}
