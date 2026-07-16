import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import {
  DocChip,
  RelatedDocumentsShell,
  STATUS_KEYS,
  CHIP_ICONS,
  CHIP_COLORS,
  docChipProps,
  fetchById,
  fetchByCriteria,
} from '@/components/related-documents';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [order, setOrder] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [originalInvoices, setOriginalInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId || !data) { setLoading(false); return; }
    setLoading(true);
    const orderId = data.salesOrder;
    const promises = [];

    if (orderId) {
      promises.push(
        (async () => {
          // criteria queries apply the DocSubTypeSO='ON' WHERE that GET-by-ID bypasses
          const quotations = await fetchByCriteria('sales-quotation', 'quotation', 'id', orderId, token, apiBaseUrl).catch(() => []);
          if (quotations.length > 0) { setOrder({ ...quotations[0], _isQuotation: true }); return; }
          const order = await fetchById('sales-order', 'header', orderId, token, apiBaseUrl).catch(() => null);
          if (order) setOrder(order);
        })()
      );

      // If this is a credit note, fetch original invoices from the same order
      const isCreditNote = data['transactionDocument$_identifier']?.toLowerCase().includes('credit');
      if (isCreditNote) {
        promises.push(
          fetchByCriteria('sales-invoice', 'header', 'salesOrder', orderId, token, apiBaseUrl)
            .then(d => setOriginalInvoices(d.filter(inv => inv.id !== recordId)))
        );
      }
    } else {
      setOrder(null);
    }

    // Linked shipments/returns are resolved server-side (SalesInvoiceHeaderHandler#
    // enrichLinkedShipments) from each invoice line's own `goodsShipmentLine` (M_InOutLine_ID),
    // covering BOTH normal deliveries and customer returns — `movementType` on each entry tells
    // which. This must be read unconditionally, never derived from `salesOrder`: a DEV (return)
    // invoice's `salesOrder`, when set, still points at the ORIGINAL sales order, whose own
    // shipments are outgoing deliveries, not the return that generated this invoice. Deriving
    // the chip from an order-scoped shipment lookup (as this file used to) is what produced the
    // wrong "Envío" chip/link for return invoices (ETP-4534).
    const linked = Array.isArray(data.linkedShipments) ? data.linkedShipments : [];
    setShipments(linked);

    if (promises.length === 0) { setLoading(false); return; }
    Promise.all(promises).then(() => setLoading(false));
  }, [recordId, data, token, apiBaseUrl, refreshKey]);

  const chips = [];

  if (order) {
    const isQuotation = order._isQuotation;
    chips.push(
      <DocChip
        key="order"
        icon={isQuotation ? CHIP_ICONS.quotation : CHIP_ICONS.order}
        iconColor={isQuotation ? CHIP_COLORS.quotation : CHIP_COLORS.order}
        title={isQuotation ? ui('quotationDoc', { number: order.documentNo }) : ui('orderDoc', { number: order.documentNo })}
        amount={order.grandTotalAmount}
        currency={order['currency$_identifier']}
        status={order.documentStatus}
        statusLabel={ui(STATUS_KEYS[order.documentStatus] || order.documentStatus)}
        onClick={() => navigate(`/${isQuotation ? 'sales-quotation' : 'sales-order'}/${order.id}`)}
      />
    );
  }

  for (const s of shipments) {
    const isReturn = s.movementType === 'C+';
    chips.push(
      <DocChip
        key={`ship-${s.id}`}
        {...docChipProps({ type: isReturn ? 'return-material-receipt' : 'shipment', doc: s, ui, navigate })}
      />
    );
  }

  for (const inv of originalInvoices) {
    chips.push(
      <DocChip
        key={`inv-${inv.id}`}
        icon={CHIP_ICONS.invoice}
        iconColor={CHIP_COLORS.invoice}
        title={ui('invoiceDoc', { number: inv.documentNo })}
        amount={inv.grandTotalAmount}
        currency={inv['currency$_identifier']}
        status={inv.documentStatus}
        statusLabel={ui(STATUS_KEYS[inv.documentStatus] || inv.documentStatus)}
        onClick={() => navigate(`/sales-invoice/${inv.id}`)}
      />
    );
  }

  // sourceInvoice is injected server-side (SalesInvoiceHeaderHandler#enrichSourceInvoice) only
  // for genuine return-invoice lines whose M_InOutLine carries Canceled_Inoutline_ID — i.e. only
  // when this invoice traces back through a return to an original invoice being reversed. It is
  // additive to the `shipments` chip above (which already shows the return receipt itself via
  // movementType), never a duplicate of it.
  if (data?.sourceInvoice) {
    chips.push(
      <DocChip
        key="source-invoice"
        {...docChipProps({ type: 'sales-invoice', doc: data.sourceInvoice, ui, navigate })}
      />
    );
  }

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey(k => k + 1)}>
      {chips}
    </RelatedDocumentsShell>
  );
}
