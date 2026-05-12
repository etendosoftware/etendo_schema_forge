import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from './RelatedDocuments';

export default function ReturnMaterialReceiptBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} showTotals={false} />;
}
ReturnMaterialReceiptBottomPanel.showLineTotals = false;
