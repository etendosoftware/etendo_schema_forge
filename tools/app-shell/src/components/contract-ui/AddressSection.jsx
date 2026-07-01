import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { MODAL_STYLES } from './modal-styles.js';
import { LABEL_GAP, FIELD_HEIGHT_IMPORTANT } from '@/components/ui/formDensity';

const INPUT_CLS =
  `w-full ${FIELD_HEIGHT_IMPORTANT} rounded-md border border-gray-300 bg-white px-3 !text-[14px] focus:outline-none focus:ring-2 focus:ring-primary`;
const PICKER_BTN_CLS =
  `w-full ${FIELD_HEIGHT_IMPORTANT} rounded-md border border-gray-300 bg-white px-3 !text-[14px] flex items-center justify-between gap-2 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary transition-colors`;

function normalizeText(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function OptionPicker({ open, onClose, title, options, loading, failed, loadError, query, onQuery, onSelect, selected, searchPlaceholder }) {
  const ui = useUI();
  const searchRef = useRef(null);

  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    return q ? options.filter(o => normalizeText(o.label).includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 40);
      return () => clearTimeout(t);
    } else {
      onQuery('');
    }
  }, [open, onQuery]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md max-h-[540px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={ui('cancel')}
          >
            <X size={16} data-testid="X__e483be" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search
              className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 pointer-events-none"
              data-testid="Search__e483be" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => onQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="option-picker-search w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto py-1">
          {(() => {
            if (loading) return <div className="px-4 py-6 text-center text-sm text-gray-500">{ui('loading')}</div>;
            if (failed) return <div className="px-4 py-6 text-center text-sm text-gray-500">{loadError}</div>;
            if (filtered.length === 0) return <div className="px-4 py-6 text-center text-sm text-gray-500">{ui('noResults')}</div>;
            return filtered.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelect(opt.id, opt.label)}
                className={[
                  'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-gray-50',
                  selected === opt.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800',
                ].join(' ')}
              >
                <span className="w-4 shrink-0">
                  {selected === opt.id ? <Check size={14} data-testid="Check__e483be" /> : null}
                </span>
                <span className="truncate">{opt.label}</span>
              </button>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}

const RequiredMark = () => (
  <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>
);

export default function AddressSection({ form, onChange, opts, requiredFields = [] }) {
  const ui = useUI();
  const isRequired = (id) => requiredFields.includes(id);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [regionQuery, setRegionQuery] = useState('');

  const countries = opts.countries?.options ?? [];
  const regions = opts.regions?.options ?? [];

  const countryLabel = useMemo(
    () => countries.find(c => c.id === form.country)?.label ?? '',
    [countries, form.country]
  );
  const regionLabel = useMemo(
    () => regions.find(r => r.id === form.region)?.label ?? '',
    [regions, form.region]
  );

  function handleCountrySelect(id) {
    onChange('country', id);
    onChange('region', '');
    setCountryPickerOpen(false);
  }

  function handleRegionSelect(id) {
    onChange('region', id);
    setRegionPickerOpen(false);
  }

  return (
    <>
      {/*
        Layout: 4 equal columns.
        Row 1: Primera línea | Segunda línea | Código postal | Ciudad
        Row 2: País | Región | — | —
      */}
      <div className="address-grid">
        {/* Row 1 */}
        <div className={LABEL_GAP}>
          <label style={MODAL_STYLES.fieldLabel}>{ui('addressLine1')}{isRequired('address') && <RequiredMark data-testid="RequiredMark__e483be" />}</label>
          <input type="text" className={INPUT_CLS} value={form.address ?? ''} onChange={e => onChange('address', e.target.value)} />
        </div>
        <div className={LABEL_GAP}>
          <label style={MODAL_STYLES.fieldLabel}>{ui('addressLine2')}{isRequired('address2') && <RequiredMark data-testid="RequiredMark__e483be" />}</label>
          <input type="text" className={INPUT_CLS} value={form.address2 ?? ''} onChange={e => onChange('address2', e.target.value)} />
        </div>
        <div className={LABEL_GAP}>
          <label style={MODAL_STYLES.fieldLabel}>{ui('postalCodeLabel')}{isRequired('postalCode') && <RequiredMark data-testid="RequiredMark__e483be" />}</label>
          <input type="text" className={INPUT_CLS} value={form.postalCode ?? ''} onChange={e => onChange('postalCode', e.target.value.replace(/[^\d\s-]/g, ''))} />
        </div>
        <div className={LABEL_GAP}>
          <label style={MODAL_STYLES.fieldLabel}>{ui('cityLabel')}{isRequired('city') && <RequiredMark data-testid="RequiredMark__e483be" />}</label>
          <input type="text" className={INPUT_CLS} value={form.city ?? ''} onChange={e => onChange('city', e.target.value)} />
        </div>

        {/* Row 2 */}
        <div className={LABEL_GAP}>
          <label style={MODAL_STYLES.fieldLabel}>{ui('countryLabel')}{isRequired('country') && <RequiredMark data-testid="RequiredMark__e483be" />}</label>
          <button type="button" onClick={() => setCountryPickerOpen(true)} className={`picker-btn ${PICKER_BTN_CLS}`}>
            <span className={`truncate ${form.country ? 'text-foreground' : 'text-muted-foreground'}`}>{countryLabel || '—'}</span>
            <ChevronDown
              size={14}
              className="text-muted-foreground shrink-0"
              data-testid="ChevronDown__e483be" />
          </button>
        </div>
        <div className={LABEL_GAP}>
          <label style={MODAL_STYLES.fieldLabel}>{ui('regionLabel')}</label>
          <button
            type="button"
            onClick={() => form.country && setRegionPickerOpen(true)}
            disabled={!form.country}
            className={`picker-btn ${PICKER_BTN_CLS} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className={`truncate ${form.region ? 'text-foreground' : 'text-muted-foreground'}`}>
              {!form.country ? ui('selectCountryFirst') : (regionLabel || '—')}
            </span>
            <ChevronDown
              size={14}
              className="text-muted-foreground shrink-0"
              data-testid="ChevronDown__e483be" />
          </button>
        </div>
        <div /><div />
      </div>
      {/* Country picker */}
      <OptionPicker
        open={countryPickerOpen}
        onClose={() => setCountryPickerOpen(false)}
        title={ui('countryLabel')}
        options={countries}
        loading={opts.countries?.loading}
        failed={!!opts.countries?.error}
        loadError={ui('countryLoadError')}
        query={countryQuery}
        onQuery={setCountryQuery}
        onSelect={handleCountrySelect}
        selected={form.country}
        searchPlaceholder={ui('countrySearchPlaceholder')}
        data-testid="OptionPicker__e483be" />
      {/* Region picker */}
      <OptionPicker
        open={regionPickerOpen}
        onClose={() => setRegionPickerOpen(false)}
        title={ui('regionLabel')}
        options={regions}
        loading={opts.regions?.loading}
        failed={!!opts.regions?.error}
        loadError={ui('regionLoadError')}
        query={regionQuery}
        onQuery={setRegionQuery}
        onSelect={handleRegionSelect}
        selected={form.region}
        searchPlaceholder={ui('regionSearchPlaceholder')}
        data-testid="OptionPicker__e483be" />
    </>
  );
}
