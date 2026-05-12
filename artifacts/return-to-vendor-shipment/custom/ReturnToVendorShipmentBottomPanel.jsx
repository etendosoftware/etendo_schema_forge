import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from './RelatedDocuments';

export default function ReturnToVendorShipmentBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} showTotals={false} />;
}
ReturnToVendorShipmentBottomPanel.showLineTotals = false;
