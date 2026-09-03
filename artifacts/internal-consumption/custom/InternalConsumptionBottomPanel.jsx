import { LinesBottomSection, LinesEmptyState } from '@/components/contract-ui';

// No RelatedDocuments component for this window — LinesBottomSection
// gracefully omits the Docs block when the prop is undefined.
// Inventory operation: no monetary totals → showTotals={false}.
export default function InternalConsumptionBottomPanel(props) {
  return <LinesBottomSection {...props} showTotals={false} />;
}
InternalConsumptionBottomPanel.showLineTotals = false;

// Simple inventory document — no import flow, so the shared generic
// empty state (add-line only) is used as-is.
InternalConsumptionBottomPanel.linesEmptyState = LinesEmptyState;
