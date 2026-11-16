import { AlertTriangle } from 'lucide-react';
import { useUI } from '@/i18n';
import { DateInput, Field } from '@/components/forms/fields';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect';
import { GROUPING_OPTIONS } from './bankImportSettingsShared.js';

/**
 * The bank-connection import settings of `EditAccountModal` as they were before ETP-6151 — the
 * rendering used while flag `psd2-statement-import-settings` is OFF: the three-column grid
 * (Importar desde / Importar hasta / grouping with its empty "Por defecto" option), no required
 * rule, no help text, then the range error and the ETP-5181 fetch-interval notice. Owned by the
 * flag: deleted with it when the flag retires (the ON rendering is `BankImportSettingsFields`).
 *
 * @param {{
 *   bankConnection: object,
 *   warningTone: { bg: string, fg: string },
 * }} props `warningTone` is the modal's warning banner tone (`BANNER_TONE_CLASSES.warning`)
 */
export function LegacyBankImportSettings({ bankConnection, warningTone }) {
  const ui = useUI();
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DateInput
          label={ui('financeAccountsBankConnectionImportFrom')}
          name="bank-connection-import-from"
          value={bankConnection.form.importFromDate || ''}
          onChange={(v) => bankConnection.setForm((f) => ({ ...f, importFromDate: v }))}
          data-testid="DateInput__73027d" />
        <DateInput
          label={ui('financeAccountsBankConnectionImportTo')}
          name="bank-connection-import-to"
          value={bankConnection.form.importToDate || ''}
          onChange={(v) => bankConnection.setForm((f) => ({ ...f, importToDate: v }))}
          data-testid="DateInput__73027d" />
        <Field label={ui('financeAccountsBankConnectionGrouping')} data-testid="Field__73027d">
          {/* White wrapper: the picker's box is bg-transparent (built for white cards),
              so on this gray card it blends in — the white backing makes it stand out. */}
          <div className="rounded-lg bg-card">
            <CreatableSearchSelect
              field={{ key: 'statementGrouping', id: 'statementGrouping', name: 'statementGrouping' }}
              value={bankConnection.form.statementGrouping || ''}
              displayValue={bankConnection.form.statementGrouping
                ? ui(`financeAccountsBankConnectionGrouping_${bankConnection.form.statementGrouping}`) : ''}
              onChange={(id) => bankConnection.setForm((f) => ({ ...f, statementGrouping: id || '' }))}
              formData={bankConnection.form}
              resolvedLabel={ui('financeAccountsBankConnectionGrouping')}
              emptyOptionLabel={ui('financeAccountsBankConnectionGroupingNone')}
              staticOptions={GROUPING_OPTIONS.map((o) => ({
                id: o, name: ui(`financeAccountsBankConnectionGrouping_${o}`),
              }))}
              data-testid="bank-connection-edit-grouping" />
          </div>
        </Field>
      </div>

      {/* ETP-5104. Sits under the whole grid rather than inside one Field: the error belongs to the
          PAIR of dates, and `Field` has no error slot anyway (components/forms/fields.jsx). */}
      {bankConnection.rangeInvalid ? (
        <p className="text-xs text-destructive" data-testid="bank-connection-import-range-error">
          {ui('financeAccountsBankConnectionImportRangeInvalid')}
        </p>
      ) : null}

      {/* ETP-5181 QA CP-2. Stacked at the foot of the panel with the re-authorization notice. */}
      {bankConnection.fetchIntervalWarning ? (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-3 ${warningTone.bg}`}
          data-testid="bank-connection-import-fetch-interval-warning"
        >
          <AlertTriangle
            className={`h-4 w-4 shrink-0 ${warningTone.fg}`}
            data-testid="AlertTriangle__73027d" />
          <span className={`text-sm font-medium ${warningTone.fg}`}>
            {ui('financeAccountsBankConnectionImportBeyondFetchInterval', {
              days: bankConnection.fetchIntervalWarning.days,
            })}
          </span>
        </div>
      ) : null}
    </>
  );
}
