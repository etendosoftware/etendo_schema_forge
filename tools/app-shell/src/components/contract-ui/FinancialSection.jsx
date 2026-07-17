import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useUI } from '@/i18n';
import { MODAL_STYLES } from './modal-styles.js';
import { LABEL_GAP, FIELD_HEIGHT } from '@/components/ui/formDensity';

const TRIGGER_CLS =
  `w-full ${FIELD_HEIGHT} flex items-center justify-between gap-2 rounded-md border border-input bg-white px-3 !text-[14px] text-left hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary transition-colors cursor-pointer`;
// ETP-4321: height now comes from the FIELD_HEIGHT class (36px). Keep fontSize
// only — the inline height would otherwise override the token.
const TRIGGER_STYLE = { fontSize: '14px' };

function Checkbox({ checked, onChange, label, small }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'h-4 w-4 shrink-0 rounded-sm border border-primary shadow',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          checked ? 'bg-primary text-primary-foreground' : 'bg-transparent',
        ].join(' ')}
      >
        {checked && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            className="h-4 w-4"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <label
        className={`cursor-pointer select-none ${small ? 'text-[13px] font-medium text-muted-foreground' : 'text-[14px] font-medium text-gray-900'}`}
        onClick={() => onChange(!checked)}
      >
        {label}
      </label>
    </div>
  );
}

