import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from './RelatedDocuments';

/**
 * Purchase Order bottom section. Delegates to the shared LinesBottomSection
 * and injects the purchase-specific RelatedDocuments component. All layout,
 * widths, height and totals plumbing live in the shared component.
 */
export default function PurchaseOrderBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} />;
}
