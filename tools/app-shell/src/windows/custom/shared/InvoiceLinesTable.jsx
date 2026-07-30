import { forwardRef, useMemo } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';
import { useCurrency } from '@/hooks/useCurrency';
import { useLabel, useUI } from '@/i18n';

const EMPTY_FILTERS = [];

// ETP-4529 — candidates for the `dimensionsPanel` column (see below). Superseded
// ETP-4543's two always-declared plain columns (see the removed `project`/
// `costcenter` entries this replaces) with the shared expand-row "Dimensiones
// contables" UX Amortización already used — a coordinator-approved UX correction,
// not a revert: plain grid columns read as permanently-visible fields even when a
// client has no accounting-dimension config at all, whereas the expand panel only
// invites the user in when there's something to show (or fill).
const DIMENSION_FIELD_CANDIDATES_BASE = [
  { key: 'project', column: 'C_Project_ID', type: 'selector', lookup: true },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector' },
];

const InvoiceLinesTable = forwardRef(function InvoiceLinesTable({ data, productRequired = false, taxRequired = false, ...props }, ref) {
  const currencyCode = useCurrency();
  const t = useLabel();
  const ui = useUI();

  // ETP-4529 — mirrors AmortizationLinesTable's own `useAccountingDimensionFields`
  // call, but resolved from `hiddenColumns` (already computed by DetailView's
  // `lineDisplayLogic.visibility` — see DetailView.jsx's `lineHiddenColumns`)
  // instead of calling the hook directly here. `data` on this component is the
  // ARRAY of already-fetched lines, not a single representative record, so it
  // cannot be passed as `useAccountingDimensionFields`'s `record` argument (that
  // hook's `useDisplayLogic` expects a single object with an `.id`); DetailView
  // already ran the equivalent evaluate-display call once for this entity and
  // forwards the result generically via `hiddenColumns` — reusing it here avoids
  // firing a second, redundant evaluate-display request per render.
  const dimensionFields = useMemo(
    () => DIMENSION_FIELD_CANDIDATES_BASE
      .filter(f => !(props.hiddenColumns ?? []).includes(f.key))
      .map(f => ({ ...f, label: t(f.column) })),
    [props.hiddenColumns, t]
  );

  const columns = useMemo(() => ([
    { key: 'product', column: 'M_Product_ID', type: 'selector', label: t('M_Product_ID'), lookup: true, ...(productRequired ? { required: true } : {}) },
    { key: 'description', column: 'Description', type: 'string', label: t('Description') },
    { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', label: t('QtyInvoiced'), required: true },
    { key: 'listPrice', column: 'PriceList', type: 'amount', label: t('PriceList'), required: true },
    { key: 'etgoDiscount', column: 'EM_Etgo_Discount', type: 'number', label: t('EM_Etgo_Discount') },
    { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: t('C_Tax_ID'), ...(taxRequired ? { required: true } : {}) },
    { key: 'grossAmount', column: 'Line_Gross_Amount', type: 'amount', label: t('Line_Gross_Amount') },
    // ETP-4529 — one dimensionsPanel column instead of the two plain project/
    // costcenter columns above (see DIMENSION_FIELD_CANDIDATES_BASE). Dropped
    // entirely when every candidate is hidden, so a client with dimensions fully
    // disabled sees no dead column/chevron at all.
    ...(dimensionFields.length > 0 ? [{
      key: 'dimensions',
      type: 'dimensionsPanel',
      label: ui('dimensionsPanelTitle'),
      dimensionFields,
    }] : []),
  ]), [dimensionFields, productRequired, t, taxRequired, ui]);

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
