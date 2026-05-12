import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from './RelatedDocuments';

/**
 * Sales Order bottom section. Delegates to the shared LinesBottomSection and
 * injects the order-specific RelatedDocuments component. All layout, widths,
 * height and totals plumbing live in the shared component so this window stays
 * visually consistent with the rest of the inline-editable family.
 */
export default function OrderBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} />;
}
