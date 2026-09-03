import { LinesBottomSection, LinesEmptyState } from '@/components/contract-ui';

export default function GoodsMovementsBottomPanel(props) {
  return <LinesBottomSection {...props} showTotals={false} />;
}
GoodsMovementsBottomPanel.showLineTotals = false;

// Simple inventory document — no import flow, so the shared generic
// empty state (add-line only) is used as-is.
GoodsMovementsBottomPanel.linesEmptyState = LinesEmptyState;
