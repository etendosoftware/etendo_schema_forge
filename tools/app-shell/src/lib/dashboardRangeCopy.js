// ETP-5493: maps a dashboard range key to the suffix of its copy fragments
// (`financialSummaryPeriod<Suffix>` / `financialSummaryComparison<Suffix>`), shared by the
// "Resumen financiero" and "Evolucion financiera" cards so both describe the period the same way.
export const RANGE_COPY_SUFFIX = {
  ytd: 'Ytd',
  mtd: 'Mtd',
  last30d: 'Last30d',
  last90d: 'Last90d',
  lastYear: 'LastYear',
};

/** An unknown non-blank range is resolved by the backend like the rolling last 12 months. */
const UNKNOWN_RANGE_COPY_SUFFIX = RANGE_COPY_SUFFIX.lastYear;

/**
 * Copy suffix for `range`. A missing/blank range has no universal meaning: the backend defaults
 * differ per widget (`kpis` -> year-to-date, `trends` -> rolling 12 months), so the caller
 * states it through `missingSuffix` so the copy always matches the data it describes.
 */
export function resolveRangeCopySuffix(range, missingSuffix = RANGE_COPY_SUFFIX.ytd) {
  if (typeof range !== 'string' || range.trim() === '') return missingSuffix;
  return RANGE_COPY_SUFFIX[range.trim()] ?? UNKNOWN_RANGE_COPY_SUFFIX;
}
