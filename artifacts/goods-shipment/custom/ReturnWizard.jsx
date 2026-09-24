import CreateReturnWizard from '@/components/contract-ui/CreateReturnWizard';
import { apiFetch } from '@/auth/api.js';

// Shipment lines don't carry prices — fetch the originating sales order's header
// (for currency) and lines (for unit price) so the step-2 summary can show amounts.
async function fetchPrices({ base, sourceData }) {
  const orderId = sourceData?.salesOrder;
  if (!orderId) return {};

  const [headerRes, linesRes] = await Promise.all([
    apiFetch(`${base}/sales-order/header/${orderId}`, { baseUrl: '' }).catch(() => null),
    apiFetch(`${base}/sales-order/lines?parentId=${orderId}&_limit=200`, { baseUrl: '' }).catch(() => null),
  ]);

  let currency;
  if (headerRes?.ok) {
    const order = (await headerRes.json().catch(() => null))?.response?.data?.[0];
    currency = order?.['currency$_identifier'];
  }

  const priceMap = {};
  if (linesRes?.ok) {
    const orderLines = (await linesRes.json().catch(() => ({ response: { data: [] } })))?.response?.data || [];
    for (const ol of orderLines) {
      if (ol.product) priceMap[ol.product] = ol.unitPrice ?? ol.priceActual ?? 0;
    }
  }

  return { priceMap, currency };
}

export default function ReturnWizard({ shipmentData, ...props }) {
  return (
    <CreateReturnWizard
      {...props}
      sourceData={shipmentData}
      titleKey="createReturnFromShipment"
      refLabelKey="shipmentRef"
      docTypeLabelKey="returnReceipt"
      docTypeDescriptionKey="stockMovementToWarehouse"
      createActionUrl={(base, id) => `${base}/goods-shipment/goodsShipment/${id}/action/createReturn`}
      showAmountColumn
      fetchPrices={fetchPrices}
    />
  );
}
