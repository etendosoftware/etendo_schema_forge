import { useUI } from '@/i18n';
import ProgressFieldBadge from '@/windows/custom/shared/ProgressFieldBadge';

export default function PurchaseInvoiceReceiptBadge({ data }) {
  const ui = useUI();
  return (
    <ProgressFieldBadge
      documentStatus={data?.documentStatus}
      value={data?.eTGODeliveryStatus}
      label={ui('poAllReceived')}
      testId="receipt-badge"
    />
  );
}
