import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUI } from '@/i18n';
import { useLocaleState } from '@/i18n/useLocaleState';
import EntityCreationModal from './EntityCreationModal.jsx';
import FinancialSection from './FinancialSection.jsx';
import AddressSection from './AddressSection.jsx';
import { contactModalConfig } from './contactModalConfig.js';

const COMPONENT_MAP = { AddressSection, FinancialSection };

const EMPTY_OPTS = {
  taxIdTypes: { options: [], loading: false, error: null },
  salesPriceLists: { options: [], loading: false, error: null },
  purchasePriceLists: { options: [], loading: false, error: null },
  paymentMethods: { options: [], loading: false, error: null },
  paymentTerms: { options: [], loading: false, error: null },
  financialAccounts: { options: [], loading: false, error: null },
  countries: { options: [], loading: false, error: null },
  regions: { options: [], loading: false, error: null },
};

function buildPersonName(firstName, lastName) {
  return [firstName, lastName]
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 60);
}

function ContactModeToggle({ contactType, onChange }) {
  const ui = useUI();

  return (
    <div
      className="flex items-center gap-1 p-1 rounded-xl"
      style={{ background: '#F5F7F9', width: '240px' }}
    >
      <button
        type="button"
        onClick={() => onChange('person')}
        className="flex-1 h-8 px-2 text-sm font-medium rounded-lg transition-all"
        style={
          contactType === 'person'
            ? {
                background: '#FFFFFF',
                color: '#121217',
                boxShadow: '0px 1px 3px rgba(18,18,23,0.10), 0px 1px 2px rgba(18,18,23,0.06)',
              }
            : { color: '#121217' }
        }
      >
        {ui('Person')}
      </button>
      <button
        type="button"
        onClick={() => onChange('company')}
        className="flex-1 h-8 px-2 text-sm font-medium rounded-lg transition-all"
        style={
          contactType === 'company'
            ? {
                background: '#FFFFFF',
                color: '#121217',
                boxShadow: '0px 1px 3px rgba(18,18,23,0.10), 0px 1px 2px rgba(18,18,23,0.06)',
              }
            : { color: '#121217' }
        }
      >
        {ui('company')}
      </button>
    </div>
  );
}

export function getBillingPatch(opts, form) {
  const first = (key) => opts[key]?.options?.[0]?.id;
  const salesPriceList = form.salesPriceList || first('salesPriceLists');
  const paymentMethod = form.paymentMethod || first('paymentMethods');
  const paymentTerm = form.paymentTerm || first('paymentTerms');
  const financialAccount = form.financialAccount || first('financialAccounts');
  const purchasePriceList = form.purchasePriceList || first('purchasePriceLists');
  const paymentMethodPO = form.paymentMethodPO || first('paymentMethods');
  const paymentTermPO = form.paymentTermPO || first('paymentTerms');
  const financialAccountPO = form.financialAccountPO || first('financialAccounts');

  const billingPatch = {
    ...(form.isCustomer && salesPriceList && {priceList: salesPriceList}),
    ...(form.isCustomer && paymentMethod && {paymentMethod}),
    ...(form.isCustomer && paymentTerm && {paymentTerms: paymentTerm}),
    ...(form.isCustomer && financialAccount && {account: financialAccount}),
    ...(form.isCustomer && {customerBlocking: form.customerBlock}),
    ...(form.isVendor && purchasePriceList && {purchasePricelist: purchasePriceList}),
    ...(form.isVendor && paymentMethodPO && {pOPaymentMethod: paymentMethodPO}),
    ...(form.isVendor && paymentTermPO && {pOPaymentTerms: paymentTermPO}),
    ...(form.isVendor && financialAccountPO && {pOFinancialAccount: financialAccountPO}),
    ...(form.isVendor && {vendorBlocking: form.paymentBlock}),
  };
  return billingPatch;
}

