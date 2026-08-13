import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, docChipProps } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ data }) {
  const navigate = useNavigate();
  const ui = useUI();

  // sourceReceipts and returnInvoices are injected by ReturnToVendorShipmentHeaderHandler.afterHandle
  // with full data: {id, documentNo, documentStatus} for receipts and
  // {id, documentNo, documentStatus, grandTotalAmount, currency$_identifier} for invoices.
  const sourceReceipts = Array.isArray(data?.sourceReceipts) ? data.sourceReceipts : [];
  const returnInvoices = Array.isArray(data?.returnInvoices) ? data.returnInvoices : [];

  const chips = [];

  sourceReceipts.forEach((receipt) => {
    chips.push(
      <DocChip
        key={`source-receipt-${receipt.id}`}
        {...docChipProps({ type: 'goods-receipt', doc: receipt, ui, navigate })}
      />
    );
  });

  returnInvoices.forEach((inv) => {
    chips.push(
      <DocChip
        key={`return-invoice-${inv.id}`}
        {...docChipProps({ type: 'purchase-invoice', doc: inv, ui, navigate })}
      />
    );
  });

  return (
    <RelatedDocumentsShell loading={false}>
      {chips}
    </RelatedDocumentsShell>
  );
}
