import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from './RelatedDocuments';

/**
 * Sales Quotation bottom section. Thin wrapper around the shared
 * `LinesBottomSection` that injects the window-specific RelatedDocuments
 * component — all layout, widths, height and totals plumbing live in the
 * shared component so every inline-editable window stays visually consistent.
 */
export default function QuotationBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} />;
}
