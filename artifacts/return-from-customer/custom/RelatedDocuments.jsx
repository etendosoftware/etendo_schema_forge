import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_ICONS, CHIP_COLORS, fetchChild, fetchById } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId) { setLoading(false); return; }

    (async () => {
      try {
        // Step 1: Fetch return order lines to get goodsShipmentLine references
        const lines = await fetchChild('return-from-customer', 'customerReturnLine', recordId, token, apiBaseUrl);

        // Collect unique shipment line IDs
        const seen = new Set();
        const shipmentLineIds = [];
        for (const l of lines) {
          const slId = l.goodsShipmentLine;
          if (slId && !seen.has(slId)) {
            seen.add(slId);
            shipmentLineIds.push(slId);
          }
        }

        if (shipmentLineIds.length === 0) { setLoading(false); return; }

        // Step 2: For each shipment line, fetch it to get the parent shipment ID
        const shipmentIds = new Set();
        await Promise.all(shipmentLineIds.map(async (lineId) => {
          const sl = await fetchById('goods-shipment', 'goodsShipmentLine', lineId, token, apiBaseUrl);
          if (sl?.shipmentReceipt) shipmentIds.add(sl.shipmentReceipt);
        }));

        if (shipmentIds.size === 0) { setLoading(false); return; }

        // Step 3: Fetch each unique shipment header
        const results = await Promise.all(
          [...shipmentIds].map(shipId => fetchById('goods-shipment', 'goodsShipment', shipId, token, apiBaseUrl))
        );

        setShipments(results.filter(Boolean));
      } catch {
        setShipments([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [recordId, token, apiBaseUrl]);

  // Credit notes: pending backend — when the return generates a credit note,
  // the invoice will have C_Order_ID pointing to this return order.

  return (
    <RelatedDocumentsShell loading={loading}>
      {shipments.map((s) => (
        <DocChip
          key={`ship-${s.id}`}
          icon={CHIP_ICONS.shipment}
          iconColor={CHIP_COLORS.shipment}
          title={ui('shipmentDoc', { number: s.documentNo })}
          status={s.documentStatus}
          statusLabel={ui(STATUS_KEYS[s.documentStatus] || s.documentStatus)}
          onClick={() => navigate(`/goods-shipment/${s.id}`)}
        />
      ))}
    </RelatedDocumentsShell>
  );
}
