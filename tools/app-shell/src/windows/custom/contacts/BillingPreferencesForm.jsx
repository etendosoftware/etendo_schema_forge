import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { EntityForm } from '@/components/contract-ui';
import { PillToggle } from '@/components/PillToggle';
import { SquareCheckbox } from '../shared/SquareCheckbox';
import { ChevronDown, Tag } from 'lucide-react';
import { useUI } from '@/i18n';
import { extractApiErrorMessage } from '@/lib/apiError';

import { useApiFetch } from '@/auth/useApiFetch.js';
const PRE_SAVE_BILLING_PREF_FIELDS = [
  'priceList',
  'paymentMethod',
  'paymentTerms',
  'account',
  'customerBlocking',
  'purchasePricelist',
  'pOPaymentMethod',
  'pOPaymentTerms',
  'pOFinancialAccount',
  'vendorBlocking',
];

function resolveId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value.id ?? value.value ?? null;
    return id == null || id === '' ? null : String(id);
  }
  return String(value);
}

// ─── Blocking toggle (canonical PillToggle switch — ON = true = blocked) ─────
// Same switch as the Assets "Depreciar" toggle. Label sits above the toggle to
// stay aligned with the sibling payment-terms field in the same row.

function BlockingToggle({ label, value, onCheckedChange }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
      <div className="flex items-center gap-3 h-10">
        <PillToggle
          checked={value}
          onCheckedChange={onCheckedChange}
          aria-label={label}
          data-testid="PillToggle__7f0756" />
      </div>
    </div>
  );
}

