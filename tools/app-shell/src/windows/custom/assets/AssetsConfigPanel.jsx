import { useEffect } from 'react';
import { EntityForm } from '@/components/contract-ui';
import { useUI } from '@/i18n';

function SectionCard({ title, description, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        {title && <div className="text-sm font-semibold text-gray-800">{title}</div>}
        {description && <div className={`text-xs text-gray-400${title ? ' mt-0.5' : ''}`}>{description}</div>}
      </div>
      {children}
    </div>
  );
}

function ToggleCard({ label, description, fieldKey, value, onChange, editing }) {
  const isOn = value === true || value === 'Y';

  function handleToggle() {
    if (!editing) return;
    onChange?.(fieldKey, !isOn);
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {description && <div className="text-xs text-gray-400 mt-0.5">{description}</div>}
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={!editing}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
          ${isOn ? 'bg-gray-900' : 'bg-gray-200'}
          ${!editing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-checked={isOn}
        role="switch"
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
            ${isOn ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

function isDepreciate(record) {
  return record.depreciate === true || record.depreciate === 'Y';
}

export default function AssetsConfigPanel({ data, token, apiBaseUrl, catalogs, api, editing, onChange }) {
  const ui = useUI();

  // Register pre-filled currency for new records so it's not dropped on save.
  // EntityForm here doesn't receive registerFields, so we mark currency as
  // user-touched via onChange to prevent the legacy-numeric-ID skip in useEntity.
  useEffect(() => {
    if (!data?.id && data?.currency) {
      onChange?.('currency', data.currency);
    }
  }, [data?.id, data?.currency, onChange]);

  const currencyFields = [
    { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: ui('assetsCurrencyLabel'), section: 'other', reference: 'Currency', inputMode: 'selector', defaultValue: '@C_Currency_ID@', readOnlyLogic: (record) => Number(record.depreciatedPlan || 0) > 0 || Number(record.depreciatedValue || 0) > 0 },
  ];

  const dateFields = [
    { key: 'purchaseDate', column: 'Datepurchased', type: 'date', label: ui('assetsPurchaseDateLabel'), section: 'other' },
    { key: 'cancellationDate', column: 'Cancellationdate', type: 'date', label: ui('assetsCancellationDateLabel'), section: 'other' },
    { key: 'depreciationStartDate', column: 'Amortizationstartdate', type: 'date', label: ui('assetsDepStartDateLabel'), section: 'other' },
    { key: 'depreciationEndDate', column: 'Amortizationenddate', type: 'date', label: ui('assetsDepEndDateLabel'), section: 'other' },
  ];

  const amtFields = [
    { key: 'assetValue', column: 'AssetValueAmt', type: 'number', label: ui('assetsAssetValueLabel'), section: 'other' },
    { key: 'residualAssetValue', column: 'Residualassetvalueamt', type: 'number', label: ui('assetsResidualValueLabel'), section: 'other' },
    { key: 'depreciationAmt', column: 'Amortizationvalueamt', type: 'number', label: ui('assetsDepreciationAmtLabel'), section: 'other' },
    { key: 'previouslyDepreciatedAmt', column: 'Depreciatedpreviousamt', type: 'number', label: ui('assetsPrevDepreciatedLabel'), section: 'other', defaultValue: '0' },
  ];
  const d = data ?? {};
  const depreciate = isDepreciate(d);

  const deprecFields = [
    { key: 'depreciationType', column: 'Amortizationtype', type: 'select', label: ui('assetsOptLinear'), required: true, section: 'other', options: [{ value: 'LI', label: ui('assetsOptLinear') }] },
    { key: 'calculateType', column: 'Amortizationcalctype', type: 'select', required: true, section: 'other', options: [{ value: 'PE', label: ui('assetsOptPercentage') }, { value: 'TI', label: ui('assetsOptTime') }] },
    { key: 'annualDepreciation', column: 'Amortizationpercentage', type: 'number', label: ui('assetsAnnualDepreciationLabel'), section: 'other', displayLogic: (record) => isDepreciate(record) && record.calculateType !== 'TI' },
    { key: 'amortize', column: 'Assetschedule', type: 'select', required: true, section: 'other', options: [{ value: 'MO', label: ui('assetsOptMonthly') }, { value: 'YE', label: ui('assetsOptYearly') }], displayLogic: (record) => isDepreciate(record) && record.calculateType === 'TI' },
    { key: 'usableLifeYears', column: 'UseLifeYears', type: 'number', section: 'other', displayLogic: (record) => isDepreciate(record) && record.calculateType === 'TI' && record.amortize === 'YE' },
    { key: 'usableLifeMonths', column: 'UseLifeMonths', type: 'number', section: 'other', displayLogic: (record) => isDepreciate(record) && record.calculateType === 'TI' && record.amortize !== 'YE' },
  ];

  function makeDisplayLogic(fields) {
    const readOnly = {};
    if (!editing) fields.forEach(f => { readOnly[f.key] = true; });
    const visibility = {};
    fields.forEach(f => {
      if (f.displayLogic) {
        const show = f.displayLogic(d);
        if (!show) visibility[f.key] = false;
      }
    });
    return { readOnly, visibility };
  }

  const common = { data: d, onChange, catalogs, api, token, apiBaseUrl, entity: 'assets', layout: 'horizontal' };

  return (
    <div className="space-y-4 pb-6 bg-white [&_input]:bg-white [&_textarea]:bg-white [&_textarea:disabled]:!bg-white [&_textarea:disabled]:opacity-50">
      <SectionCard
        title={null}
        description={ui('assetsConfigDesc')}
        data-testid="SectionCard__56e730">
        <div className="space-y-4">
          <EntityForm
            fields={currencyFields}
            {...common}
            displayLogic={makeDisplayLogic(currencyFields)}
            data-testid="EntityForm__56e730" />
          <div className="grid grid-cols-2 gap-4">
            <ToggleCard
              label={ui('assetsDepreciateLabel')}
              description={ui('assetsDepreciateDesc')}
              fieldKey="depreciate"
              value={d.depreciate}
              onChange={onChange}
              editing={editing}
              data-testid="ToggleCard__56e730" />
            {depreciate && d.calculateType === 'TI' && (
              <ToggleCard
                label={ui('assets30DaysLabel')}
                description={ui('assets30DaysDesc')}
                fieldKey="everyMonthIs30Days"
                value={d.everyMonthIs30Days}
                onChange={onChange}
                editing={editing}
                data-testid="ToggleCard__56e730" />
            )}
          </div>
          {depreciate && (
            <>
              <EntityForm
                fields={deprecFields}
                {...common}
                displayLogic={makeDisplayLogic(deprecFields)}
                data-testid="EntityForm__56e730" />
              <EntityForm
                fields={dateFields}
                {...common}
                displayLogic={makeDisplayLogic(dateFields)}
                data-testid="EntityForm__56e730" />
              <EntityForm
                fields={amtFields}
                {...common}
                displayLogic={makeDisplayLogic(amtFields)}
                data-testid="EntityForm__56e730" />
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
