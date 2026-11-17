import { Upload } from 'lucide-react';
import SegmentedTabs from '@/components/contract-ui/SegmentedTabs.jsx';
import { RefreshButton } from '@/components/contract-ui/RefreshButton.jsx';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { INBOX_FILTERS } from './invoiceInboxFilters.js';

/**
 * ETP-6049 — status tabs with their counters, "Actualizar" and "Cargar facturas".
 * A counter shows only once known (never a placeholder 0).
 */
export default function InvoiceInboxToolbar({ filterKey, onFilterChange, counts, onRefresh, onPick }) {
  const ui = useUI();
  const items = INBOX_FILTERS.map((filter) => {
    const count = counts?.[filter.key] ?? null;
    return {
      key: filter.key,
      label: ui(filter.labelKey),
      testId: `invoice-inbox-filter-${filter.key}`,
      count,
      countLabel: count == null ? undefined : ui('invoiceInboxCountAria', { count }),
      countTestId: `invoice-inbox-filter-count-${filter.key}`,
    };
  });
  const active = Math.max(0, INBOX_FILTERS.findIndex((filter) => filter.key === filterKey));
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="invoice-inbox-toolbar">
      <div className="min-w-0 max-w-full overflow-x-auto">
        <SegmentedTabs
          items={items}
          active={active}
          onChange={(index) => onFilterChange(INBOX_FILTERS[index].key)}
          ariaLabel={ui('invoiceInboxFiltersAria')}
          data-testid="SegmentedTabs__56539a" />
      </div>
      <span className="flex-1" />
      <span className="inline-flex" data-testid="invoice-inbox-refresh">
        <RefreshButton
          onRefresh={onRefresh}
          label={ui('refresh')}
          data-testid="RefreshButton__56539a" />
      </span>
      <Button type="button" onClick={onPick} className="h-10 rounded-lg" data-testid="invoice-inbox-upload-button">
        <Upload aria-hidden="true" data-testid="Upload__56539a" />
        {ui('invoiceInboxUploadButton')}
      </Button>
    </div>
  );
}
