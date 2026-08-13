import { useUI } from '@/i18n';
import { DateRangePopover } from '@/components/ui/date-range-popover';

/**
 * Filter for movement date range. Thin wrapper around the generic
 * DateRangePopover so the movements toolbar uses the same picker as
 * the contract-ui list grids.
 *
 * value:
 *   - null
 *   - { presetId: 'today'|'yesterday'|'last7'|'last30'|'last12m' }
 *   - { from: Date, to: Date }
 *
 * @param {{
 *   value: null | { presetId: string } | { from: Date, to: Date };
 *   onChange: (value: null | { presetId: string } | { from: Date, to: Date }) => void;
 * }} props
 */
export function DateRangeFilter({ value, onChange }) {
  const ui = useUI();
  return (
    <DateRangePopover
      value={value}
      onChange={onChange}
      placeholder={ui('dateRangeAnyTime')}
      data-testid="DateRangePopover__f6e6a4" />
  );
}
