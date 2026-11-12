import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useUI } from '@/i18n';
import { DateInput, Field } from '@/components/forms/fields';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect';
import { todayCalendarISO } from '@/lib/dateOnly.js';
import { GROUPING_OPTIONS, importFromBeyondFetchInterval } from './bankImportSettingsShared.js';

export { GROUPING_OPTIONS, importFromBeyondFetchInterval };

const GROUPING_FIELD = {
  key: 'statementGrouping',
  id: 'statementGrouping',
  name: 'statementGrouping',
  required: true,
  // Required, so there is nothing to clear back to.
  clearable: false,
};

const HELP_CLASS = 'text-xs text-[hsl(var(--muted-foreground))]';
const ERROR_CLASS = 'text-xs text-destructive';

/**
 * The default "Importar desde" for a new bank link: the first day of the current month, as a
 * `yyyy-MM-dd` string built from LOCAL calendar getters (never a parsed string), so a host west of
 * UTC does not land on the previous month on the evening of the 1st.
 *
 * @param {Date} [reference] the "now" to compute from (tests pin it)
 * @returns {string}
 */
export function defaultImportFromDate(reference = new Date()) {
  return todayCalendarISO(new Date(reference.getFullYear(), reference.getMonth(), 1));
}

/** True when either required import setting is still empty. */
export function importSettingsIncomplete({ importFromDate, statementGrouping } = {}) {
  return !importFromDate || !statementGrouping;
}

/**
 * "Importar desde" + "Agrupación de extractos" for a PSD2 bank connection (ETP-6151), shared by
 * the account-selection modal of the connect flow (`BankConnectionFlowUI`) and the bank panel of
 * `EditAccountModal`, so both ask for the same thing in the same words.
 *
 * Renders, in order: a grid with the date, any `children` (the edit panel slots "Importar hasta"
 * there) and the grouping select, each field with its help line and its required error; then the
 * `footer` slot (the edit panel's range error); then the fetch-interval advisory when the date
 * reaches further back than the bank serves. Returned as a FRAGMENT, so the caller's flex column
 * spaces them: in the edit panel the advisory must stay an immediate sibling of the re-auth banner
 * (ETP-5181 QA CP-2 — the panel's standing notices read as one stacked block).
 *
 * Help is inline text under each field rather than a prop of `Field` — `components/forms/fields.jsx`
 * has no help slot and is shared far beyond this window.
 *
 * Required errors appear for a field the user has emptied (tracked here) or for every empty field
 * once `showRequiredErrors` is set (the edit panel sets it as soon as the bank section is dirty).
 *
 * @param {{
 *   importFromDate: string,
 *   statementGrouping: string,
 *   onChange: (patch: { importFromDate?: string, statementGrouping?: string }) => void,
 *   maxFetchInterval?: number,
 *   showRequiredErrors?: boolean,
 *   testIdPrefix?: string,
 *   gridClassName?: string,
 *   children?: import('react').ReactNode,
 *   footer?: import('react').ReactNode,
 * }} props
 */
export function BankImportSettingsFields({
  importFromDate,
  statementGrouping,
  onChange,
  maxFetchInterval,
  showRequiredErrors = false,
  testIdPrefix = 'bank-connection',
  gridClassName = 'sm:grid-cols-2',
  children = null,
  footer = null,
}) {
  const ui = useUI();
  const [touched, setTouched] = useState({ importFromDate: false, statementGrouping: false });
  const fetchIntervalWarning = importFromBeyondFetchInterval(importFromDate, maxFetchInterval);
  const hasLimit = Number.isFinite(maxFetchInterval) && maxFetchInterval > 0;
  const fromMissing = !importFromDate && (showRequiredErrors || touched.importFromDate);
  const groupingMissing = !statementGrouping && (showRequiredErrors || touched.statementGrouping);

  const change = (key, value) => {
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
    onChange?.({ [key]: value });
  };

  return (
    <>
      <div className={`grid grid-cols-1 items-start gap-4 ${gridClassName}`}>
        <div className="flex flex-col gap-1">
          <DateInput
            label={ui('financeAccountsBankConnectionImportFrom')}
            required
            name={`${testIdPrefix}-import-from`}
            value={importFromDate || ''}
            onChange={(v) => change('importFromDate', v || '')}
            data-testid="DateInput__bankimport" />
          <p className={HELP_CLASS} data-testid={`${testIdPrefix}-import-from-help`}>
            {ui('financeAccountsBankConnectionImportFromHelp')}
            {hasLimit
              ? ` ${ui('financeAccountsBankConnectionImportFromHelpLimit', { days: maxFetchInterval })}`
              : null}
          </p>
          {fromMissing ? (
            <p className={ERROR_CLASS} data-testid={`${testIdPrefix}-import-from-required`}>
              {ui('financeAccountsBankConnectionImportFromRequired')}
            </p>
          ) : null}
        </div>
        {children}
        <div className="flex flex-col gap-1">
          <Field label={ui('financeAccountsBankConnectionGrouping')} required data-testid="Field__bankimport">
            {/* White wrapper: the picker's box is bg-transparent (built for white cards), so on the
                edit panel's gray card it would blend in — the white backing makes it stand out. */}
            <div className="rounded-lg bg-card">
              <CreatableSearchSelect
                field={GROUPING_FIELD}
                value={statementGrouping || ''}
                displayValue={statementGrouping
                  ? ui(`financeAccountsBankConnectionGrouping_${statementGrouping}`) : ''}
                onChange={(id) => change('statementGrouping', id || '')}
                formData={{ importFromDate, statementGrouping }}
                resolvedLabel={ui('financeAccountsBankConnectionGrouping')}
                placeholderOverride={ui('financeAccountsBankConnectionGroupingPlaceholder')}
                staticOptions={GROUPING_OPTIONS.map((o) => ({
                  id: o, name: ui(`financeAccountsBankConnectionGrouping_${o}`),
                }))}
                data-testid={`${testIdPrefix}-grouping`} />
            </div>
          </Field>
          <p className={HELP_CLASS} data-testid={`${testIdPrefix}-grouping-help`}>
            {statementGrouping && GROUPING_OPTIONS.includes(statementGrouping)
              ? ui(`financeAccountsBankConnectionGroupingHelp_${statementGrouping}`)
              : ui('financeAccountsBankConnectionGroupingHelp')}
          </p>
          {groupingMissing ? (
            <p className={ERROR_CLASS} data-testid={`${testIdPrefix}-grouping-required`}>
              {ui('financeAccountsBankConnectionGroupingRequired')}
            </p>
          ) : null}
        </div>
      </div>

      {footer}

      {fetchIntervalWarning ? (
        <div
          className="flex items-center gap-2 rounded-lg bg-[var(--status-warning-bg)] px-3 py-3"
          data-testid={`${testIdPrefix}-import-fetch-interval-warning`}
        >
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-[var(--status-warning-fg)]"
            data-testid="AlertTriangle__bankimport" />
          <span className="text-sm font-medium text-[var(--status-warning-fg)]">
            {ui('financeAccountsBankConnectionImportBeyondFetchInterval', {
              days: fetchIntervalWarning.days,
            })}
          </span>
        </div>
      ) : null}
    </>
  );
}
