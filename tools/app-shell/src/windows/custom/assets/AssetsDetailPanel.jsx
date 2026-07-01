import { useEffect, useRef } from 'react';
import { EntityForm } from '@/components/contract-ui';
import { PillToggle } from '@/components/PillToggle';
import { useUI } from '@/i18n';

function GroupHead({ title, description }) {
  return (
    <div>
      <div className="text-sm font-semibold text-[#121217] mb-4">{title}</div>
      {description && <div className="text-xs text-[#6C6C89] -mt-2 mb-4">{description}</div>}
    </div>
  );
}

function GroupDivider({ title, description }) {
  return (
    <div className="mt-5 border-t border-[#E8E8ED] pt-5">
      <GroupHead title={title} description={description} data-testid="GroupHead__8e32ca" />
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
    <div className="flex items-center justify-between rounded-xl border border-[#D1D1DB] bg-white p-4">
      <div>
        <div className="text-sm font-medium text-[#121217]">{label}</div>
        {description && <div className="text-xs text-[#6C6C89] mt-0.5">{description}</div>}
      </div>
      <PillToggle
        checked={isOn}
        disabled={!editing}
        onCheckedChange={handleToggle}
        aria-label={label}
        data-testid="PillToggle__8e32ca" />
    </div>
  );
}

function isDepreciate(record) {
  return record?.depreciate === true || record?.depreciate === 'Y';
}

// The Asset amount fields handled by the local recompute below.
const AMOUNT_FIELDS = new Set(['assetValue', 'residualAssetValue', 'depreciationAmt']);

// Round a currency amount to 2 decimals, avoiding JS float drift (e.g. 0.1 + 0.2).
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Local, synchronous replica of the core SL_Assets callout arithmetic.
 *
 * SOURCE OF TRUTH: org.openbravo.erpCommon.ad_callouts.SL_Assets#execute
 * (Etendo Classic, .../src/org/openbravo/erpCommon/ad_callouts/SL_Assets.java, lines 43-63).
 * If that Java arithmetic ever changes, THIS MUST CHANGE TOO — they must stay in sync.
 *
 * We compute locally instead of firing the async `/assets/callout` for these three fields
 * because the round-trip is racy: the Java `assetValue` branch only recomputes residual
 * `if (amort != 0)`, so a stale `amort=0` posted mid-race leaves residual unchanged
 * (the "Asset Value 4000 keeps Residual at -2000" bug). Local compute from the up-to-date
 * editing state is deterministic and faithful. ETP-4333.
 *
 * @param field one of 'assetValue' | 'residualAssetValue' | 'depreciationAmt'
 * @param asset/residual/amort current numeric values (callers coerce null/'' → 0)
 * @returns { assetValue, residualAssetValue, depreciationAmt } the recomputed triple
 */
export function computeAssetAmounts(field, asset, residual, amort) {
  let a = asset;
  let r = residual;
  let m = amort;
  if (field === 'assetValue') {
    // SL_Assets: if (amort != 0) residual = asset - amort;  then  amort = asset - residual;
    if (m !== 0) r = a - m;
    m = a - r;
  } else if (field === 'residualAssetValue') {
    // SL_Assets: amort = asset - residual;
    m = a - r;
  } else if (field === 'depreciationAmt') {
    // SL_Assets: residual = asset - amort;
    r = a - m;
  }
  return { assetValue: round2(a), residualAssetValue: round2(r), depreciationAmt: round2(m) };
}

