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
import { getArSubtype } from './invoiceSubtype';

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
    const isDevInvoice = getArSubtype(data) === 'DEV';
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

      // For DEV invoices, salesOrder points to the original order whose shipments are
      // outgoing deliveries — not returns. Skip to avoid a misleading "envío" chip.
      if (!isDevInvoice) {
        promises.push(
          fetchByCriteria('goods-shipment', 'goodsShipment', 'salesOrder', orderId, token, apiBaseUrl)
            .then(d => setShipments(d))
        );
      }

      // If this is a credit note, fetch original invoices from the same order
      const isCreditNote = data['transactionDocument$_identifier']?.toLowerCase().includes('credit');
      if (isCreditNote) {
        promises.push(
          fetchByCriteria('sales-invoice', 'header', 'salesOrder', orderId, token, apiBaseUrl)
            .then(d => setOriginalInvoices(d.filter(inv => inv.id !== recordId)))
        );
      }
    } else {
      // No linked sales order — show shipments linked directly via invoice line → shipment line.
      // The backend enriches linkedShipments on every detail GET from m_inoutline_id joins.
      const linked = Array.isArray(data.linkedShipments) ? data.linkedShipments : [];
      if (linked.length > 0) {
        setShipments(linked);
      }
    }

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
    chips.push(isReturn
      ? (
        <DocChip
          key={`ship-${s.id}`}
          {...docChipProps({ type: 'return-material-receipt', doc: s, ui, navigate })}
        />
      ) : (
        <DocChip
          key={`ship-${s.id}`}
          icon={CHIP_ICONS.shipment}
          iconColor={CHIP_COLORS.shipment}
          title={ui('shipmentDoc', { number: s.documentNo })}
          status={s.documentStatus}
          statusLabel={ui(STATUS_KEYS[s.documentStatus] || s.documentStatus)}
          onClick={() => navigate(`/goods-shipment/${s.id}`)}
        />
      )
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

  if (data?.sourceReturnReceipt) {
    chips.push(
      <DocChip
        key="source-return-receipt"
        {...docChipProps({ type: 'return-material-receipt', doc: data.sourceReturnReceipt, ui, navigate })}
      />
    );
  }

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