function DynamicSelect({ value, onChange, options = [], loading, error, onRetry, loadingLabel, errorLabel, retryLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const selectedLabel = options.find(o => o.id === value)?.label ?? '';

  if (loading) {
    return (
      <button type="button" disabled style={TRIGGER_STYLE} className={`${TRIGGER_CLS} opacity-50`}>
        <span className="truncate text-muted-foreground">{loadingLabel}</span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted-foreground"
          data-testid="ChevronDown__4e3585" />
      </button>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" disabled style={TRIGGER_STYLE} className={`${TRIGGER_CLS} flex-1 opacity-50`}>
          <span className="truncate text-muted-foreground">{errorLabel}</span>
          <ChevronDown
            size={14}
            className="shrink-0 text-muted-foreground"
            data-testid="ChevronDown__4e3585" />
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap transition-colors"
        >
          {retryLabel}
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        style={TRIGGER_STYLE}
        className={TRIGGER_CLS}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`truncate ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selectedLabel || '—'}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted-foreground"
          data-testid="ChevronDown__4e3585" />
      </button>
      {open && (
        <ul className="absolute z-50 left-0 right-0 top-[calc(100%+2px)] bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto py-1">
          <li>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left text-muted-foreground hover:bg-gray-50"
              onClick={() => { onChange(''); setOpen(false); }}
            >
              <span className="w-4 shrink-0" />
              —
            </button>
          </li>
          {options.map(o => (
            <li key={o.id}>
              <button
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-gray-50 ${value === o.id ? 'text-primary font-medium' : 'text-foreground'}`}
                onClick={() => { onChange(o.id); setOpen(false); }}
              >
                <span className="w-4 shrink-0">
                  {value === o.id && <Check size={12} data-testid="Check__4e3585" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FinancialSection({ form, onChange, opts }) {
  const ui = useUI();

  const dynProps = (key) => ({
    options: opts[key]?.options ?? [],
    loading: opts[key]?.loading,
    error: opts[key]?.error,
    onRetry: opts[key]?.onRetry,
    loadingLabel: ui('loadingOptions'),
    errorLabel: ui('errorLoadingOptions'),
    retryLabel: ui('retryLoad'),
  });

  return (
    <div className="space-y-5">
      {/* Customer */}
      <div className="space-y-3">
        <Checkbox
          checked={!!form.isCustomer}
          onChange={v => onChange('isCustomer', v)}
          label={ui('customer')}
          data-testid="Checkbox__4e3585" />
        {form.isCustomer && (
          <div className="pl-6 space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div className={LABEL_GAP}>
                <label style={MODAL_STYLES.fieldLabel}>{ui('salesPriceListField')}</label>
                <DynamicSelect
                  {...dynProps('salesPriceLists')}
                  value={form.salesPriceList ?? ''}
                  onChange={v => onChange('salesPriceList', v)}
                  data-testid="DynamicSelect__4e3585" />
              </div>
              <div className={LABEL_GAP}>
                <label style={MODAL_STYLES.fieldLabel}>{ui('paymentMethodField')}</label>
                <DynamicSelect
                  {...dynProps('paymentMethods')}
                  value={form.paymentMethod ?? ''}
                  onChange={v => onChange('paymentMethod', v)}
                  data-testid="DynamicSelect__4e3585" />
              </div>
              <div className={LABEL_GAP}>
                <label style={MODAL_STYLES.fieldLabel}>{ui('paymentTermField')}</label>
                <DynamicSelect
                  {...dynProps('paymentTerms')}
                  value={form.paymentTerm ?? ''}
                  onChange={v => onChange('paymentTerm', v)}
                  data-testid="DynamicSelect__4e3585" />
              </div>
              <div className={LABEL_GAP}>
                <label style={MODAL_STYLES.fieldLabel}>{ui('financialAccountField')}</label>
                <DynamicSelect
                  {...dynProps('financialAccounts')}
                  value={form.financialAccount ?? ''}
                  onChange={v => onChange('financialAccount', v)}
                  data-testid="DynamicSelect__4e3585" />
              </div>
            </div>
            <Checkbox
              small
              checked={!!form.customerBlock}
              onChange={v => onChange('customerBlock', v)}
              label={ui('customerBlockField')}
              data-testid="Checkbox__4e3585" />
          </div>
        )}
      </div>
      {/* Vendor */}
      <div className="space-y-3">
        <Checkbox
          checked={!!form.isVendor}
          onChange={v => onChange('isVendor', v)}
          label={ui('isVendorField')}
          data-testid="Checkbox__4e3585" />
        {form.isVendor && (
          <div className="pl-6 space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div className={LABEL_GAP}>
                <label style={MODAL_STYLES.fieldLabel}>{ui('purchasePriceListField')}</label>
                <DynamicSelect
                  {...dynProps('purchasePriceLists')}
                  value={form.purchasePriceList ?? ''}
                  onChange={v => onChange('purchasePriceList', v)}
                  data-testid="DynamicSelect__4e3585" />
              </div>
              <div className={LABEL_GAP}>
                <label style={MODAL_STYLES.fieldLabel}>{ui('paymentMethodPOField')}</label>
                <DynamicSelect
                  {...dynProps('paymentMethods')}
                  value={form.paymentMethodPO ?? ''}
                  onChange={v => onChange('paymentMethodPO', v)}
                  data-testid="DynamicSelect__4e3585" />
              </div>
              <div className={LABEL_GAP}>
                <label style={MODAL_STYLES.fieldLabel}>{ui('paymentTermPOField')}</label>
                <DynamicSelect
                  {...dynProps('paymentTerms')}
                  value={form.paymentTermPO ?? ''}
                  onChange={v => onChange('paymentTermPO', v)}
                  data-testid="DynamicSelect__4e3585" />
              </div>
              <div className={LABEL_GAP}>
                <label style={MODAL_STYLES.fieldLabel}>{ui('financialAccountPOField')}</label>
                <DynamicSelect
                  {...dynProps('financialAccounts')}
                  value={form.financialAccountPO ?? ''}
                  onChange={v => onChange('financialAccountPO', v)}
                  data-testid="DynamicSelect__4e3585" />
              </div>
            </div>
            <Checkbox
              small
              checked={!!form.paymentBlock}
              onChange={v => onChange('paymentBlock', v)}
              label={ui('vendorBlockField')}
              data-testid="Checkbox__4e3585" />
          </div>
        )}
      </div>
    </div>
  );
}
