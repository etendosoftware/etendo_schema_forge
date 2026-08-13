import { useNavigate } from 'react-router-dom';
import { DocChip, RelatedDocumentsShell, docChipProps } from '@/components/related-documents';
import { useUI } from '@/i18n';

export default function RelatedDocuments({ data }) {
  const navigate = useNavigate();
  const ui = useUI();

  const orders = Array.isArray(data?.linkedOrders) ? data.linkedOrders : [];
  const invoices = Array.isArray(data?.linkedInvoices) ? data.linkedInvoices : [];
  const returnReceipts = Array.isArray(data?.returnReceipts) ? data.returnReceipts : [];

  const chips = [];

  for (const ord of orders) {
    chips.push(
      <DocChip
        key={`order-${ord.id}`}
        {...docChipProps({ type: 'sales-order', doc: ord, ui, navigate })}
      />
    );
  }

  for (const inv of invoices) {
    chips.push(
      <DocChip
        key={`inv-${inv.id}`}
        {...docChipProps({ type: 'sales-invoice', doc: inv, ui, navigate })}
      />
    );
  }

  for (const ret of returnReceipts) {
    chips.push(
      <DocChip
        key={`return-${ret.id}`}
        {...docChipProps({ type: 'return-material-receipt', doc: ret, ui, navigate })}
      />
    );
  }

  return (
    <RelatedDocumentsShell loading={false}>
      {chips}
    </RelatedDocumentsShell>
  );
}
