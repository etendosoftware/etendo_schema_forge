import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:conversionRateDownloaderLog
const columns = [
  { key: 'syncDate', column: 'sync_date', type: 'string', label: 'Sync Date' },
  { key: 'pairsUpdated', column: 'pairs_updated', type: 'number', label: 'Pairs Updated' },
  { key: 'pairsFailed', column: 'pairs_failed', type: 'number', label: 'Pairs Failed' },
  { key: 'durationms', column: 'duration_ms', type: 'number', label: 'Duration (ms)' },
  { key: 'status', column: 'status', type: 'status', label: 'Status', enumLabels: { 'FAILED': 'statusFailed', 'PARTIAL': 'statusPartial', 'SUCCESS': 'statusSuccess' } },
];
// @sf-generated-end columns:conversionRateDownloaderLog

const filters = ['syncDate', 'status'];

// @sf-generated-start component:ConversionRateDownloaderLogTable
const ConversionRateDownloaderLogTable = forwardRef(function ConversionRateDownloaderLogTable(props, ref) {
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

export default ConversionRateDownloaderLogTable;
// @sf-generated-end component:ConversionRateDownloaderLogTable