export default function AssetsDetailPanel({ data, token, apiBaseUrl, catalogs, api, editing, onChange, onLocalChange }) {
  const ui = useUI();
  const d = data ?? {};
  const depreciate = isDepreciate(d);

  // Commit handler for the three Asset amount fields (assetValue, residualAssetValue,
  // depreciationAmt). Instead of firing the async SL_Assets callout, we replicate its
  // arithmetic LOCALLY and synchronously (computeAssetAmounts) and write the recomputed
  // triple straight into the form state via onLocalChange (= hook.handleChange, a local
  // setter that does NOT fire a callout). This is deterministic — no async round-trip to
  // race — and updates the sidebar "Current Value" and the sibling inputs immediately.
  // DeferredInput still defers each field's commit to blur; only the commit TARGET changed
  // from "fire callout" to "local recompute". Other fields keep the normal onChange (which
  // still fires the real callout). ETP-4333. See computeAssetAmounts for the Java source.
  const localSetterRef = useRef(onLocalChange);
  localSetterRef.current = onLocalChange;
  const fallbackOnChangeRef = useRef(onChange);
  fallbackOnChangeRef.current = onChange;
  function handleAmountChange(field, value, column) {
    if (!AMOUNT_FIELDS.has(field)) {
      onChange?.(field, value, column);
      return;
    }
    const setter = localSetterRef.current ?? fallbackOnChangeRef.current;
    const num = (x) => Number(x) || 0;
    const next = computeAssetAmounts(
      field,
      field === 'assetValue' ? num(value) : num(d.assetValue),
      field === 'residualAssetValue' ? num(value) : num(d.residualAssetValue),
      field === 'depreciationAmt' ? num(value) : num(d.depreciationAmt),
    );
    // Apply the full triple so the sidebar and all three inputs stay consistent. Writing
    // every field (even the unchanged trigger) keeps editing authoritative in one shot.
    setter?.('assetValue', next.assetValue);
    setter?.('residualAssetValue', next.residualAssetValue);
    setter?.('depreciationAmt', next.depreciationAmt);
  }

  // Echo the backend-provided default currency into the form's change handler exactly
  // once per new-record session. `onChange` (DetailView's handleChangeWithCallout) is
  // re-created whenever `hook.editing` changes identity, so including it in the deps —
  // or re-emitting on every render where currency is set — drives an effect→onChange→
  // setEditing→new onChange→effect feedback loop. That loop never trips React's
  // synchronous "Maximum update depth" guard (it cycles through the passive-effect
  // phase, one commit per frame), so it silently starves the render queue and freezes
  // route transitions (Cancel / sidebar navigation stop unmounting the detail view).
  // Guarding with a ref and excluding `onChange`/`d.currency` from the deps keeps the
  // echo to a single fire. See ETP-4333.
  const currencyEchoedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const isNewRecord = !d?.id;
  useEffect(() => {
    if (!isNewRecord) {
      currencyEchoedRef.current = false;
      return;
    }
    if (currencyEchoedRef.current) return;
    if (d?.currency) {
      currencyEchoedRef.current = true;
      onChangeRef.current?.('currency', d.currency);
    }
  }, [isNewRecord, d?.currency]);

  const common = { data: d, onChange, catalogs, api, token, apiBaseUrl, entity: 'assets', layout: 'horizontal' };

  const readOnlyAll = !editing ? { readOnly: Object.fromEntries([
    'searchKey','name','assetCategory','description',
    'currency','assetValue','residualAssetValue','depreciationAmt','previouslyDepreciatedAmt',
    'depreciate','everyMonthIs30Days','depreciationType','calculateType','annualDepreciation',
    'amortize','usableLifeYears','usableLifeMonths',
    'purchaseDate','cancellationDate','depreciationStartDate','depreciationEndDate',
    'project','eTADASCostCenter','businessPartner','eTADASUser1','eTADASUser2',
    'eTADASSalesRegion','eTADASActivity','eTADASSalesCampaign',
  ].map(k => [k, true])), visibility: {} } : { readOnly: {}, visibility: {} };

  const group1Fields = [
    { key: 'searchKey', column: 'Value', type: 'text', label: ui('Search Key'), required: true, section: 'principal' },
    { key: 'name', column: 'Name', type: 'text', label: ui('Name'), required: true, section: 'principal' },
    { key: 'assetCategory', column: 'A_Asset_Group_ID', type: 'selector', label: ui('Asset Category'), required: true, section: 'principal', reference: 'AssetGroup', inputMode: 'selector' },
    { key: 'description', column: 'Description', type: 'textarea', label: ui('Description'), section: 'other' },
  ];

  const group2Fields = [
    { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: ui('assetsCurrencyLabel'), section: 'principal', reference: 'Currency', inputMode: 'selector', defaultValue: '@C_Currency_ID@', readOnlyLogic: (record) => Number(record.depreciatedPlan || 0) > 0 || Number(record.depreciatedValue || 0) > 0 },
    // The Asset amount triple (AssetValue, ResidualAssetValue, DepreciationAmt). ETP-4333:
    //  • calloutOn: 'blur' — EntityForm renders these via DeferredInput: typing only updates a
    //    local buffer; on blur a single onChange commits the value. The deferral-to-blur UX
    //    stays; only the commit TARGET changed — see handleAmountChange below.
    //  • They do NOT fire the async /assets/callout. handleAmountChange (passed as this group's
    //    onChange) replicates the SL_Assets arithmetic LOCALLY and synchronously
    //    (computeAssetAmounts) and writes the recomputed triple via onLocalChange. Deterministic,
    //    no async round-trip to race. The Java remains the source of truth (see computeAssetAmounts).
    { key: 'assetValue', column: 'AssetValueAmt', type: 'number', label: ui('assetsAssetValueLabel'), section: 'principal', calloutOn: 'blur' },
    { key: 'residualAssetValue', column: 'Residualassetvalueamt', type: 'number', label: ui('assetsResidualValueLabel'), section: 'principal', calloutOn: 'blur' },
    { key: 'depreciationAmt', column: 'Amortizationvalueamt', type: 'number', label: ui('assetsDepreciationAmtLabel'), section: 'principal', calloutOn: 'blur' },
    { key: 'previouslyDepreciatedAmt', column: 'Depreciatedpreviousamt', type: 'number', label: ui('assetsPrevDepreciatedLabel'), section: 'principal', defaultValue: '0' },
  ];

  const deprecFields = [
    { key: 'depreciationType', column: 'Amortizationtype', type: 'select', label: ui('assetsOptLinear'), required: true, section: 'principal', options: [{ value: 'LI', label: ui('assetsOptLinear') }] },
    { key: 'calculateType', column: 'Amortizationcalctype', type: 'select', required: true, section: 'principal', options: [{ value: 'PE', label: ui('assetsOptPercentage') }, { value: 'TI', label: ui('assetsOptTime') }] },
    { key: 'annualDepreciation', column: 'Amortizationpercentage', type: 'number', label: ui('assetsAnnualDepreciationLabel'), section: 'principal', displayLogic: (record) => isDepreciate(record) && record.calculateType !== 'TI' },
    { key: 'amortize', column: 'Assetschedule', type: 'select', required: true, section: 'principal', options: [{ value: 'MO', label: ui('assetsOptMonthly') }, { value: 'YE', label: ui('assetsOptYearly') }], displayLogic: (record) => isDepreciate(record) && record.calculateType === 'TI' },
    { key: 'usableLifeYears', column: 'UseLifeYears', type: 'number', section: 'principal', displayLogic: (record) => isDepreciate(record) && record.calculateType === 'TI' && record.amortize === 'YE' },
    { key: 'usableLifeMonths', column: 'UseLifeMonths', type: 'number', section: 'principal', displayLogic: (record) => isDepreciate(record) && record.calculateType === 'TI' && record.amortize !== 'YE' },
  ];

  function makeDisplayLogic(fields) {
    const readOnly = { ...readOnlyAll.readOnly };
    const visibility = {};
    fields.forEach(f => {
      if (f.displayLogic) {
        if (!f.displayLogic(d)) visibility[f.key] = false;
      }
    });
    return { readOnly, visibility };
  }

  const dimensionFields = [
    { key: 'project', column: 'C_Project_ID', type: 'selector', section: 'principal', reference: 'Project', inputMode: 'selector' },
    { key: 'eTADASCostCenter', column: 'EM_Etadas_Costcenter_ID', type: 'selector', section: 'principal', reference: 'Costcenter', inputMode: 'selector' },
    { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', section: 'principal', reference: 'BPartner', inputMode: 'selector' },
    { key: 'eTADASUser1', column: 'EM_Etadas_User1_ID', type: 'selector', section: 'principal', reference: 'User1', inputMode: 'selector' },
    { key: 'eTADASUser2', column: 'EM_Etadas_User2_ID', type: 'selector', section: 'principal', reference: 'User2', inputMode: 'selector' },
    { key: 'eTADASSalesRegion', column: 'EM_Etadas_Salesregion_ID', type: 'selector', section: 'principal', reference: 'SalesRegion', inputMode: 'selector' },
    { key: 'eTADASActivity', column: 'EM_Etadas_C_Activity_ID', type: 'selector', section: 'principal', reference: 'Activity', inputMode: 'selector' },
    { key: 'eTADASSalesCampaign', column: 'EM_Etadas_Campaign_ID', type: 'selector', section: 'principal', reference: 'Campaign', inputMode: 'selector' },
  ];

  const dateFields = [
    { key: 'purchaseDate', column: 'Datepurchased', type: 'date', label: ui('assetsPurchaseDateLabel'), section: 'principal' },
    { key: 'cancellationDate', column: 'Cancellationdate', type: 'date', label: ui('assetsCancellationDateLabel'), section: 'principal' },
    { key: 'depreciationStartDate', column: 'Amortizationstartdate', type: 'date', label: ui('assetsDepStartDateLabel'), section: 'principal' },
    { key: 'depreciationEndDate', column: 'Amortizationenddate', type: 'date', label: ui('assetsDepEndDateLabel'), section: 'principal' },
  ];

  return (
    <div className="p-2 pb-6 bg-white overflow-y-auto max-h-[380px] [&_input]:bg-white [&_textarea]:bg-white [&_textarea:disabled]:!bg-white [&_textarea:disabled]:opacity-50">
      {/* Group 1 — Asset Info (no subtitle) */}
      <div className="mb-5">
        <EntityForm
          fields={group1Fields}
          {...common}
          displayLogic={readOnlyAll}
          data-testid="EntityForm__8e32ca" />
      </div>
      {/* Group 3 — Depreciation Config */}
      <GroupDivider
        title={ui('assetsGroupDepreciationTitle')}
        description={ui('assetsConfigDesc')}
        data-testid="GroupDivider__8e32ca" />
      <div className="mb-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <ToggleCard
            label={ui('assetsDepreciateLabel')}
            description={ui('assetsDepreciateDesc')}
            fieldKey="depreciate"
            value={d.depreciate}
            onChange={onChange}
            editing={editing}
            data-testid="ToggleCard__8e32ca" />
          {depreciate && (
            <ToggleCard
              label={ui('assets30DaysLabel')}
              description={ui('assets30DaysDesc')}
              fieldKey="everyMonthIs30Days"
              value={d.everyMonthIs30Days}
              onChange={onChange}
              editing={editing}
              data-testid="ToggleCard__8e32ca" />
          )}
        </div>
        {depreciate ? (
          <>
            {/* Group 2 — Financial Info (only rendered when depreciation is enabled) */}
            <GroupDivider
              title={ui('assetsGroupFinancialTitle')}
              data-testid="GroupDivider__8e32ca" />
            <EntityForm
              fields={group2Fields}
              {...common}
              onChange={handleAmountChange}
              displayLogic={readOnlyAll}
              data-testid="EntityForm__8e32ca" />
            <EntityForm
              fields={deprecFields}
              {...common}
              displayLogic={makeDisplayLogic(deprecFields)}
              data-testid="EntityForm__8e32ca" />
          </>
        ) : (
          <p className="text-xs text-[#6C6C89]">{ui('assetsDepreciationDisabledHint')}</p>
        )}
      </div>
      {/* Group 4 — Dates */}
      {depreciate && (
        <GroupDivider title={ui('assetsGroupDatesTitle')} data-testid="GroupDivider__8e32ca" />
      )}
      {depreciate && (
        <EntityForm
          fields={dateFields}
          {...common}
          displayLogic={readOnlyAll}
          data-testid="EntityForm__8e32ca" />
      )}
      {/* Group 5 — Accounting dimensions (optional, last section) */}
      {depreciate && (
        <GroupDivider
          title={ui('assetsGroupDimensionsTitle')}
          data-testid="GroupDivider__8e32ca" />
      )}
      {depreciate && (
        <div className="[&_button[role=combobox]]:!bg-white [&_input]:!bg-white">
          <EntityForm
            fields={dimensionFields}
            {...common}
            cols={4}
            displayLogic={readOnlyAll}
            data-testid="EntityForm__8e32ca" />
        </div>
      )}
    </div>
  );
}
