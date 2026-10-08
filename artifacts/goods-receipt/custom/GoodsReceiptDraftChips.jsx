import { useUI } from '@/i18n';
import ProgressFieldBadge from '@/windows/custom/shared/ProgressFieldBadge';

export default function GoodsReceiptDraftChips({ data }) {
  const ui = useUI();
  return (
    <ProgressFieldBadge
      documentStatus={data?.documentStatus}
      value={data?.invoiceStatus}
      label={ui('poAllInvoiced')}
      showWhenPositive
      testId="goods-receipt-invoice-badge"
    />
  );
}
