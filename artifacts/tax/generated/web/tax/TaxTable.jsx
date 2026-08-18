import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';
import { Tag } from '@/components/ui/tag';
import { useUI } from '@/i18n';

function renderTaxRate(row) {
  const val = row?.rate;
  if (val == null) return '';
  if (val > 0)  return <Tag variant="green"   label={`+${val} %`} />;
  if (val === 0) return <Tag variant="neutral" label="0 %" />;
  return <Tag variant="red" label={`${val} %`} />;
}

function TaxScopeCell({ row, fieldKey }) {
  const ui = useUI();
  const value = fieldKey ? row?.[fieldKey] : (row?.applicableTo ?? row?.salesPurchaseType);
  const showSales    = value === 'B' || value === 'S';
  const showPurchase = value === 'B' || value === 'P';
  if (!showSales && !showPurchase) return value ?? '';
  return (
    <span className="inline-flex items-center gap-1">
      {showSales    && <Tag variant="blue"   label={ui('taxScopeSales')} />}
      {showPurchase && <Tag variant="purple" label={ui('taxScopePurchase')} />}
    </span>
  );
}

// @sf-generated-start columns:tax
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'rate', column: 'Rate', type: 'number', label: 'Rate', render: renderTaxRate, required: true },
  { key: 'applicableTo', column: 'SOPOType', type: 'enum', label: 'Sales/Purchase Type', enumLabels: { 'B': 'sopotypeB', 'P': 'sopotypeP', 'S': 'sopotypeS' }, render: (row) => <TaxScopeCell row={row} fieldKey="applicableTo" />, required: true },
];
// @sf-generated-end columns:tax

const filters = ['name'];

// @sf-generated-start component:TaxTable
const TaxTable = forwardRef(function TaxTable(props, ref) {
  // Inline-editable layout always uses InlineLinesPanel for existing rows so column
  // widths (flex layout) never shift when the add-row form opens. When addRow is
  // active we render a header-hidden, data-hidden DataTable below for just the
  // add-row form — it owns callouts, selectors, validation and the imperative flush
  // ref. The ref is forwarded to InlineLinesPanel so DetailView can flush pending
  // inline edits on global save.
  if (props.linesLayout === 'inlineEditable') {
    if (props.addRow?.active) {
      return (
        <>
          <InlineLinesPanel ref={ref} columns={columns} {...props} addRow={undefined} />
          <DataTable columns={columns} filters={filters} {...props} hideHeader hideDataRows />
        </>
      );
    }
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default TaxTable;
// @sf-generated-end component:TaxTable