/**
 * Thin wrapper around EntityCreationModal for creating Business Partners.
 *
 * Responsibilities:
 *   - Fetch selector options from the NEO API
 *   - Re-fetch regions when country changes
 *   - Execute the multi-step save sequence (BP → billing PATCH → address → contacts → bank accounts)
 *
 * Props:
 *   bpApiBaseUrl   Base URL for the contacts NEO spec
 *   headers        { Authorization, Content-Type }
 *   onClose        () => void
 *   onCreated      ({ id, name }) => void
 *   initialQuery   Pre-fills Identifier from the search query
 *   documentType   'sale' | 'purchase' | null — auto-checks Cliente / Proveedor
 */
export default function CreateContactModal({
  bpApiBaseUrl,
  headers,
  onClose,
  onCreated,
  initialQuery = '',
  documentType = null,
}) {
  const ui = useUI();
  const [locale] = useLocaleState();
  const [opts, setOpts] = useState(EMPTY_OPTS);
  const [retryCount, setRetryCount] = useState(0);
  const [currentCountry, setCurrentCountry] = useState('');
  const [retryRegionCount, setRetryRegionCount] = useState(0);
  const [contactType, setContactType] = useState('company');

  // Fetch all selectors (except regions, which depend on country)
  useEffect(() => {
    if (!bpApiBaseUrl || !headers) return;
    let cancelled = false;

    setOpts(o => ({
      ...o,
      taxIdTypes: { ...o.taxIdTypes, loading: true, error: null },
      salesPriceLists: { ...o.salesPriceLists, loading: true, error: null },
      purchasePriceLists: { ...o.purchasePriceLists, loading: true, error: null },
      paymentMethods: { ...o.paymentMethods, loading: true, error: null },
      paymentTerms: { ...o.paymentTerms, loading: true, error: null },
      financialAccounts: { ...o.financialAccounts, loading: true, error: null },
      countries: { ...o.countries, loading: true, error: null },
    }));

    const h = headers;
    const bp = `${bpApiBaseUrl}/businessPartner`;
    const vc = `${bpApiBaseUrl}/vendorCreditor`;

    const fetchSel = url =>
      fetch(url, { headers: h })
        .then(r => (r.ok ? r.json() : null))
        .then(d => (d?.items || []).map(i => ({ id: i.id, label: i.label || i.name || i.id })))
        .catch(() => []);

    const fetchAllPages = async (baseUrl) => {
      const PAGE = 120;
      let offset = 0;
      const all = [];
      for (let i = 0; i < 20; i++) {
        const res = await fetch(`${baseUrl}?limit=${PAGE}&offset=${offset}&language=${locale}`, { headers: h });
        if (!res.ok) break;
        const data = await res.json();
        const items = (data?.items || []).map(x => ({ id: x.id, label: x.label || x.name || x.id }));
        all.push(...items);
        if (!data?.hasMore || items.length === 0) break;
        offset += items.length;
      }
      return all;
    };

    const countrySelectors = [
      `${bpApiBaseUrl}/locationAddress/selectors/C_Country_ID`,
      `${bpApiBaseUrl}/bankAccount/selectors/C_Country_ID`,
    ];

    const fetchCountries = async () => {
      for (const url of countrySelectors) {
        try {
          const items = await fetchAllPages(url);
          if (items.length > 0) return items;
        } catch (_) { /* try next */ }
      }
      return [];
    };

    Promise.all([
      fetchSel(`${bp}/selectors/EM_OBTIK_Tax_ID_Key`),
      fetchSel(`${bp}/selectors/M_PriceList_ID`),
      fetchSel(`${vc}/selectors/PO_PriceList_ID`),
      fetchSel(`${bp}/selectors/FIN_Paymentmethod_ID`),
      fetchSel(`${bp}/selectors/C_PaymentTerm_ID`),
      fetchSel(`${bp}/selectors/FIN_Financial_Account_ID`),
      fetchCountries(),
    ])
      .then(([taxIdTypes, salesPriceLists, purchasePriceLists, paymentMethods, paymentTerms, financialAccounts, countries]) => {
        if (cancelled) return;
        setOpts(o => ({
          ...o,
          taxIdTypes: { options: taxIdTypes, loading: false, error: null },
          salesPriceLists: { options: salesPriceLists, loading: false, error: null },
          purchasePriceLists: { options: purchasePriceLists, loading: false, error: null },
          paymentMethods: { options: paymentMethods, loading: false, error: null },
          paymentTerms: { options: paymentTerms, loading: false, error: null },
          financialAccounts: { options: financialAccounts, loading: false, error: null },
          countries: { options: countries, loading: false, error: null },
        }));
      })
      .catch(e => {
        if (cancelled) return;
        const msg = e.message || ui('errorLoadingOptions');
        setOpts(o => ({
          ...o,
          taxIdTypes: { ...o.taxIdTypes, loading: false, error: msg },
          salesPriceLists: { ...o.salesPriceLists, loading: false, error: msg },
          purchasePriceLists: { ...o.purchasePriceLists, loading: false, error: msg },
          paymentMethods: { ...o.paymentMethods, loading: false, error: msg },
          paymentTerms: { ...o.paymentTerms, loading: false, error: msg },
          financialAccounts: { ...o.financialAccounts, loading: false, error: msg },
          countries: { ...o.countries, loading: false, error: msg },
        }));
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpApiBaseUrl, locale, retryCount]);

  // Re-fetch regions when country changes
  useEffect(() => {
    if (!currentCountry || !bpApiBaseUrl || !headers) {
      setOpts(o => ({ ...o, regions: { options: [], loading: false, error: null } }));
      return;
    }
    let cancelled = false;
    setOpts(o => ({ ...o, regions: { options: [], loading: true, error: null } }));

    fetch(
      `${bpApiBaseUrl}/locationAddress/selectors/C_Region_ID?C_Country_ID=${currentCountry}&limit=200&language=${locale}`,
      { headers }
    )
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => {
        if (cancelled) return;
        setOpts(o => ({
          ...o,
          regions: {
            options: (d?.items || []).map(i => ({ id: i.id, label: i.label || i.name || i.id })),
            loading: false,
            error: null,
          },
        }));
      })
      .catch(e => {
        if (cancelled) return;
        setOpts(o => ({ ...o, regions: { options: [], loading: false, error: e.message } }));
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCountry, locale, retryRegionCount]);

  const handleFieldChange = useCallback((id, value) => {
    if (id === 'country') setCurrentCountry(value);
  }, []);

  const headerFields = useMemo(() => {
    const commonFields = [
      {
        id: 'taxIdType',
        labelKey: 'taxIdTypeField',
        type: 'dynamicSelect',
        optionsKey: 'taxIdTypes',
        required: true,
      },
      {
        id: 'taxID',
        labelKey: 'taxIDField',
        type: 'text',
        placeholder: 'B-12345678',
        required: true,
      },
    ];

    if (contactType === 'person') {
      return [
        { id: 'etgoFirstname', labelKey: 'contactFirstName', type: 'text', required: true },
        { id: 'etgoLastname', labelKey: 'contactLastName', type: 'text', required: true },
        ...commonFields,
      ];
    }

    return [
      { id: 'name', labelKey: 'contactLegalName', type: 'text', required: true },
      ...commonFields,
    ];
  }, [contactType]);

  const requiredFields = useMemo(
    () => {
      return contactType === 'company'
        ? ['name', 'taxIdType', 'taxID', 'country']
        : ['etgoFirstname', 'etgoLastname', 'taxIdType', 'taxID', 'country'];
    },
    [contactType],
  );

  const progressFields = useMemo(() => {
    if (contactType === 'company') {
      return contactModalConfig.progressFields;
    }

    const baseProgressFields = contactModalConfig.progressFields.filter(key => key !== 'name');
    return [...baseProgressFields, 'etgoFirstname', 'etgoLastname'];
  }, [contactType]);

  const validateForm = useCallback((form) => {
    if (contactType !== 'person') return null;
    if (!buildPersonName(form.etgoFirstname, form.etgoLastname)) {
      return ui('contactPersonNameRequired');
    }
    return null;
  }, [contactType, ui]);

  // Attach retry callbacks before passing opts down
  const optsWithRetry = {
    ...opts,
    regions: { ...opts.regions, onRetry: () => setRetryRegionCount(c => c + 1) },
    taxIdTypes: { ...opts.taxIdTypes, onRetry: () => setRetryCount(c => c + 1) },
    salesPriceLists: { ...opts.salesPriceLists, onRetry: () => setRetryCount(c => c + 1) },
    purchasePriceLists: { ...opts.purchasePriceLists, onRetry: () => setRetryCount(c => c + 1) },
    paymentMethods: { ...opts.paymentMethods, onRetry: () => setRetryCount(c => c + 1) },
    paymentTerms: { ...opts.paymentTerms, onRetry: () => setRetryCount(c => c + 1) },
    financialAccounts: { ...opts.financialAccounts, onRetry: () => setRetryCount(c => c + 1) },
    countries: { ...opts.countries, onRetry: () => setRetryCount(c => c + 1) },
  };

  const handleSave = async (form, repeatables) => {
    const toErrMsg = v => (typeof v === 'string' ? v : v?.message) || null;
    const legalName = String(form.name ?? '').trim();
    const firstName = String(form.etgoFirstname ?? '').trim();
    const lastName = String(form.etgoLastname ?? '').trim();

    // Step 1 — Create BP
    const createPayload = {
      ...(contactType === 'company' && legalName && { name: legalName }),
      ...(contactType === 'person' && firstName && { etgoFirstname: firstName }),
      ...(contactType === 'person' && lastName && { etgoLastname: lastName }),
      etgoIsperson: contactType === 'person',
      taxID: form.taxID?.trim(),
      oBTIKTaxIDKey: form.taxIdType || '1',
      creditLimit: Number(form.creditLimit) || 0,
      creditUsed: 0,
      active: true,
      customer: !!form.isCustomer,
      vendor: !!form.isVendor,
      employee: false,
      isSalesRepresentative: false,
      customerBlocking: false,
      vendorBlocking: false,
      setNewCurrency: false,
      ...(form.etgoEmail?.trim() && { etgoEmail: form.etgoEmail.trim() }),
      ...(form.etgoPhone?.trim() && { etgoPhone: form.etgoPhone.trim() }),
      ...(form.etgoWeb?.trim() && { etgoWeb: form.etgoWeb.trim() }),
    };

    const res = await fetch(`${bpApiBaseUrl}/businessPartner`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createPayload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(
        toErrMsg(errData?.message) ||
        toErrMsg(errData?.error) ||
        toErrMsg(errData?.response?.error) ||
        `${ui('createContactError')} (HTTP ${res.status})`
      );
    }

    const data = await res.json();
    const record = data?.response?.data?.[0] ?? data?.response?.data ?? data;
    const newId = record?.id;
    const fallbackName = contactType === 'person'
      ? buildPersonName(firstName, lastName)
      : legalName;
    const newName = record?.name ?? fallbackName;

    try {
      // Step 2 — POST address (handled atomically by ContactsLocationAddressHandler)
      if (newId && (form.address || form.city || form.country)) {
        const countryLabel = opts.countries?.options?.find(c => c.id === form.country)?.label;
        const locName = [form.city, form.address].filter(Boolean).join(', ') || countryLabel || 'Location';
        await fetch(`${bpApiBaseUrl}/locationAddress?parentId=${newId}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: locName,
            addressLine1: form.address || null,
            addressLine2: form.address2 || null,
            postalCode: form.postalCode || null,
            cityName: form.city || null,
            country: form.country || null,
            region: form.region || null,
            shipToAddress: 'Y',
            invoiceToAddress: 'Y',
          }),
        }).catch(() => null);
      }

      // Steps 3, 4, 5 — parallel: contact persons + bank accounts + billing preferences
      const contacts = (repeatables.contacts ?? []).filter(c => c.firstName || c.lastName || c.email || c.phone);
      const banks = (repeatables.bankAccount ?? []).filter(b => b.bankName || b.iban || b.genericAccountNo);

      const billingPatch = getBillingPatch(opts, form);

      await Promise.all([
        // Step 3 — contact persons (C_BPartner_Contact)
        ...contacts.map(async (c) => {
          const contactRes = await fetch(`${bpApiBaseUrl}/contact?parentId=${newId}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              parentId: newId,
              businessPartner: newId,
              firstName: c.firstName,
              lastName: c.lastName,
              name: [c.firstName, c.lastName].filter(Boolean).join(' '),
              ...(c.email && { email: c.email }),
              ...(c.phone && { phone: c.phone }),
              isdefaultfordocs: false,
              commercialauth: false,
              viasms: false,
              viaemail: false,
            }),
          });
          const contactBody = await contactRes.json().catch(() => null);
          if (!contactRes.ok) {
            throw new Error(
              contactBody?.error?.message ||
              contactBody?.response?.error?.message ||
              contactBody?.message ||
              `Contact POST failed (HTTP ${contactRes.status})`
            );
          }
        }),
        // Step 4 — bank accounts (C_BPartner_Bank_Account)
        ...banks.map(async (b) => {
          const bankRes = await fetch(`${bpApiBaseUrl}/bankAccount?parentId=${newId}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              parentId: newId,
              bankFormat: b.bankAccountFormat || 'GENERIC',
              ...(b.bankName && { bankName: b.bankName }),
              ...(b.genericAccountNo && { accountNo: b.genericAccountNo }),
              ...(b.iban && { iBAN: b.iban }),
              ...(form.country && { country: form.country }),
            }),
          });
          if (!bankRes.ok) {
            const raw = await bankRes.text().catch(() => '');
            throw new Error(`Bank account POST failed (HTTP ${bankRes.status}): ${raw.slice(0, 300)}`);
          }
        }),
        // Step 5 — billing preferences PATCH
        Object.keys(billingPatch).length > 0
          ? fetch(`${bpApiBaseUrl}/businessPartner/${newId}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify(billingPatch),
            }).then(async patchRes => {
              if (!patchRes.ok) {
                const err = await patchRes.json().catch(() => null);
                throw new Error(toErrMsg(err?.message) || toErrMsg(err?.error) || `${ui('createContactError')} (billing PATCH ${patchRes.status})`);
              }
            })
          : Promise.resolve(),
      ]);
    } catch (e) {
      // BP was created in Step 1 but subsequent steps failed — roll it back to avoid orphans
      if (newId) {
        await fetch(`${bpApiBaseUrl}/businessPartner/${newId}`, { method: 'DELETE', headers }).catch(() => null);
      }
      throw e;
    }

    onCreated({ id: newId, name: newName });
    onClose();
  };

  return (
    <EntityCreationModal
      title={ui('newContact')}
      saveLabel={ui('saveContact')}
      {...contactModalConfig}
      titleRightContent={<ContactModeToggle
        contactType={contactType}
        onChange={setContactType}
        data-testid="ContactModeToggle__d67dd1" />}
      headerFields={headerFields}
      requiredFields={requiredFields}
      progressFields={progressFields}
      validate={validateForm}
      initialValues={{
        name: '',
        etgoFirstname: '',
        etgoLastname: '',
        taxID: '',
        taxIdType: '1',
        creditLimit: 0,
        discount: '',
        isCustomer: documentType === 'sale',
        isVendor: documentType === 'purchase',
        customerBlock: false,
        paymentBlock: false,
        salesPriceList: '',
        paymentMethod: '',
        paymentTerm: '',
        financialAccount: '',
        purchasePriceList: '',
        paymentMethodPO: '',
        paymentTermPO: '',
        financialAccountPO: '',
        address: '',
        address2: '',
        postalCode: '',
        city: '',
        country: '',
        region: '',
        etgoEmail: '',
        etgoPhone: '',
        etgoWeb: '',
      }}
      opts={optsWithRetry}
      componentMap={COMPONENT_MAP}
      onSave={handleSave}
      onCancel={onClose}
      onFieldChange={handleFieldChange}
      data-testid="EntityCreationModal__d67dd1" />
  );
}
