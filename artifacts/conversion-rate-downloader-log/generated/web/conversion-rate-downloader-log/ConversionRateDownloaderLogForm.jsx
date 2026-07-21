import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:conversionRateDownloaderLog
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, readOnly: true, section: 'principal', defaultValue: 'Y' },
  { key: 'syncDate', column: 'sync_date', type: 'text', label: 'Sync Date', readOnly: true, section: 'principal' },
  { key: 'pairsUpdated', column: 'pairs_updated', type: 'number', label: 'Pairs Updated', readOnly: true, section: 'principal', defaultValue: '0' },
  { key: 'pairsFailed', column: 'pairs_failed', type: 'number', label: 'Pairs Failed', readOnly: true, section: 'principal', defaultValue: '0' },
  { key: 'errorDetail', column: 'error_detail', type: 'text', label: 'Error Detail', readOnly: true, section: 'principal' },
  { key: 'durationms', column: 'duration_ms', type: 'number', label: 'Duration (ms)', readOnly: true, section: 'principal' },
  { key: 'status', column: 'status', type: 'select', label: 'Status', readOnly: true, section: 'principal', options: [{ value: 'FAILED', label: 'FAILED', labels: {"es_ES":"FAILED"} }, { value: 'PARTIAL', label: 'PARTIAL', labels: {"es_ES":"PARTIAL"} }, { value: 'SUCCESS', label: 'SUCCESS', labels: {"es_ES":"SUCCESS"} }], defaultValue: 'SUCCESS' },
];
// @sf-generated-end fields:conversionRateDownloaderLog

// @sf-generated-start component:ConversionRateDownloaderLogForm
export default function ConversionRateDownloaderLogForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ConversionRateDownloaderLogForm
