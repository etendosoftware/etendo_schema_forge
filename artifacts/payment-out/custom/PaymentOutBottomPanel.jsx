import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from '@/windows/custom/payment-out/RelatedDocuments';

export default function PaymentOutBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} />;
}
