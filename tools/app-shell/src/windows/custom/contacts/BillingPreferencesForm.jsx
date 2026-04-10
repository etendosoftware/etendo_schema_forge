import { useState, useEffect, useRef } from 'react';
import { EntityForm } from '@/components/contract-ui';
import { ChevronDown, MapPin, Tag, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';

// ─── Address search dropdown ────────────────────────────────────────────────

function AddressSearch({ value, onChange, apiBase, token }) {
  const ui = useUI();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return; }
    const controller = new AbortController();
    setLoading(true);
    const url = `${apiBase}/locationAddress/selectors/C_Location_ID?_search=${encodeURIComponent(query)}&_startRow=0&_endRow=20`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setResults((d?.items ?? []).map(item => ({ id: item.id, _identifier: item.label || item.name || item.id })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => controller.abort();
  }, [query, apiBase, token]);

  const displayLabel = value?._identifier ?? '';

  return (
    <div className="relative" ref={ref}>
      <div
        className="flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm cursor-pointer hover:border-ring transition-colors"
        onClick={() => { setOpen(o => !o); setQuery(''); }}
      >
        <MapPin size={13} className="text-muted-foreground shrink-0" />
        <span className={`flex-1 truncate ${displayLabel ? '' : 'text-muted-foreground'}`}>
          {displayLabel || ui('searchAddress')}
        </span>
        <ChevronDown size={13} className="text-muted-foreground shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              className="w-full text-sm px-2 py-1 rounded border border-input bg-background outline-none"
              placeholder={ui('typeToSearch')}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 size={13} className="animate-spin" /> {ui('searching')}
              </div>
            )}
            {!loading && results.length === 0 && query.length >= 2 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">{ui('noResults')}</div>
            )}
            {!loading && query.length < 2 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">{ui('typeAtLeast2Characters')}</div>
            )}
            {results.map(r => (
              <button
                key={r.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors truncate"
                onClick={() => { onChange({ id: r.id, _identifier: r._identifier }); setOpen(false); }}
              >
                {r._identifier}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Discount select ────────────────────────────────────────────────────────

function DiscountSelect({ value, options, onChange, loading }) {
  const ui = useUI();
  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
        <Tag size={13} className="text-muted-foreground" />
      </div>
      <select
        className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm appearance-none cursor-pointer hover:border-ring transition-colors disabled:opacity-50"
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
  const { data, api, token } = props;
  const bpId = data?.id;
  const apiBase = api?.baseUrl ?? '';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Sub-entity records (current BP's discount + address)
  const [discountRecord, setDiscountRecord] = useState(undefined); // undefined=loading, null=none
  const [addressRecord, setAddressRecord] = useState(undefined);
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

    // Fetch current location/address record for this BP
    fetch(`${apiBase}/locationAddress?parentId=${bpId}&_startRow=0&_endRow=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setAddressRecord(d?.response?.data?.[0] ?? null))
      .catch(() => setAddressRecord(null));

    // Fetch available discounts catalog
    fetch(`${apiBase}/basicDiscount/selectors/C_Discount_ID?_startRow=0&_endRow=200`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setDiscountOptions((d?.items ?? []).map(item => ({ id: item.id, _identifier: item.label || item.name || item.id }))))
      .catch(() => setDiscountOptions([]));
  }, [bpId, token, apiBase]);

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

  async function handleAddressChange(selected) {
    if (saving) return;
    setSaving(true);
    try {
      if (addressRecord?.id) {
        const res = await fetch(`${apiBase}/locationAddress/${addressRecord.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ locationAddress: selected.id }),
        });
        if (res.ok) {
          setAddressRecord(prev => ({ ...prev, locationAddress: selected.id, 'locationAddress$_identifier': selected._identifier }));
        }
      } else {
        const res = await fetch(`${apiBase}/locationAddress?parentId=${bpId}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            locationAddress: selected.id,
            shipToAddress: 'Y',
            invoiceToAddress: 'Y',
          }),
        });
        if (res.ok) {
          const d = await res.json();
          setAddressRecord(d?.response?.data?.[0] ?? { locationAddress: selected.id, 'locationAddress$_identifier': selected._identifier });
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const discountLoading = discountRecord === undefined;
  const addressLoading = addressRecord === undefined;
  const currentDiscountId = discountRecord?.discount ?? null;
  const currentAddress = addressRecord
    ? { id: addressRecord.locationAddress, _identifier: addressRecord['locationAddress$_identifier'] ?? '' }
    : null;

  const customerCheckboxField = [
    { key: 'customer', column: 'IsCustomer', type: 'checkbox', label: ui('customer'), required: true, section: 'principal' },
  ];

  const customerBillingFields = [
    { key: 'priceList', column: 'M_PriceList_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'paymentTerms', column: 'C_PaymentTerm_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'account', column: 'FIN_Financial_Account_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'customerBlocking', column: 'Customer_Blocking', type: 'checkbox', section: 'principal' },
  ];

  const vendorCheckboxField = [
    { key: 'vendor', column: 'IsVendor', type: 'checkbox', label: ui('vendor'), required: true, section: 'principal' },
  ];

  const vendorBillingFields = [
    { key: 'purchasePricelist', column: 'PO_PriceList_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'pOPaymentMethod', column: 'PO_Paymentmethod_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'pOPaymentTerms', column: 'PO_PaymentTerm_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'pOFinancialAccount', column: 'PO_Financial_Account_ID', type: 'selector', section: 'principal', inputMode: 'selector' },
    { key: 'vendorBlocking', column: 'Vendor_Blocking', type: 'checkbox', section: 'principal' },
  ];

  return (
    <div className="flex flex-col gap-4">

      {/* ── Discount + Address inline fields ─────────────────────────── */}
      {bpId && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Basic Discount */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{ui('basicDiscount')}</span>
              <DiscountSelect
                value={currentDiscountId}
                options={discountOptions}
                onChange={handleDiscountChange}
                loading={discountLoading || saving}
              />
            </div>

            {/* Location / Address */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{ui('locationAddress')}</span>
              {addressLoading
                ? <div className="h-9 rounded-md bg-muted animate-pulse" />
                : (
                  <AddressSearch
                    value={currentAddress}
                    onChange={handleAddressChange}
                    apiBase={apiBase}
                    token={token}
                  />
                )
              }
            </div>
          </div>

          <div className="border-t border-border" />
        </>
      )}

      {/* ── Customer / Vendor billing ─────────────────────────────────── */}
      <EntityForm fields={customerCheckboxField} {...props} />
      {data?.customer && (
        <div className="pl-4 border-l-2 border-border">
          <EntityForm fields={customerBillingFields} {...props} />
        </div>
      )}

      <EntityForm fields={vendorCheckboxField} {...props} />
      {data?.vendor && (
        <div className="pl-4 border-l-2 border-border">
          <EntityForm fields={vendorBillingFields} {...props} />
        </div>
      )}
    </div>
  );
}
