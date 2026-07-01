import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:Documentos
const columns = [
  { key: 'documentCategory', column: 'Docbasetype', type: 'enum', label: 'Document Category', enumLabels: { '---': '** New **', 'APC': 'AP Credit Memo', 'API': 'AP Invoice', 'APP': 'AP Payment', 'APPP': 'AP Payment Proposal', 'ARC': 'AR Credit Memo', 'ARI': 'AR Invoice', 'ARF': 'AR Pro Forma Invoice', 'ARR': 'AR Receipt', 'ARRP': 'AR Receivable Proposal', 'ARI_RM': 'AR Return Material Invoice', 'AMZ': 'Amortization', 'CMB': 'Bank Statement', 'BSF': 'Bank Statement File', 'CMC': 'Cash Journal', 'CAD': 'Cost Adjustment', 'DPM': 'Debt Payment Management', 'DDB': 'Doubtful Debt', 'FAT': 'Financial Account Transaction', 'GLD': 'GL Document', 'GLJ': 'GL Journal', 'IAU': 'Inventory Amount Update', 'LDC': 'Landed Cost', 'LCC': 'Landed Cost Cost', 'OBCVAT_MS': 'Manual Cash VAT Settlement', 'MXI': 'Match Invoice', 'MXP': 'Match PO', 'MMS': 'Material Delivery', 'MIC': 'Material Internal Consumption', 'MMM': 'Material Movement', 'MMI': 'Material Physical Inventory', 'MMP': 'Material Production', 'MMR': 'Material Receipt', 'CMA': 'Payment Allocation', 'PPR': 'Payment proposal', 'PJI': 'Project Issue', 'POO': 'Purchase Order', 'POR': 'Purchase Requisition', 'REC': 'Reconciliation', 'SOO': 'Sales Order', 'STT': 'Settlement', 'STM': 'Settlement manual', 'WRE': 'Work Requirement' }, required: true },
  { key: 'aDCreatefactTemplateID', column: 'AD_Createfact_Template_ID', type: 'selector', label: 'Accounting Template' },
  { key: 'allowNegative', column: 'AllowNegative', type: 'boolean', label: 'Allow negative', required: true },
  { key: 'active', column: 'Isactive', type: 'boolean', label: 'Active', required: true },
];
// @sf-generated-end columns:Documentos

const filters = [];

// @sf-generated-start component:DocumentosTable
const DocumentosTable = forwardRef(function DocumentosTable(props, ref) {
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

export default DocumentosTable;
// @sf-generated-end component:DocumentosTable
