import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:documents
const columns = [
  { key: 'documentCategory', column: 'DocBaseType', type: 'enum', label: 'Document Category', enumLabels: { '---': 'docBaseTypeMinusMinusMinus', 'APC': 'docBaseTypeApc', 'API': 'docBaseTypeApi', 'APP': 'docBaseTypeApp', 'APPP': 'docBaseTypeAppp', 'ARC': 'docBaseTypeArc', 'ARI': 'docBaseTypeAri', 'ARF': 'docBaseTypeArf', 'ARR': 'docBaseTypeArr', 'ARRP': 'docBaseTypeArrp', 'ARI_RM': 'docBaseTypeAriRm', 'AMZ': 'docBaseTypeAmz', 'CMB': 'docBaseTypeCmb', 'BSF': 'docBaseTypeBsf', 'CMC': 'docBaseTypeCmc', 'CAD': 'docBaseTypeCad', 'DPM': 'docBaseTypeDpm', 'DDB': 'docBaseTypeDdb', 'FAT': 'docBaseTypeFat', 'GLD': 'docBaseTypeGld', 'GLJ': 'docBaseTypeGlj', 'IAU': 'docBaseTypeIau', 'LDC': 'docBaseTypeLdc', 'LCC': 'docBaseTypeLcc', 'OBCVAT_MS': 'docBaseTypeObcvatMs', 'MXI': 'docBaseTypeMxi', 'MXP': 'docBaseTypeMxp', 'MMS': 'docBaseTypeMms', 'MIC': 'docBaseTypeMic', 'MMM': 'docBaseTypeMmm', 'MMI': 'docBaseTypeMmi', 'MMP': 'docBaseTypeMmp', 'MMR': 'docBaseTypeMmr', 'CMA': 'docBaseTypeCma', 'PPR': 'docBaseTypePpr', 'PJI': 'docBaseTypePji', 'POO': 'docBaseTypePoo', 'POR': 'docBaseTypePor', 'REC': 'docBaseTypeRec', 'SOO': 'docBaseTypeSoo', 'STT': 'docBaseTypeStt', 'STM': 'docBaseTypeStm', 'WRE': 'docBaseTypeWre' }, required: true },
  { key: 'periodStatus', column: 'PeriodStatus', type: 'enum', label: 'Period Status', enumLabels: { 'C': 'periodStatusC', 'N': 'periodStatusN', 'O': 'periodStatusO', 'P': 'periodStatusP' }, enumVariants: {"O":"green","N":"neutral","C":"red","P":"red"}, badge: true },
];
// @sf-generated-end columns:documents

const filters = [];

// @sf-generated-start component:DocumentsTable
const DocumentsTable = forwardRef(function DocumentsTable(props, ref) {
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

export default DocumentsTable;
// @sf-generated-end component:DocumentsTable
