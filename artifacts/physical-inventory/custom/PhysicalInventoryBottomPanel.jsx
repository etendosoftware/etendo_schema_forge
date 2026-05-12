import { LinesBottomSection } from '@/components/contract-ui';

export default function PhysicalInventoryBottomPanel(props) {
  return <LinesBottomSection {...props} showTotals={false} />;
}
PhysicalInventoryBottomPanel.showLineTotals = false;
