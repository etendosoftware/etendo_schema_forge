import { LinesBottomSection } from '@/components/contract-ui';

export default function GoodsMovementsBottomPanel(props) {
  return <LinesBottomSection {...props} showTotals={false} />;
}
GoodsMovementsBottomPanel.showLineTotals = false;
