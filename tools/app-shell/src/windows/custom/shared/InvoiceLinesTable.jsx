import { forwardRef, useMemo } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';
import { useCurrency } from '@/hooks/useCurrency';
import { useLabel } from '@/i18n';

const EMPTY_FILTERS = [];

const InvoiceLinesTable = forwardRef(function InvoiceLinesTable({ data, productRequired = false, taxRequired = false, ...props }, ref) {
  const currencyCode = useCurrency();
  const t = useLabel();

  const columns = useMemo(() => ([
    { key: 'product', column: 'M_Product_ID', type: 'selector', label: t('M_Product_ID'), lookup: true, ...(productRequired ? { required: true } : {}) },
    { key: 'description', column: 'Description', type: 'string', label: t('Description') },
    { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', label: t('QtyInvoiced'), required: true },
    { key: 'listPrice', column: 'PriceList', type: 'amount', label: t('PriceList'), required: true },
    { key: 'etgoDiscount', column: 'EM_Etgo_Discount', type: 'number', label: t('EM_Etgo_Discount') },
    { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: t('C_Tax_ID'), ...(taxRequired ? { required: true } : {}) },
    { key: 'grossAmount', column: 'Line_Gross_Amount', type: 'amount', label: t('Line_Gross_Amount') },
  ]), [productRequired, t, taxRequired]);

  const enrichedData = useMemo(() => data?.map(row => ({
    ...row,
    'currency$_identifier': row['currency$_identifier'] ?? currencyCode,
  })), [currencyCode, data]);

  if (props.linesLayout === 'inlineEditable' && !props.addRow?.active) {
    return (
      <InlineLinesPanel
        ref={ref}
        columns={columns}
        data={enrichedData}
        {...props}
        data-testid="InlineLinesPanel__7a084c" />
    );
  }
  return (
    <DataTable
      columns={columns}
      filters={EMPTY_FILTERS}
      data={enrichedData}
      {...props}
      data-testid="DataTable__7a084c" />
  );
});

export default InvoiceLinesTable;
