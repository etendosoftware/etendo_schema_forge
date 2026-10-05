import { useUI } from '@/i18n';
import ProgressFieldBadge from '@/windows/custom/shared/ProgressFieldBadge';

export default function GoodsShipmentBillingBadge({ data }) {
  const ui = useUI();
  return (
    <ProgressFieldBadge
      documentStatus={data?.documentStatus}
      value={data?.invoiceStatus}
      label={ui('invoiced')}
      showWhenPositive
      testId="billing-badge"
    />
  );
}
