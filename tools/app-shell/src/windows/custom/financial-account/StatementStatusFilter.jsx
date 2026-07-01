import { useMemo } from 'react';
import { useUI } from '@/i18n';
import { DistinctValuesFilter } from '@/components/ui/distinct-values-filter';

const STATEMENT_STATUSES = ['DRAFT', 'PENDING', 'PARTIAL', 'RECONCILED'];

const LABEL_KEYS = {
  DRAFT:      'financeAccountStatementsStatusDraft',
  PENDING:    'financeAccountStatementsStatusPending',
  PARTIAL:    'financeAccountStatementsStatusPartial',
  RECONCILED: 'financeAccountStatementsStatusReconciled',
};

/**
 * Filter dropdown for the imported-statement status. Thin wrapper around
 * {@link DistinctValuesFilter} for the derived statuses
 * (DRAFT / PENDING / PARTIAL / RECONCILED).
 *
 * @param {{ value: string|null, onChange: (v: string|null) => void }} props
 */
export function StatementStatusFilter({ value, onChange }) {
  const ui = useUI();

  const labelMap = useMemo(() => {
    const map = {};
    for (const key of STATEMENT_STATUSES) {
      map[key] = ui(LABEL_KEYS[key]);
    }
    return map;
  }, [ui]);

  return (
    <DistinctValuesFilter
      value={value}
      onChange={onChange}
      codes={STATEMENT_STATUSES}
      labelFor={(code) => labelMap[code] ?? code}
      allLabel={ui('financeAccountStatementsFilterAllStatuses')}
      searchPlaceholder={ui('searchStatuses')}
      data-testid="DistinctValuesFilter__de91e6" />
  );
}
