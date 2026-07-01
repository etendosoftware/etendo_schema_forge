import { useMemo } from 'react';
import { useUI } from '@/i18n';
import { DistinctValuesFilter } from '@/components/ui/distinct-values-filter';

const TYPE_CODES = ['BPD', 'BPW'];

const LABEL_KEY_BY_CODE = {
  BPD: 'financeAccountMovementsTypeBPD',
  BPW: 'financeAccountMovementsTypeBPW',
};

/**
 * Filter dropdown for movement trxType (BPD = incoming, BPW = outgoing).
 * Thin wrapper around the generic {@link DistinctValuesFilter}.
 *
 * @param {{ value: string|null, onChange: (v: string|null) => void }} props
 */
export function TypeFilter({ value, onChange }) {
  const ui = useUI();

  const labelMap = useMemo(() => {
    const map = {};
    for (const code of TYPE_CODES) {
      map[code] = ui(LABEL_KEY_BY_CODE[code]);
    }
    return map;
  }, [ui]);

  return (
    <DistinctValuesFilter
      value={value}
      onChange={onChange}
      codes={TYPE_CODES}
      labelFor={(code) => labelMap[code] ?? code}
      allLabel={ui('financeAccountMovementsFilterTypeAll')}
      searchPlaceholder={ui('financeAccountMovementsFilterTypeSearchPlaceholder')}
      popoverWidth="w-56"
      data-testid="DistinctValuesFilter__ab7f27" />
  );
}
