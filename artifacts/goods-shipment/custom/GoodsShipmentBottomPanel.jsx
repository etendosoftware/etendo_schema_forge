import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from './RelatedDocuments';

export default function GoodsShipmentBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} showTotals={false} />;
}
GoodsShipmentBottomPanel.showLineTotals = false;
