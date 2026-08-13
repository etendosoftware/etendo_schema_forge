import { useMemo } from 'react';
import { useUI } from '@/i18n';
import { DistinctValuesFilter } from '@/components/ui/distinct-values-filter';
import { MOVEMENT_STATUS_CONFIG, ALL_STATUSES } from '../movementStatusConfig';

/**
 * Filter dropdown for movement payment status. Thin wrapper around
 * the generic {@link DistinctValuesFilter} for the 8 fixed status codes.
 *
 * @param {{ value: string|null, onChange: (v: string|null) => void }} props
 */
export function StatusFilter({ value, onChange }) {
  const ui = useUI();

  const labelMap = useMemo(() => {
    const map = {};
    for (const key of ALL_STATUSES) {
      map[key] = ui(MOVEMENT_STATUS_CONFIG[key].labelKey);
    }
    return map;
  }, [ui]);

  return (
    <DistinctValuesFilter
      value={value}
      onChange={onChange}
      codes={ALL_STATUSES}
      labelFor={(code) => labelMap[code] ?? code}
      allLabel={ui('financeAccountMovementsFilterAllStatuses')}
      searchPlaceholder={ui('searchStatuses')}
      data-testid="DistinctValuesFilter__15378f" />
  );
}
