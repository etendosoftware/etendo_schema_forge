import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useUI } from '@/i18n';
import BillingPreferencesForm from './BillingPreferencesForm';
import ContactsSummaryWidget from './ContactsSummaryWidget';


function CreditLimitStepper({ value, readOnly, onChange, onBlur, saving }) {
  const ui = useUI();
  const num = value === '' || value == null ? 0 : Number(value);
  const debounceRef = useRef(null);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function step(delta) {
    if (readOnly || saving) return;
    const next = Math.max(0, num + delta);
    onChange(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onBlur();
      debounceRef.current = null;
    }, 400);
  }

  return (
    <div className="flex flex-col gap-2 w-[236px]">
      <div className="flex items-center gap-1 h-6">
        <span className="text-sm font-medium text-[#121217]">{ui('creditLimitField')}</span>
        <span className="text-sm text-[#F53D6B]">*</span>
      </div>
      <div className="flex flex-row items-center h-10 border border-[#D1D4DB] rounded-lg shadow-[0px_1px_2px_rgba(18,18,23,0.05)] overflow-hidden bg-white hover:bg-[#F5F7F9] focus-within:border-[#121217] focus-within:shadow-[0px_0px_0px_1px_#121217] transition-colors">
        <input
          type="number"
          value={num}
          readOnly={readOnly || saving}
          onChange={e => !readOnly && !saving && onChange(e.target.value)}
          onBlur={onBlur}
          className="flex-1 px-3 text-sm text-[#121217] bg-transparent outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={readOnly || saving}
          className="w-10 h-[38px] flex items-center justify-center border-l border-[#E8EAEF] text-[#828FA3] hover:bg-gray-50 disabled:opacity-40 shrink-0"
        >
          <Minus size={16} data-testid="Minus__d55d36" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={readOnly || saving}
          className="w-10 h-[38px] flex items-center justify-center border-l border-[#E8EAEF] text-[#828FA3] hover:bg-gray-50 disabled:opacity-40 shrink-0"
        >
          <Plus size={16} data-testid="Plus__d55d36" />
        </button>
      </div>
    </div>
  );
}

export default function ContactsFinancialPanel({ data, token, apiBaseUrl, catalogs, api, editing, onChange }) {
  const ui = useUI();
  const [creditTaxDraft, setCreditTaxDraft] = useState({});
  const [savingField, setSavingField] = useState(null);
  const draftRef = useRef({});

  useEffect(() => {
    const nextDraft = {
      creditLimit: data?.creditLimit ?? '',
      creditUsed: data?.creditUsed ?? '',
      active: data?.active ?? true,
    };
    setCreditTaxDraft(nextDraft);
    draftRef.current = nextDraft;
  }, [data?.creditLimit, data?.creditUsed, data?.active]);

  const creditTaxReadOnly = useMemo(() => (
    editing ? {} : { creditLimit: true, creditUsed: true, active: true }
  ), [editing]);

  async function persistCreditTaxField(fieldKey) {
    if (!data?.id || !apiBaseUrl || !token) return;
    if (creditTaxReadOnly[fieldKey]) return;

    const currentValue = draftRef.current[fieldKey] ?? '';
    const originalValue = data?.[fieldKey] ?? '';
    if (String(currentValue ?? '') === String(originalValue ?? '')) return;

    setSavingField(fieldKey);
    try {
      const normalizedValue = fieldKey === 'creditLimit'
        ? (currentValue === '' || currentValue == null ? null : Number(currentValue))
        : (currentValue === '' ? null : currentValue);
      const payload = { [fieldKey]: normalizedValue };
      const res = await fetch(`${apiBaseUrl}/businessPartner/${data.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setCreditTaxDraft(prev => ({ ...prev, [fieldKey]: originalValue }));
        draftRef.current = { ...draftRef.current, [fieldKey]: originalValue };
        return;
      }

      const responseData = await res.json().catch(() => null);
      const saved = responseData?.response?.data?.[0] ?? responseData;
      const finalValue = saved?.[fieldKey] ?? payload[fieldKey];
      const nextDraft = { ...draftRef.current, [fieldKey]: finalValue ?? '' };
      draftRef.current = nextDraft;
      setCreditTaxDraft(nextDraft);
      if (saved && typeof onChange === 'function') {
        onChange(fieldKey, finalValue);
      }
    } finally {
      setSavingField(null);
    }
  }

  function handleCreditTaxChange(fieldKey, value) {
    const next = { ...draftRef.current, [fieldKey]: value };
    draftRef.current = next;
    setCreditTaxDraft(next);
  }

  return (
    <div className="space-y-2 pb-6">
      <ContactsSummaryWidget
        data={data}
        optionalProvider={true}
        data-testid="ContactsSummaryWidget__d55d36" />
      {/* Crédito — layout fila: texto izquierda + stepper derecha */}
      <div className="flex flex-row items-start px-5 pt-2 pb-3 gap-5">
        <div className="flex flex-col gap-1 w-[148px] shrink-0">
          <div className="text-sm font-semibold text-[#121217]">{ui('creditTax')}</div>
          <div className="text-xs text-[#282833]">{ui('creditTaxDescription')}</div>
        </div>
        <div className="flex-1">
          <CreditLimitStepper
            value={creditTaxDraft.creditLimit}
            readOnly={!!creditTaxReadOnly.creditLimit}
            onChange={(val) => handleCreditTaxChange('creditLimit', val)}
            onBlur={() => persistCreditTaxField('creditLimit')}
            saving={savingField === 'creditLimit'}
            data-testid="CreditLimitStepper__d55d36" />
        </div>
      </div>
      <hr className="border-t border-[#E8EAEF] mx-5" />
      {/* Preferencias de facturación — layout fila: texto izquierda + contenido derecha */}
      <div className="flex flex-row items-start px-5 pt-2 pb-3 gap-5">
        <div className="flex flex-col gap-1 w-[148px] shrink-0">
          <div className="text-sm font-semibold text-[#121217]">{ui('billingPreferences')}</div>
          <div className="text-xs text-[#282833]">{ui('billingPreferencesDesc')}</div>
        </div>
        <div className="flex-1">
          <BillingPreferencesForm
            data={data}
            entity="businessPartner"
            api={api}
            token={token}
            catalogs={catalogs}
            onChange={onChange}
            editing={editing}
            apiBaseUrl={apiBaseUrl}
            data-testid="BillingPreferencesForm__d55d36" />
        </div>
      </div>
    </div>
  );
}
