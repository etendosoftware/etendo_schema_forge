import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { useUI } from '@/i18n';

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (['true', 'y', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'n', 'no', '0'].includes(normalized)) return false;
  return null;
}

function getSalesFlagFromOption(option) {
  if (!option || typeof option !== 'object') return null;
  for (const [key, value] of Object.entries(option)) {
    if (!key.toLowerCase().includes('salespricelist')) continue;
    const parsed = parseBoolean(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function getSalesFlagFromRow(row) {
  return parseBoolean(row?.['priceListVersion$salesPriceList']);
}

function extractReferenceId(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === 'object') {
    const objectId = value.id ?? value.value ?? value.key ?? null;
    return extractReferenceId(objectId);
  }
  return null;
}

async function extractErrorMessage(res) {
  try {
    const data = await res.json();
    if (data?.error?.message) return data.error.message;
    if (data?.response?.error?.message) return data.response.error.message;
    if (typeof data?.response?.error === 'string') return data.response.error;
    if (data?.message) return data.message;
  } catch {
    // Ignore non-JSON responses.
  }
  return `Error ${res.status}`;
}

const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£', JPY: '¥' };

function getCurrencySymbol(iso) {
  return CURRENCY_SYMBOLS[iso] ?? iso ?? '';
}

/**
 * Numeric field with a currency prefix and − / + stepper buttons.
 * Edits are committed on blur or (debounced) after a step. Matches the
 * Credit limit stepper styling used in the Contact window.
 */
function PriceStepper({ value, prefix, disabled, onCommit }) {
  const [local, setLocal] = useState(String(value ?? ''));
  const debounceRef = useRef(null);

  useEffect(() => { setLocal(String(value ?? '')); }, [value]);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const num = local === '' || local == null ? 0 : Number(local);

  function step(delta) {
    if (disabled) return;
    const base = Number.isFinite(num) ? num : 0;
    const next = Math.max(0, base + delta);
    setLocal(String(next));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onCommit(next);
      debounceRef.current = null;
    }, 400);
  }

  return (
    <div className="flex flex-row items-center h-10 border border-[#D1D4DB] rounded-lg shadow-[0px_1px_2px_rgba(18,18,23,0.05)] overflow-hidden bg-white focus-within:border-[#121217] focus-within:shadow-[0px_0px_0px_1px_#121217] transition-colors">
      {prefix && <span className="pl-3 text-sm text-[#121217] select-none">{prefix}</span>}
      <input
        type="number"
        step="0.01"
        value={local}
        disabled={disabled}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onCommit(local === '' ? 0 : Number(local))}
        className="flex-1 px-3 text-sm text-[#121217] bg-transparent outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={disabled}
        className="w-10 h-[38px] flex items-center justify-center border-l border-[#E8EAEF] text-[#828FA3] hover:bg-gray-50 disabled:opacity-40 shrink-0"
      >
        <Minus size={16} data-testid="Minus__d76b90" />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={disabled}
        className="w-10 h-[38px] flex items-center justify-center border-l border-[#E8EAEF] text-[#828FA3] hover:bg-gray-50 disabled:opacity-40 shrink-0"
      >
        <Plus size={16} data-testid="Plus__d76b90" />
      </button>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div className="flex items-center h-6">
      <span className="text-sm font-medium text-[#121217]">{children}</span>
    </div>
  );
}

