import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from '@/windows/custom/goods-receipt/RelatedDocuments';

export default function GoodsReceiptBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} showTotals={false} />;
}
GoodsReceiptBottomPanel.showLineTotals = false;
