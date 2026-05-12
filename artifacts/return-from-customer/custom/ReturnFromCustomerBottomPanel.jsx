import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from './RelatedDocuments';

export default function ReturnFromCustomerBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} />;
}
