import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:transaction
const columns = [
  { key: 'transactionDate', column: 'Statementdate', type: 'date', label: 'Transaction Date', required: true },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Payment No.', required: true },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'selector', label: 'Business Partner' },
  { key: 'description', column: 'Description', type: 'string', label: 'Description' },
  { key: 'status', column: 'Status', type: 'status', label: 'Status', enumLabels: { 'RPAP': 'Awaiting Payment', 'RPAE': 'Awaiting Execution', 'RPVOID': 'Void', 'PPM': 'Payment Made', 'RPR': 'Payment Received', 'RDNC': 'Deposited not Cleared', 'PWNC': 'Withdrawn not Cleared', 'RPPC': 'Payment Cleared' }, required: true },
  { key: 'transactionType', column: 'Trxtype', type: 'enum', label: 'Transaction Type', enumLabels: { 'BPD': 'BP Deposit', 'BPW': 'BP Withdrawal', 'BF': 'Bank fee' }, required: true },
  { key: 'gLItem', column: 'C_Glitem_ID', type: 'selector', label: 'G/L Item' },
  { key: 'posted', column: 'Posted', type: 'boolean', label: 'Posted', badge: true, badgeLabels: {"true":{"en_US":"Posted","es_ES":"Contabilizado"},"false":{"en_US":"Not posted","es_ES":"Sin contabilizar"}}, badgeVariants: {"true":"green","false":"orange"}, required: true },
];
// @sf-generated-end columns:transaction

const filters = [];

// @sf-generated-start component:TransactionTable
const TransactionTable = forwardRef(function TransactionTable(props, ref) {
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

export default TransactionTable;
// @sf-generated-end component:TransactionTable