function DiscountSelect({ value, options, onChange, loading }) {
  const ui = useUI();
  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
        <Tag size={13} className="text-muted-foreground" data-testid="Tag__7f0756" />
      </div>
      <select
        className="h-10 w-full rounded-lg border border-[hsl(var(--border-control))] bg-card pl-8 pr-3 text-sm appearance-none cursor-pointer shadow-[0px_1px_2px_hsl(var(--foreground) / 0.05)] transition-colors disabled:cursor-not-allowed"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={loading}
      >
        <option value="">{ui('none')}</option>
        {options.map(o => (
          <option key={o.id} value={o.id}>{o._identifier}</option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
        data-testid="ChevronDown__7f0756" />
    </div>
  );
}

// ─── Discount change helpers ─────────────────────────────────────────────────
// Each branch of handleDiscountChange (delete/update/create) is extracted into
// its own helper to keep the dispatcher's cognitive complexity low. Behavior
// (requests, bodies, success/error toasts, state updates) is unchanged.

async function deleteDiscount(discountRecord, apiFetch, ui, setDiscountRecord) {
  try {
    const res = await apiFetch(`/basicDiscount/${discountRecord.id}`, { method: 'DELETE' });
    if (res.ok) {
      setDiscountRecord(null);
      toast.success(ui('discountDeleteSuccess'));
    } else {
      toast.error(await extractApiErrorMessage(res));
    }
  } catch (err) {
    toast.error(err.message || ui('discountDeleteError'));
  }
}

async function updateDiscount(discountRecord, newDiscountId, apiFetch, setDiscountRecord) {
  const res = await apiFetch(`/basicDiscount/${discountRecord.id}`, {
    method: 'PUT',
    body: JSON.stringify({ discount: newDiscountId }),
  });
  if (res.ok) {
    const d = await res.json();
    setDiscountRecord(d?.response?.data?.[0] ?? { ...discountRecord, discount: newDiscountId });
  }
}

async function createDiscount(newDiscountId, bpId, data, apiFetch, setDiscountRecord) {
  const res = await apiFetch(`/basicDiscount?parentId=${bpId}`, {
    method: 'POST',
    body: JSON.stringify({
      discount: newDiscountId,
      lineNo: 10,
      applyInOrder: 'Y',
      customer: data?.customer ? 'Y' : 'N',
      vendor: data?.vendor ? 'Y' : 'N',
    }),
  });
  if (res.ok) {
    const d = await res.json();
    setDiscountRecord(d?.response?.data?.[0] ?? null);
  }
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function BillingPreferencesForm(props) {
  const ui = useUI();
  const { data, api, token, onChange, apiBaseUrl } = props;
  const bpId = data?.id;
  const canEditBillingPreferences = Boolean(bpId);
  const apiBase = apiBaseUrl ?? api?.baseUrl ?? '';
  const apiFetch = useApiFetch(apiBase);
  const organizationId = resolveId(data?.organization ?? data?.adOrgId ?? data?.ad_org_id);
  const clientId = resolveId(data?.client ?? data?.adClientId ?? data?.ad_client_id);
  // Sub-entity records (current BP's discount)
  const [discountRecord, setDiscountRecord] = useState(undefined); // undefined=loading, null=none

  const baseSelectorContext = useMemo(() => {
    const ctx = {};
    if (organizationId) ctx.AD_Org_ID = organizationId;
    if (clientId) ctx.AD_Client_ID = clientId;
    if (bpId) ctx.parentId = bpId;
    return ctx;
  }, [organizationId, clientId, bpId]);

  // Customer and vendor account selectors must filter INDEPENDENTLY: each side carries only its
  // own payment method. FIN_ISRECEIPT drives the payment-method selector's own direction filter:
  // 'Y' = incoming (customer pays us), 'N' = outgoing (we pay vendor).
  //
  // ETP-5183: Fin_Paymentmethod_ID / PO_Paymentmethod_ID are NO LONGER injected here — the
  // `account`/`pOFinancialAccount` field defs below now declare `dependsOn` (paymentMethod /
  // pOPaymentMethod respectively), and CreatableSearchSelect's own request-building
  // (`params = {...selectorContext}; if (parentKey && parentValue && filterKey) params[filterKey]
  // = parentValue;`) always sets that same key from the SAME source value (`data.paymentMethod` /
  // `data.pOPaymentMethod`) — a second, manually-injected copy here would be a pure duplicate,
  // never a different value. `dependsOn` additionally gets the field auto-disabled while its
  // payment method is empty, which this hand-rolled context alone never provided (Etendo Classic
  // parity gap fixed by this ticket).
  const customerSelectorContext = useMemo(
    () => ({ ...baseSelectorContext, FIN_ISRECEIPT: 'Y' }),
    [baseSelectorContext],
  );
  const vendorSelectorContext = useMemo(
    () => ({ ...baseSelectorContext, FIN_ISRECEIPT: 'N' }),
    [baseSelectorContext],
  );

  // Clearing the account is a user-triggered side effect of changing the payment method: the
  // account list is filtered by the method (see the FIN_Financial_Account selector policy), so the
  // previously selected account may no longer be a valid option. Wrapping onChange fires only on
  // user edits, never on initial hydration, so a compatible saved pair survives when the record loads.
  //
  // NOT made redundant by `dependsOn`: CreatableSearchSelect's serverSearch-mode parent-change
  // effect (see CreatableSearchSelect.jsx) only auto-clears the dependent value when the parent
  // becomes EMPTY, not when it changes to a DIFFERENT non-empty value — the fetch-once mode's
  // richer "auto-clear/auto-select when the current value is no longer among the freshly fetched
  // items" logic does not apply here (`serverSearch: true` is always forced for `type:'selector'`
  // fields — see EntityForm.jsx's renderSearchSelectField). So this explicit clear-on-change stays
  // as the only guard against a stale, now-incompatible account surviving a payment method change.
  const handleCustomerChange = useCallback((key, value, ...rest) => {
    onChange?.(key, value, ...rest);
    if (key === 'paymentMethod') {
      onChange?.('account', null);
      onChange?.('account$_identifier', null);
    }
  }, [onChange]);
  const handleVendorChange = useCallback((key, value, ...rest) => {
    onChange?.(key, value, ...rest);
    if (key === 'pOPaymentMethod') {
      onChange?.('pOFinancialAccount', null);
      onChange?.('pOFinancialAccount$_identifier', null);
    }
  }, [onChange]);
  // Available discount catalog
  const [discountOptions, setDiscountOptions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!bpId || !token) return;

    // Fetch current discount record for this BP
    apiFetch(`/basicDiscount?parentId=${bpId}&_startRow=0&_endRow=1`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setDiscountRecord(d?.response?.data?.[0] ?? null))
      .catch(() => setDiscountRecord(null));

    // Fetch available discounts catalog
    const discountParams = new URLSearchParams({ limit: '200', offset: '0' });
    if (organizationId) discountParams.set('AD_Org_ID', organizationId);
    if (clientId) discountParams.set('AD_Client_ID', clientId);
    apiFetch(`/basicDiscount/selectors/C_Discount_ID?${discountParams.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const seen = new Set();
        const options = [];
        (d?.items ?? []).forEach((item) => {
          if (!item?.id || seen.has(item.id)) return;
          seen.add(item.id);
          options.push({ id: item.id, _identifier: item.label || item.name || item.id });
        });
        setDiscountOptions(options);
      })
      .catch(() => setDiscountOptions([]))
      .finally(() => setDiscountRecord(prev => prev === undefined ? null : prev)); // Clear loading state on error
  }, [bpId, token, apiFetch, organizationId, clientId]);

  // In Classic, billing preferences are set after the Business Partner exists.
  // Keep the pre-save create payload clean by removing auto-defaulted billing values
  // that can come from backend preferences in /defaults.
  useEffect(() => {
    if (canEditBillingPreferences || typeof onChange !== 'function') return;

    const hasPrefilledBillingValues = PRE_SAVE_BILLING_PREF_FIELDS.some((key) => {
      const value = data?.[key];
      return value != null && value !== '';
    });

    if (!hasPrefilledBillingValues) return;

    PRE_SAVE_BILLING_PREF_FIELDS.forEach((key) => {
      if (data?.[key] != null && data[key] !== '') {
        onChange(key, null);
      }
      const identifierKey = `${key}$_identifier`;
      if (data?.[identifierKey] != null && data[identifierKey] !== '') {
        onChange(identifierKey, null);
      }
    });
  }, [canEditBillingPreferences, data, onChange]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleDiscountChange(newDiscountId) {
    if (saving) return;
    setSaving(true);
    try {
      if (!newDiscountId && discountRecord?.id) {
        // Clear: delete existing record
        await deleteDiscount(discountRecord, apiFetch, ui, setDiscountRecord);
      } else if (discountRecord?.id) {
        // Update existing record
        await updateDiscount(discountRecord, newDiscountId, apiFetch, setDiscountRecord);
      } else if (newDiscountId) {
        // Create new record with required auto-flags
        await createDiscount(newDiscountId, bpId, data, apiFetch, setDiscountRecord);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const discountLoading = discountRecord === undefined;
  const currentDiscountId = discountRecord?.discount ?? null;

  const customerTopBillingFields = [
    { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    // ETP-5183: `dependsOn` (kept as type:'selector' so it still renders through
    // CreatableSearchSelect/renderSearchSelectField, NOT the DependentSelect component that
    // `type: 'dependent'` would route to) — disables the field until paymentMethod has a value
    // and supplies Fin_Paymentmethod_ID as the selector's filter param (see CreatableSearchSelect.jsx).
    {
      key: 'account',
      column: 'FIN_Financial_Account_ID',
      type: 'selector',
      section: 'principal',
      inputMode: 'dependent',
      dependsOn: { field: 'paymentMethod', filterKey: 'Fin_Paymentmethod_ID' },
    },
  ];
  const customerPaymentTermsField = [
    { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  ];

  const vendorTopBillingFields = [
    { key: 'purchasePricelist', column: 'PO_PriceList_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'pOPaymentMethod', column: 'PO_Paymentmethod_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    // ETP-5183: same dependsOn treatment as `account` above, mirrored for the vendor side.
    {
      key: 'pOFinancialAccount',
      column: 'PO_Financial_Account_ID',
      type: 'selector',
      section: 'principal',
      inputMode: 'dependent',
      dependsOn: { field: 'pOPaymentMethod', filterKey: 'PO_Paymentmethod_ID' },
    },
  ];
  const vendorPaymentTermsField = [
    { key: 'pOPaymentTerms', column: 'PO_PaymentTerm_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* ── Descuento ──────────────────────────────────────────────── */}
      {bpId && discountOptions.length > 0 && (
        <div className="w-[236px]">
          <DiscountSelect
            value={currentDiscountId}
            options={discountOptions}
            onChange={handleDiscountChange}
            loading={discountLoading || saving}
            data-testid="DiscountSelect__7f0756" />
        </div>
      )}
      {!canEditBillingPreferences ? (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          {ui('billingPreferencesAfterSave')}
        </div>
      ) : (
        <>
          {/* ── Cliente ───────────────────────────────────────────────────── */}
          <div className="bg-[hsl(var(--muted))] rounded-lg p-3 flex flex-col gap-3">
            <SquareCheckbox
              label={ui('customer')}
              checked={!!data?.customer}
              onChange={(val) => onChange?.('customer', val)}
              data-testid="SquareCheckbox__7f0756-customer" />
            {data?.customer && (
              <>
                <EntityForm
                  {...props}
                  onChange={handleCustomerChange}
                  fields={customerTopBillingFields}
                  selectorContext={customerSelectorContext}
                  data-testid="EntityForm__7f0756" />
                <div className="flex flex-row gap-5 items-start">
                  <div className="flex-1 min-w-0">
                    <EntityForm
                      {...props}
                      fields={customerPaymentTermsField}
                      cols={1}
                      selectorContext={customerSelectorContext}
                      data-testid="EntityForm__7f0756" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <BlockingToggle
                      label={ui('customerBlockField')}
                      value={data?.customerBlocking}
                      onCheckedChange={(next) => onChange?.('customerBlocking', next, 'Customer_Blocking')}
                      data-testid="BlockingToggle__7f0756-customer" />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Proveedor ─────────────────────────────────────────────────── */}
          <div className="bg-[hsl(var(--muted))] rounded-lg p-3 flex flex-col gap-3">
            <SquareCheckbox
              label={ui('vendor')}
              checked={!!data?.vendor}
              onChange={(val) => onChange?.('vendor', val)}
              data-testid="SquareCheckbox__7f0756-vendor" />
            {data?.vendor && (
              <>
                <EntityForm
                  {...props}
                  onChange={handleVendorChange}
                  fields={vendorTopBillingFields}
                  selectorContext={vendorSelectorContext}
                  data-testid="EntityForm__7f0756" />
                <div className="flex flex-row gap-5 items-start">
                  <div className="flex-1 min-w-0">
                    <EntityForm
                      {...props}
                      fields={vendorPaymentTermsField}
                      cols={1}
                      selectorContext={vendorSelectorContext}
                      data-testid="EntityForm__7f0756" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <BlockingToggle
                      label={ui('vendorBlockField')}
                      value={data?.vendorBlocking}
                      onCheckedChange={(next) => onChange?.('vendorBlocking', next, 'Vendor_Blocking')}
                      data-testid="BlockingToggle__7f0756-vendor" />
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
