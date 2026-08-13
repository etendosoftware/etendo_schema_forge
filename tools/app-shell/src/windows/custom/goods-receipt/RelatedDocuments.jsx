import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, docChipProps } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ data }) {
  const navigate = useNavigate();
  const ui = useUI();

  // All enriched by GoodsReceiptHeaderHandler.afterHandle.
  const orders   = Array.isArray(data?.linkedOrders)   ? data.linkedOrders   : [];
  const invoices = Array.isArray(data?.linkedInvoices) ? data.linkedInvoices : [];
  const returns  = Array.isArray(data?.linkedReturns)  ? data.linkedReturns  : [];

  const chips = [];

  for (const ord of orders) {
    chips.push(
      <DocChip
        key={`order-${ord.id}`}
        {...docChipProps({ type: 'order', doc: ord, ui, navigate })}
        data-testid="DocChip__361565" />
    );
  }

  for (const inv of invoices) {
    chips.push(
      <DocChip
        key={`invoice-${inv.id}`}
        {...docChipProps({ type: 'invoice', doc: inv, ui, navigate })}
        data-testid="DocChip__361565" />
    );
  }

  for (const ret of returns) {
    chips.push(
      <DocChip
        key={`return-${ret.id}`}
        {...docChipProps({ type: 'return-to-vendor', doc: ret, ui, navigate })}
        data-testid="DocChip__361565" />
    );
  }

  return (
    <RelatedDocumentsShell loading={false} data-testid="RelatedDocumentsShell__361565">
      {chips}
    </RelatedDocumentsShell>
  );
}
