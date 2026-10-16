import { useUI } from '@/i18n';
import ProgressFieldBadge from '@/windows/custom/shared/ProgressFieldBadge';
import { getArSubtype } from './invoiceSubtype';

export default function InvoiceDeliveryBadge({ data }) {
  const ui = useUI();
  // ETP-5706: a rectificative invoice has no delivery to track. The backend still
  // returns a percentage for it (a return receipt counts as a delivery in
  // ETGO_GET_DELIVERY_STATUS), so the chip is not rendered at all.
  if (getArSubtype(data) === 'RECTIFICATIVA') return null;
  return (
    <ProgressFieldBadge
      documentStatus={data?.documentStatus}
      value={data?.eTGODeliveryStatus}
      label={ui('soAllDelivered')}
      testId="delivery-badge"
    />
  );
}
