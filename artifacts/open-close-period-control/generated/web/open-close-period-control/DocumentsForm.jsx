import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:documents
const fields = [
  { key: 'periodStatus', column: 'PeriodStatus', type: 'select', label: 'Period Status', readOnly: true, section: 'other', options: [{ value: 'C', label: 'Closed' }, { value: 'N', label: 'Never opened' }, { value: 'O', label: 'Open' }, { value: 'P', label: 'Permanently closed' }], defaultValue: 'N' },
  { key: 'documentCategory', column: 'DocBaseType', type: 'select', label: 'Document Category', required: true, readOnly: true, section: 'other', options: [{ value: '---', label: '** New **' }, { value: 'APC', label: 'AP Credit Memo' }, { value: 'API', label: 'AP Invoice' }, { value: 'APP', label: 'AP Payment' }, { value: 'APPP', label: 'AP Payment Proposal' }, { value: 'ARC', label: 'AR Credit Memo' }, { value: 'ARI', label: 'AR Invoice' }, { value: 'ARF', label: 'AR Pro Forma Invoice' }, { value: 'ARR', label: 'AR Receipt' }, { value: 'ARRP', label: 'AR Receivable Proposal' }, { value: 'ARI_RM', label: 'AR Return Material Invoice' }, { value: 'AMZ', label: 'Amortization' }, { value: 'CMB', label: 'Bank Statement' }, { value: 'BSF', label: 'Bank Statement File' }, { value: 'CMC', label: 'Cash Journal' }, { value: 'CAD', label: 'Cost Adjustment' }, { value: 'DPM', label: 'Debt Payment Management' }, { value: 'DDB', label: 'Doubtful Debt' }, { value: 'FAT', label: 'Financial Account Transaction' }, { value: 'GLD', label: 'GL Document' }, { value: 'GLJ', label: 'GL Journal' }, { value: 'IAU', label: 'Inventory Amount Update' }, { value: 'LDC', label: 'Landed Cost' }, { value: 'LCC', label: 'Landed Cost Cost' }, { value: 'OBCVAT_MS', label: 'Manual Cash VAT Settlement' }, { value: 'MXI', label: 'Match Invoice' }, { value: 'MXP', label: 'Match PO' }, { value: 'MMS', label: 'Material Delivery' }, { value: 'MIC', label: 'Material Internal Consumption' }, { value: 'MMM', label: 'Material Movement' }, { value: 'MMI', label: 'Material Physical Inventory' }, { value: 'MMP', label: 'Material Production' }, { value: 'MMR', label: 'Material Receipt' }, { value: 'CMA', label: 'Payment Allocation' }, { value: 'PPR', label: 'Payment proposal' }, { value: 'PJI', label: 'Project Issue' }, { value: 'POO', label: 'Purchase Order' }, { value: 'POR', label: 'Purchase Requisition' }, { value: 'REC', label: 'Reconciliation' }, { value: 'SOO', label: 'Sales Order' }, { value: 'STT', label: 'Settlement' }, { value: 'STM', label: 'Settlement manual' }, { value: 'WRE', label: 'Work Requirement' }] },
];
// @sf-generated-end fields:documents

// @sf-generated-start component:DocumentsForm
export default function DocumentsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:DocumentsForm
