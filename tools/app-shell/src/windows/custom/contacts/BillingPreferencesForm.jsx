import { useState, useEffect, useMemo } from 'react';
import { EntityForm } from '@/components/contract-ui';
import { ChevronDown, Tag } from 'lucide-react';
import { useUI } from '@/i18n';

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

// ─── Discount select ────────────────────────────────────────────────────────

function YesNoRadio({ label, value, onChange }) {
  const ui = useUI();
  const isChecked = value === true || value === 'Y' || value === 'true';
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-[#121217]">{label}</p>
      <div className="flex items-center gap-5 h-10">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="radio" checked={!isChecked} onChange={() => onChange(false)}
            className="w-4 h-4 accent-[#121217] cursor-pointer" />
          <span className="text-sm text-[#121217]">{ui('no')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="radio" checked={isChecked} onChange={() => onChange(true)}
            className="w-4 h-4 accent-[#121217] cursor-pointer" />
          <span className="text-sm text-[#121217]">{ui('yes')}</span>
        </label>
      </div>
    </div>
  );
}

function DiscountSelect({ value, options, onChange, loading }) {
  const ui = useUI();
  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
        <Tag size={13} className="text-muted-foreground" />
      </div>
      <select
        className="h-10 w-full rounded-lg border border-[#D1D4DB] bg-white pl-8 pr-3 text-sm appearance-none cursor-pointer shadow-[0px_1px_2px_rgba(18,18,23,0.05)] transition-colors disabled:cursor-not-allowed"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={loading}
      >
        <option value="">{ui('none')}</option>
        {options.map(o => (
          <option key={o.id} value={o.id}>{o._identifier}</option>
        ))}
      </select>
      <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function BillingPreferencesForm(props) {
  const ui = useUI();
  const { data, api, token, onChange, apiBaseUrl } = props;
  const bpId = data?.id;
  const canEditBillingPreferences = Boolean(bpId);
  const apiBase = apiBaseUrl ?? api?.baseUrl ?? '';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const organizationId = resolveId(data?.organization ?? data?.adOrgId ?? data?.ad_org_id);
  const clientId = resolveId(data?.client ?? data?.adClientId ?? data?.ad_client_id);
  // Sub-entity records (current BP's discount)
  const [discountRecord, setDiscountRecord] = useState(undefined); // undefined=loading, null=none

  const paymentMethodId = resolveId(data?.paymentMethod);
  const pOPaymentMethodId = resolveId(data?.pOPaymentMethod);
  const selectorContext = useMemo(() => {
    const ctx = {};
    if (organizationId) ctx.AD_Org_ID = organizationId;
    if (clientId) ctx.AD_Client_ID = clientId;
    if (bpId) ctx.parentId = bpId;
    // SQL validation rules on FIN/PO_Financial_Account_ID resolve @Fin_Paymentmethod_ID@
    // and @PO_Paymentmethod_ID@ from the request context.
    if (paymentMethodId) ctx.Fin_Paymentmethod_ID = paymentMethodId;
    if (pOPaymentMethodId) ctx.PO_Paymentmethod_ID = pOPaymentMethodId;
    return ctx;
  }, [organizationId, clientId, bpId, paymentMethodId, pOPaymentMethodId]);

  // FIN_Paymentmethod_ID validationRule uses @FIN_ISRECEIPT@ to filter by direction:
  // 'Y' = incoming (customer pays us), 'N' = outgoing (we pay vendor).
  const customerSelectorContext = useMemo(() => ({ ...selectorContext, FIN_ISRECEIPT: 'Y' }), [selectorContext]);
  const vendorSelectorContext   = useMemo(() => ({ ...selectorContext, FIN_ISRECEIPT: 'N' }), [selectorContext]);
  // Available discount catalog
  const [discountOptions, setDiscountOptions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!bpId || !token) return;

    // Fetch current discount record for this BP
    fetch(`${apiBase}/basicDiscount?parentId=${bpId}&_startRow=0&_endRow=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setDiscountRecord(d?.response?.data?.[0] ?? null))
      .catch(() => setDiscountRecord(null));

    // Fetch available discounts catalog
    const discountParams = new URLSearchParams({ limit: '200', offset: '0' });
    if (organizationId) discountParams.set('AD_Org_ID', organizationId);
    if (clientId) discountParams.set('AD_Client_ID', clientId);
    fetch(`${apiBase}/basicDiscount/selectors/C_Discount_ID?${discountParams.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
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
  }, [bpId, token, apiBase, organizationId, clientId]);

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
        await fetch(`${apiBase}/basicDiscount/${discountRecord.id}`, { method: 'DELETE', headers });
        setDiscountRecord(null);
      } else if (discountRecord?.id) {
        // Update existing record
        const res = await fetch(`${apiBase}/basicDiscount/${discountRecord.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ discount: newDiscountId }),
        });
        if (res.ok) {
          const d = await res.json();
          setDiscountRecord(d?.response?.data?.[0] ?? { ...discountRecord, discount: newDiscountId });
        }
      } else if (newDiscountId) {
        // Create new record with required auto-flags
        const res = await fetch(`${apiBase}/basicDiscount?parentId=${bpId}`, {
          method: 'POST',
          headers,
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
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const discountLoading = discountRecord === undefined;
  const currentDiscountId = discountRecord?.discount ?? null;

  const customerCheckboxField = [
    { key: 'customer', column: 'IsCustomer', type: 'checkbox', label: ui('customer'), required: true, section: 'principal' },
  ];

  const customerTopBillingFields = [
    { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'account', column: 'FIN_Financial_Account_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  ];
  const customerPaymentTermsField = [
    { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  ];

  const vendorCheckboxField = [
    { key: 'vendor', column: 'IsVendor', type: 'checkbox', label: ui('vendor'), required: true, section: 'principal' },
  ];

  const vendorTopBillingFields = [
    { key: 'purchasePricelist', column: 'PO_PriceList_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'pOPaymentMethod', column: 'PO_Paymentmethod_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'pOFinancialAccount', column: 'PO_Financial_Account_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  ];
  const vendorPaymentTermsField = [
    { key: 'pOPaymentTerms', column: 'PO_PaymentTerm_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
  ];

  return (
    <div className="flex flex-col gap-3">

      {/* ── Descuento ──────────────────────────────────────────────── */}
      {bpId && (
        <div className="w-[236px]">
          <DiscountSelect
            value={currentDiscountId}
            options={discountOptions}
            onChange={handleDiscountChange}
            loading={discountLoading || saving}
          />
        </div>
      )}

      {!canEditBillingPreferences ? (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          {ui('billingPreferencesAfterSave')}
        </div>
      ) : (
        <>
          {/* ── Cliente ───────────────────────────────────────────────────── */}
          <div className="bg-[#F5F7F9] rounded-lg p-3 flex flex-col gap-3">
            <div className="[&_.pt-6]:pt-0">
              <EntityForm {...props} fields={customerCheckboxField} selectorContext={customerSelectorContext} />
            </div>
            {data?.customer && (
              <>
                <EntityForm {...props} fields={customerTopBillingFields} selectorContext={customerSelectorContext} />
                <div className="flex flex-row gap-5 items-start">
                  <div className="flex-1 min-w-0">
                    <EntityForm {...props} fields={customerPaymentTermsField} cols={1} selectorContext={customerSelectorContext} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <YesNoRadio
                      label={ui('customerBlockField')}
                      value={data?.customerBlocking}
                      onChange={(val) => onChange?.('customerBlocking', val, 'Customer_Blocking')}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Proveedor ─────────────────────────────────────────────────── */}
          <div className="bg-[#F5F7F9] rounded-lg p-3 flex flex-col gap-3">
            <div className="[&_.pt-6]:pt-0">
              <EntityForm {...props} fields={vendorCheckboxField} selectorContext={vendorSelectorContext} />
            </div>
            {data?.vendor && (
              <>
                <EntityForm {...props} fields={vendorTopBillingFields} selectorContext={vendorSelectorContext} />
                <div className="flex flex-row gap-5 items-start">
                  <div className="flex-1 min-w-0">
                    <EntityForm {...props} fields={vendorPaymentTermsField} cols={1} selectorContext={vendorSelectorContext} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <YesNoRadio
                      label={ui('vendorBlockField')}
                      value={data?.vendorBlocking}
                      onChange={(val) => onChange?.('vendorBlocking', val, 'Vendor_Blocking')}
                    />
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