export default function ProductPriceBar({ data, token, apiBaseUrl, catalogs, api, onCountChange }) {
  const ui = useUI();
  const recordId = data?.id;

  const [priceRows, setPriceRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('sales');
  const [savingId, setSavingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [lazyOptions, setLazyOptions] = useState([]);
  const [lazyLoading, setLazyLoading] = useState(false);

  const priceSelector = useMemo(() => (
    api?.selectors?.find(sel => sel.entity === 'price' && (sel.field === 'priceListVersion' || sel.column === 'M_PriceList_Version_ID'))
  ), [api]);

  const selectorColumn = priceSelector?.column ?? 'M_PriceList_Version_ID';

  const eagerOptions = useMemo(() => (
    priceSelector ? getCatalogOptions(catalogs, 'price', priceSelector) : []
  ), [catalogs, priceSelector]);

  const refreshPrices = useCallback(async () => {
    if (!recordId || !token) {
      setPriceRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/price?parentId=${recordId}&_startRow=0&_endRow=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const payload = await res.json();
      setPriceRows(payload?.response?.data ?? []);
    } catch {
      setPriceRows([]);
    } finally {
      setLoading(false);
    }
  }, [recordId, token, apiBaseUrl]);

  useEffect(() => { refreshPrices(); }, [refreshPrices]);

  useEffect(() => {
    if (priceRows !== null) onCountChange?.(priceRows.length);
  }, [priceRows, onCountChange]);

  // Lazily fetch price list version options when the add-row selector needs them.
  useEffect(() => {
    if (!adding) return undefined;
    if (Array.isArray(eagerOptions) && eagerOptions.length > 0) return undefined;
    if (lazyOptions.length > 0) return undefined;
    if (!apiBaseUrl || !token) return undefined;

    let aborted = false;
    setLazyLoading(true);
    fetch(`${apiBaseUrl}/price/selectors/${selectorColumn}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : null))
      .then(payload => {
        if (aborted) return;
        const options = (payload?.items ?? []).map(item => ({
          id: item.id,
          name: item.label || item.name || item.id,
          ...item,
        }));
        setLazyOptions(options);
      })
      .catch(() => { if (!aborted) setLazyOptions([]); })
      .finally(() => { if (!aborted) setLazyLoading(false); });

    return () => { aborted = true; };
  }, [adding, eagerOptions, lazyOptions.length, apiBaseUrl, token, selectorColumn]);

  const hasRows = Array.isArray(priceRows) && priceRows.length > 0;
  const saleRows = hasRows ? priceRows.filter(r => getSalesFlagFromRow(r) === true) : [];
  const purchaseRows = hasRows ? priceRows.filter(r => getSalesFlagFromRow(r) === false) : [];

  const isSales = activeSection === 'sales';
  const sectionRows = isSales ? saleRows : purchaseRows;

  const currencySymbol = useMemo(() => {
    const fromRow = (priceRows ?? []).find(r => r.currencySymbol)?.currencySymbol;
    return fromRow || getCurrencySymbol(null);
  }, [priceRows]);

  const effectiveOptions = (Array.isArray(eagerOptions) && eagerOptions.length > 0) ? eagerOptions : lazyOptions;

  const availableOptions = useMemo(() => {
    if (!Array.isArray(effectiveOptions)) return [];
    const presentIds = new Set((priceRows ?? []).map(r => String(r.priceListVersion)));
    return effectiveOptions.filter(opt => {
      const flag = getSalesFlagFromOption(opt);
      const matchesSection = flag === null ? true : flag === isSales;
      const id = extractReferenceId(opt.id);
      return matchesSection && id && !presentIds.has(String(id));
    });
  }, [effectiveOptions, priceRows, isSales]);

  const patchField = useCallback(async (row, field, value) => {
    const current = String(row[field] ?? '');
    if (String(value) === current) return;
    setSavingId(row.id);
    // Optimistic local update.
    setPriceRows(prev => (prev ?? []).map(r => (r.id === row.id ? { ...r, [field]: value } : r)));
    try {
      const res = await fetch(`${apiBaseUrl}/price/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [field]: String(value) }),
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      toast.success(ui('pricingUpdated'));
    } catch (err) {
      toast.error(err?.message || ui('priceUnableToSave'));
      await refreshPrices();
    } finally {
      setSavingId(null);
    }
  }, [apiBaseUrl, token, ui, refreshPrices]);

  const handleDelete = useCallback(async (row) => {
    setSavingId(row.id);
    try {
      const res = await fetch(`${apiBaseUrl}/price/${row.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      await refreshPrices();
    } catch (err) {
      toast.error(err?.message || ui('priceUnableToSave'));
    } finally {
      setSavingId(null);
    }
  }, [apiBaseUrl, token, ui, refreshPrices]);

  const handleAdd = useCallback(async (plvId) => {
    if (!plvId) return;
    setSavingId('new');
    try {
      const res = await fetch(`${apiBaseUrl}/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          parentId: recordId,
          product: recordId,
          priceListVersion: plvId,
          standardPrice: '0',
          listPrice: '0',
          priceLimit: '0',
        }),
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      setAdding(false);
      await refreshPrices();
    } catch (err) {
      toast.error(err?.message || ui('priceUnableToSave'));
    } finally {
      setSavingId(null);
    }
  }, [apiBaseUrl, token, recordId, ui, refreshPrices]);

  if (!recordId) {
    return (
      <div className="p-2">
        <div className="text-sm text-gray-500 mt-1">{ui('saveProductFirstPricing')}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" data-testid="Loader2__d76b90" />
          {ui('loadingPricing')}
        </div>
      </div>
    );
  }

  const sectionTitle = isSales ? ui('priceSalesListsTitle') : ui('pricePurchaseListsTitle');

  return (
    <div className="flex flex-row items-start gap-14 px-3 py-3">
      {/* Left column — Sales / Purchase toggle */}
      <div className="flex flex-col gap-2 pt-3 shrink-0">
        {[
          { key: 'sales', label: ui('priceTabSales'), testId: 'price-tab-sales' },
          { key: 'purchase', label: ui('priceTabPurchase'), testId: 'price-tab-purchase' },
        ].map(opt => (
          <button
            key={opt.key}
            type="button"
            data-testid={opt.testId}
            onClick={() => { setActiveSection(opt.key); setAdding(false); }}
            className={[
              'flex items-center justify-center px-3 h-10 rounded-lg text-sm font-medium transition-colors',
              activeSection === opt.key
                ? 'bg-[#F5F7F9] text-[#121217]'
                : 'text-[#121217] hover:bg-[#F5F7F9]/60',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {/* Right column — active section */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 pt-3">
        <div className="flex items-center gap-2 h-8">
          <h3 className="text-lg font-semibold text-[#121217]">{sectionTitle}</h3>
          <span className="inline-flex items-center px-2 h-6 text-xs text-[#3F3F50] bg-[#F5F7F9] border border-[#D1D4DB] rounded-lg">
            {sectionRows.length}
          </span>
        </div>

        {sectionRows.length === 0 && !adding && (
          <div className="text-sm text-gray-400">{ui('priceNoLists')}</div>
        )}

        {sectionRows.map(row => {
          const name = row['priceListVersion$_identifier'] || row['priceList$_identifier'] || '';
          const saving = savingId === row.id;

          return (
            <div key={row.id} className="flex flex-col gap-1 group/row">
              <div className="flex flex-row items-end gap-5">
                {/* Name */}
                <div className="flex flex-col gap-2 w-[300px] shrink-0">
                  <FieldLabel data-testid="FieldLabel__d76b90">{ui('priceColName')}</FieldLabel>
                  <input
                    type="text"
                    readOnly
                    value={name}
                    className="h-10 px-3 text-sm text-[#121217] bg-white border border-[#D1D4DB] rounded-lg shadow-[0px_1px_2px_rgba(18,18,23,0.05)] outline-none truncate"
                  />
                </div>
                {/* Unit price */}
                <div className="flex flex-col gap-2 w-[201px] shrink-0">
                  <FieldLabel data-testid="FieldLabel__d76b90">{ui('priceColUnitPrice')}</FieldLabel>
                  <PriceStepper
                    value={row.standardPrice}
                    prefix={currencySymbol}
                    disabled={saving}
                    onCommit={v => patchField(row, 'standardPrice', v)}
                    data-testid="PriceStepper__d76b90" />
                </div>
                {/* List price */}
                <div className="flex flex-col gap-2 w-[201px] shrink-0">
                  <FieldLabel data-testid="FieldLabel__d76b90">{ui('priceColListPrice')}</FieldLabel>
                  <PriceStepper
                    value={row.listPrice}
                    prefix={currencySymbol}
                    disabled={saving}
                    onCommit={v => patchField(row, 'listPrice', v)}
                    data-testid="PriceStepper__d76b90" />
                </div>
                {/* Delete */}
                <div className="flex items-center h-10 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDelete(row)}
                    disabled={saving}
                    title={ui('priceRemove')}
                    data-testid={`price-delete-${row.id}`}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-[#D50B3E] hover:text-red-700 hover:bg-red-50 disabled:opacity-40 opacity-0 group-hover/row:opacity-100 transition-all"
                  >
                    {saving ? <Loader2 size={18} className="animate-spin" data-testid="Loader2__d76b90" /> : <Trash2 className="h-5 w-5" data-testid="Trash2__d76b90" />}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add-tariff selector row */}
        {adding && (
          <div className="flex flex-col gap-2 w-[300px]">
            <FieldLabel data-testid="FieldLabel__d76b90">{ui('priceColName')}</FieldLabel>
            <select
              autoFocus
              disabled={savingId === 'new' || (lazyLoading && availableOptions.length === 0)}
              defaultValue=""
              onChange={e => handleAdd(e.target.value)}
              className="h-10 px-3 text-sm text-[#121217] bg-white border border-[#D1D4DB] rounded-lg shadow-[0px_1px_2px_rgba(18,18,23,0.05)] outline-none focus:border-[#121217] disabled:opacity-60"
            >
              <option value="" disabled>
                {lazyLoading && availableOptions.length === 0 ? ui('loadingPricing') : ui('priceSelectVersion')}
              </option>
              {availableOptions.map(opt => {
                const id = extractReferenceId(opt.id);
                return <option key={id} value={id}>{opt.name || opt.label || id}</option>;
              })}
            </select>
          </div>
        )}

        {/* Add new tariff link */}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            data-testid="price-add-tariff"
            className="flex items-center gap-1 text-sm font-medium text-[#121217] underline w-fit mt-1"
          >
            <Plus size={20} className="text-[#828FA3]" data-testid="Plus__d76b90" />
            {ui('priceAddTariff')}
          </button>
        )}
      </div>
    </div>
  );
}
