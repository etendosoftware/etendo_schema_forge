import { EntityForm } from '@/components/contract-ui';

function SectionCard({ title, description, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        {description && <div className="text-xs text-gray-400 mt-0.5">{description}</div>}
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
          ${isOn ? 'bg-blue-600' : 'bg-gray-200'}
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

const currencyFields = [
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', section: 'other', reference: 'Currency', inputMode: 'selector', defaultValue: '@C_Currency_ID@', readOnlyLogic: (record) => Number(record.depreciatedPlan || 0) > 0 || Number(record.depreciatedValue || 0) > 0 },
];

const deprecFields = [
  { key: 'depreciationType', column: 'Amortizationtype', type: 'select', label: 'Depreciation Type', required: true, section: 'other', options: [{ value: 'LI', label: 'Linear' }] },
  { key: 'calculateType', column: 'Amortizationcalctype', type: 'select', label: 'Calculate Type', required: true, section: 'other', options: [{ value: 'PE', label: 'Percentage' }, { value: 'TI', label: 'Time' }] },
  { key: 'annualDepreciation', column: 'Amortizationpercentage', type: 'number', label: 'Annual Depreciation %', section: 'other', displayLogic: (record) => isDepreciate(record) && record.calculateType !== 'TI' },
  { key: 'amortize', column: 'Assetschedule', type: 'select', label: 'Amortize', required: true, section: 'other', options: [{ value: 'MO', label: 'Monthly' }, { value: 'YE', label: 'Yearly' }], displayLogic: (record) => isDepreciate(record) && record.calculateType === 'TI' },
  { key: 'usableLifeYears', column: 'UseLifeYears', type: 'number', label: 'Useful Life - Years', section: 'other', displayLogic: (record) => isDepreciate(record) && record.calculateType === 'TI' && record.amortize === 'YE' },
  { key: 'usableLifeMonths', column: 'UseLifeMonths', type: 'number', label: 'Useful Life - Months', section: 'other', displayLogic: (record) => isDepreciate(record) && record.calculateType === 'TI' && record.amortize !== 'YE' },
];

const dateFields = [
  { key: 'purchaseDate', column: 'Datepurchased', type: 'date', label: 'Purchase Date', section: 'other' },
  { key: 'cancellationDate', column: 'Cancellationdate', type: 'date', label: 'Cancellation Date', section: 'other' },
  { key: 'depreciationStartDate', column: 'Amortizationstartdate', type: 'date', label: 'Depreciation Start Date', section: 'other' },
  { key: 'depreciationEndDate', column: 'Amortizationenddate', type: 'date', label: 'Depreciation End Date', section: 'other' },
];

const amtFields = [
  { key: 'assetValue', column: 'AssetValueAmt', type: 'number', label: 'Asset Value', section: 'other' },
  { key: 'residualAssetValue', column: 'Residualassetvalueamt', type: 'number', label: 'Residual Asset Value', section: 'other' },
  { key: 'depreciationAmt', column: 'Amortizationvalueamt', type: 'number', label: 'Depreciation Amount', section: 'other' },
  { key: 'previouslyDepreciatedAmt', column: 'Depreciatedpreviousamt', type: 'number', label: 'Previously Depreciated Amount', section: 'other', defaultValue: '0' },
];

export default function AssetsConfigPanel({ data, token, apiBaseUrl, catalogs, api, editing, onChange }) {
  const d = data ?? {};
  const depreciate = isDepreciate(d);

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
    <div className="space-y-4 pt-5 pb-6">
      <SectionCard
        title="Depreciation Setup"
        description="Keep the accounting setup in one structured view instead of mixing it with the amortization table."
      >
        <div className="space-y-4">
          <EntityForm
            fields={currencyFields}
            {...common}
            displayLogic={makeDisplayLogic(currencyFields)}
          />
          <div className="grid grid-cols-2 gap-4">
            <ToggleCard
              label="Depreciate"
              description="Enable depreciation for this asset."
              fieldKey="depreciate"
              value={d.depreciate}
              onChange={onChange}
              editing={editing}
            />
            {depreciate && d.calculateType === 'TI' && (
              <ToggleCard
                label="Every month is 30 days"
                description="Use 30-day months for depreciation calculation."
                fieldKey="everyMonthIs30Days"
                value={d.everyMonthIs30Days}
                onChange={onChange}
                editing={editing}
              />
            )}
          </div>
          {depreciate && (
            <>
              <EntityForm
                fields={deprecFields}
                {...common}
                displayLogic={makeDisplayLogic(deprecFields)}
              />
              <EntityForm
                fields={dateFields}
                {...common}
                displayLogic={makeDisplayLogic(dateFields)}
              />
              <EntityForm
                fields={amtFields}
                {...common}
                displayLogic={makeDisplayLogic(amtFields)}
              />
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
