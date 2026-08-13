import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, docChipProps } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ data }) {
  const navigate = useNavigate();
  const ui = useUI();

  // sourceShipments and returnInvoices are injected by ReturnMaterialReceiptHeaderHandler.afterHandle
  // with full data: {id, documentNo, documentStatus} for shipments and
  // {id, documentNo, documentStatus, grandTotalAmount, currency$_identifier} for invoices.
  const sourceShipments = Array.isArray(data?.sourceShipments) ? data.sourceShipments : [];
  const returnInvoices = Array.isArray(data?.returnInvoices) ? data.returnInvoices : [];

  const chips = [];

  sourceShipments.forEach((shipment) => {
    chips.push(
      <DocChip
        key={`source-shipment-${shipment.id}`}
        {...docChipProps({ type: 'shipment', doc: shipment, ui, navigate })}
      />
    );
  });

  returnInvoices.forEach((inv) => {
    chips.push(
      <DocChip
        key={`return-invoice-${inv.id}`}
        {...docChipProps({ type: 'sales-invoice', doc: inv, ui, navigate })}
      />
    );
  });

  return (
    <RelatedDocumentsShell loading={false}>
      {chips}
    </RelatedDocumentsShell>
  );
}
