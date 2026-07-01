import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Loader2, Search, ChevronDown, Check, Plus } from 'lucide-react';
import { useUI } from '@/i18n';

/* eslint-disable react/prop-types */

const SELECTOR_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Resolves OCR-extracted product names that simSearch couldn't auto-match.
 * For each unmatched line the popup shows the original description on the
 * left and a search-and-pick selector on the right. From the picker the user
 * can also create a new Product on the fly. Lines left unselected when the
 * user clicks Continue are dropped from the invoice — the user can add them
 * manually after the import.
 *
 * Props:
 *   unmatched      — [{ idx, description, quantity?, unitPrice? }]
 *   selectorUrl    — full URL to the line product selector
 *                    (e.g. /sws/neo/purchase-invoice/lines/selectors/M_Product_ID)
 *   productSpecUrl — base URL of the product spec
 *                    (e.g. /sws/neo/product). Used to look up UOM / TaxCategory
 *                    selectors and to POST the product create.
 *   token          — bearer token
 *   onSubmit       — receives a map { [idx]: productId | null }
 *   onCancel       — discards the import entirely
 */
function SelectorOption({ option, selected, onPick, sizing = 'compact' }) {
  const base = 'flex w-full items-center gap-2 text-left hover:bg-gray-50';
  const pad = sizing === 'compact' ? 'px-3 py-2 text-sm' : 'px-4 py-2.5 text-sm';
  const tone = selected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800';
  return (
    <button
      type="button"
      onClick={() => onPick(option)}
      className={`${base} ${pad} ${tone}`}
    >
      <span className="w-4 shrink-0">{selected ? <Check size={14} data-testid="Check__b3ae11" /> : null}</span>
      <span className="truncate">{option.label}</span>
    </button>
  );
}

export default function ProductResolverPopup({
  unmatched = [],
  selectorUrl,
  productSpecUrl,
  token,
  onSubmit,
  onCancel,
}) {
  const ui = useUI();
  const authHeader = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // selections: { [idx]: { id, label } | null }
  const [selections, setSelections] = useState({});

  const cancel = () => onCancel?.();
  const submit = () => {
    const out = {};
    for (const row of unmatched) {
      out[row.idx] = selections[row.idx]?.id ?? null;
    }
    onSubmit?.(out);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {ui('ocrProductResolverTitle')}
          </h2>
          <button onClick={cancel} aria-label={ui('cancel')} className="text-gray-400 hover:text-gray-600">
            <X size={18} data-testid="X__b3ae11" />
          </button>
        </div>

        <div className="px-6 py-3 text-xs text-gray-500 border-b border-gray-100">
          {ui('ocrProductResolverHint')}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {unmatched.map((row) => (
            <ProductRow
              key={row.idx}
              row={row}
              selection={selections[row.idx] || null}
              onSelect={(value) => setSelections(prev => ({ ...prev, [row.idx]: value }))}
              selectorUrl={selectorUrl}
              productSpecUrl={productSpecUrl}
              authHeader={authHeader}
              token={token}
              ui={ui}
              data-testid="ProductRow__b3ae11" />
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={cancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            {ui('cancel')}
          </button>
          <button
            onClick={submit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            {ui('continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductRow({ row, selection, onSelect, selectorUrl, productSpecUrl, authHeader, token, ui }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex items-start gap-3 border border-gray-200 rounded-lg p-3">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          {ui('ocrProductExtracted')}
        </div>
        <div className="text-sm text-gray-900 break-words">{row.description}</div>
        {(row.quantity != null || row.unitPrice != null) && (
          <div className="text-xs text-gray-500 mt-1">
            {row.quantity != null && <span>{ui('ocrProductQty')}: {row.quantity}</span>}
            {row.quantity != null && row.unitPrice != null && <span> · </span>}
            {row.unitPrice != null && <span>{ui('ocrProductUnit')}: {row.unitPrice}</span>}
          </div>
        )}
      </div>
      <div className="w-72 shrink-0">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          {ui('ocrProductPick')}
        </div>
        <InlineSelector
          selectorUrl={selectorUrl}
          authHeader={authHeader}
          initialQuery={row.description}
          value={selection}
          onPick={onSelect}
          onCreateNew={productSpecUrl ? () => setCreating(true) : null}
          ui={ui}
          data-testid="InlineSelector__b3ae11" />
      </div>
      {creating && (
        <ProductCreateForm
          initialName={row.description}
          productSpecUrl={productSpecUrl}
          authHeader={authHeader}
          token={token}
          onCreated={(value) => { onSelect(value); setCreating(false); }}
          onCancel={() => setCreating(false)}
          ui={ui}
          data-testid="ProductCreateForm__b3ae11" />
      )}
    </div>
  );
}

function InlineSelector({ selectorUrl, authHeader, initialQuery, value, onPick, onCreateNew, ui }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Seed query with the extracted description the first time the picker opens.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (open && !seeded) {
      setQuery(initialQuery || '');
      setSeeded(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, seeded, initialQuery]);

  useEffect(() => {
    if (!open) return undefined;
    const handle = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  useEffect(() => {
    if (!open || !selectorUrl) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({
          limit: String(SELECTOR_PAGE_SIZE),
          offset: '0',
        });
        const trimmed = query.trim();
        if (trimmed) {
          const escaped = trimmed.replace(/'/g, "''");
          params.set('_query', trimmed);
          params.set('name', trimmed);
          params.set('_neoWhere', `lower(name) like '%${escaped.toLowerCase()}%' and active = true`);
        }
        const res = await fetch(`${selectorUrl}?${params}`, { headers: authHeader });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const list = data?.items ?? data?.response?.data ?? [];
        if (!cancelled) setItems(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) { setItems([]); setFailed(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, query, selectorUrl, authHeader]);

  const options = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({ id: item.id, label: item.label || item.name || item._identifier || item.id });
    }
    return out;
  }, [items]);

  const handlePick = (option) => {
    onPick({ id: option.id, label: option.label });
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between gap-2"
      >
        <span className={`truncate ${value ? 'text-gray-900' : 'text-gray-500'}`}>
          {value?.label || ui('ocrProductSkip')}
        </span>
        <ChevronDown
          size={16}
          className="text-gray-500 shrink-0"
          data-testid="ChevronDown__b3ae11" />
      </button>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-center gap-2 rounded-lg border border-gray-900 bg-white px-3 py-2">
        <Search size={14} className="text-gray-400 shrink-0" data-testid="Search__b3ae11" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ui('ocrProductSearchPlaceholder')}
          className="flex-1 text-sm text-gray-900 placeholder-gray-500 outline-none"
        />
        {loading && <Loader2
          size={14}
          className="animate-spin text-gray-400"
          data-testid="Loader2__b3ae11" />}
      </div>
      <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50"
          >
            <Plus size={14} className="shrink-0" data-testid="Plus__b3ae11" />
            <span className="truncate">{ui('ocrProductCreateNew')}</span>
          </button>
        )}
        {!loading && failed && (
          <div className="px-3 py-2 text-xs text-gray-500">{ui('ocrProductLoadError')}</div>
        )}
        {!loading && !failed && options.length === 0 && (
          <div className="px-3 py-2 text-xs text-gray-500">{ui('noResults')}</div>
        )}
        {options.map(o => (
          <SelectorOption
            key={o.id}
            option={o}
            selected={value?.id === o.id}
            onPick={handlePick}
            data-testid="SelectorOption__b3ae11" />
        ))}
      </div>
    </div>
  );
}

/**
 * Generic search-and-pick dialog. Hits a NEO selector endpoint, dedupes by id,
 * and lets the caller intercept a "+ Create new" action.
 */
function SelectorDialog({
  title,
  initialQuery,
  selectorUrl,
  authHeader,
  currentId,
  onPick,
  onClose,
  ui,
  createLabel,
  onCreateNew,
}) {
  const [query, setQuery] = useState(initialQuery || '');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!selectorUrl) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({
          limit: String(SELECTOR_PAGE_SIZE),
          offset: '0',
        });
        const trimmed = query.trim();
        if (trimmed) {
          // Selector endpoints (.../selectors/<col>) accept `name`/`_query`.
          // CRUD list endpoints accept `_neoWhere` (HQL fragment). Send all
          // three so either path filters server-side; unknown params are
          // ignored. Escape single quotes per HQL convention.
          const escaped = trimmed.replace(/'/g, "''");
          params.set('_query', trimmed);
          params.set('name', trimmed);
          params.set('_neoWhere', `lower(name) like '%${escaped.toLowerCase()}%' and active = true`);
        }
        const res = await fetch(`${selectorUrl}?${params}`, { headers: authHeader });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const list = data?.items ?? data?.response?.data ?? [];
        if (!cancelled) {
          setItems(Array.isArray(list) ? list : []);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, selectorUrl, authHeader]);

  const options = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({ id: item.id, label: item.label || item.name || item._identifier || item.id });
    }
    return out;
  }, [items]);

  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    if (!q) return options;
    return options.filter(o => normalizeText(o.label).includes(q));
  }, [options, query]);

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md max-h-[540px] bg-white rounded-xl shadow-2xl flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} data-testid="X__b3ae11" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              data-testid="Search__b3ae11" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={ui('ocrProductSearchPlaceholder')}
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto py-1">
          {onCreateNew && (
            <button
              type="button"
              onClick={onCreateNew}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left text-blue-700 hover:bg-blue-50 border-b border-gray-100"
            >
              <Plus size={14} className="shrink-0" data-testid="Plus__b3ae11" />
              <span className="truncate">{createLabel}</span>
            </button>
          )}
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" data-testid="Loader2__b3ae11" /> {ui('loading')}
            </div>
          )}
          {!loading && failed && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">{ui('ocrProductLoadError')}</div>
          )}
          {!loading && !failed && filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">{ui('noResults')}</div>
          )}
          {!loading && !failed && filtered.length > 0 && (
            filtered.map(o => (
              <SelectorOption
                key={o.id}
                option={o}
                selected={currentId === o.id}
                onPick={(opt) => onPick({ id: opt.id, label: opt.label })}
                sizing="comfortable"
                data-testid="SelectorOption__b3ae11" />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline create form for a new Product. Prefills `name` from the OCR
 * description and asks the user only for the fields the product spec defaults
 * can't supply on its own (UOM, TaxCategory). Everything else (searchKey,
 * productCategory, productType, purchase, sale, stocked) comes from
 * GET /product/product/defaults and is forwarded unchanged on create.
 *
 * The create POSTs directly to /sws/neo/product/product. This commits before
 * the batch runs, so a later failure leaves the product orphaned — the user
 * accepted that tradeoff in exchange for a simpler flow.
 */
function deriveSearchKey(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function ProductCreateForm({ initialName, productSpecUrl, authHeader, token, onCreated, onCancel, ui }) {
  const [name, setName] = useState(initialName || '');
  const [searchKey, setSearchKey] = useState(deriveSearchKey(initialName));
  const [skTouched, setSkTouched] = useState(false);
  const [uom, setUom] = useState(null);
  const [taxCategory, setTaxCategory] = useState(null);
  const [picker, setPicker] = useState(null); // 'uom' | 'taxCategory' | null
  const [defaults, setDefaults] = useState(null);
  const [defaultsFailed, setDefaultsFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleNameChange = (value) => {
    setName(value);
    if (!skTouched) setSearchKey(deriveSearchKey(value));
  };

  const handleSearchKeyChange = (value) => {
    setSearchKey(value);
    setSkTouched(true);
  };

  // Pull the product entity defaults once. productCategory, productType,
  // purchase, sale, stocked, etc. come from here unchanged.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${productSpecUrl}/product/defaults`, { headers: authHeader });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          const d = data?.defaults || {};
          setDefaults(d);
          // If the defaults endpoint did supply a searchKey and the user
          // hasn't typed anything yet, prefer the server value.
          if (d.searchKey && !skTouched && !searchKey) {
            setSearchKey(String(d.searchKey));
          }
        }
      } catch {
        if (!cancelled) setDefaultsFailed(true);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSpecUrl, authHeader]);

  const validate = () => {
    if (!name.trim()) return ui('ocrProductCreateNameRequired');
    if (!searchKey.trim()) return ui('ocrProductCreateSearchKeyRequired');
    if (!uom?.id) return ui('ocrProductCreateUomRequired');
    if (!taxCategory?.id) return ui('ocrProductCreateTaxRequired');
    return null;
  };

  const submit = async () => {
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }
    setSubmitting(true);
    try {
      const body = {
        ...(defaults || {}),
        name: name.trim(),
        searchKey: searchKey.trim(),
        uOM: uom.id,
        taxCategory: taxCategory.id,
      };
      // Drop the synthetic id field /defaults always returns.
      delete body.id;
      const res = await fetch(`${productSpecUrl}/product`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text().catch(() => '');
      let json = null;
      if (text) { try { json = JSON.parse(text); } catch { /* leave null */ } }
      if (!res.ok) {
        const msg = json?.response?.error?.message || json?.error?.message || text || `status ${res.status}`;
        throw new Error(msg);
      }
      const data = json?.response?.data?.[0] || json?.data?.[0] || json;
      const newId = data?.id;
      if (!newId) throw new Error(ui('ocrProductCreateFailed'));
      onCreated({ id: newId, label: data.name || name.trim() });
    } catch (e) {
      setError(e?.message || ui('ocrProductCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const uomSelectorUrl = productSpecUrl ? `${productSpecUrl}/product/selectors/C_UOM_ID` : null;
  const taxSelectorUrl = productSpecUrl ? `${productSpecUrl}/product/selectors/C_TaxCategory_ID` : null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{ui('ocrProductCreateTitle')}</h2>
          <button onClick={onCancel} aria-label={ui('cancel')} className="text-gray-400 hover:text-gray-600">
            <X size={18} data-testid="X__b3ae11" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{ui('ocrProductCreateName')}</label>
            <input
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{ui('ocrProductCreateSearchKey')}</label>
            <input
              type="text"
              value={searchKey}
              onChange={e => handleSearchKeyChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{ui('ocrProductCreateUom')}</label>
            <button
              type="button"
              onClick={() => setPicker('uom')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between gap-2"
            >
              <span className={`truncate ${uom ? 'text-gray-900' : 'text-gray-500'}`}>
                {uom?.label || ui('ocrProductCreateSelect')}
              </span>
              <ChevronDown
                size={16}
                className="text-gray-500 shrink-0"
                data-testid="ChevronDown__b3ae11" />
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{ui('ocrProductCreateTaxCategory')}</label>
            <button
              type="button"
              onClick={() => setPicker('taxCategory')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between gap-2"
            >
              <span className={`truncate ${taxCategory ? 'text-gray-900' : 'text-gray-500'}`}>
                {taxCategory?.label || ui('ocrProductCreateSelect')}
              </span>
              <ChevronDown
                size={16}
                className="text-gray-500 shrink-0"
                data-testid="ChevronDown__b3ae11" />
            </button>
          </div>
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {defaultsFailed && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              {ui('ocrProductCreateDefaultsFailed')}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
          >
            {ui('cancel')}
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 size={13} className="animate-spin" data-testid="Loader2__b3ae11" />}
            {ui('ocrProductCreate')}
          </button>
        </div>
      </div>
      {picker === 'uom' && uomSelectorUrl && (
        <SelectorDialog
          title={ui('ocrProductCreateUom')}
          initialQuery=""
          selectorUrl={uomSelectorUrl}
          authHeader={authHeader}
          currentId={uom?.id || null}
          onPick={(value) => { setUom(value); setPicker(null); }}
          onClose={() => setPicker(null)}
          ui={ui}
          data-testid="SelectorDialog__b3ae11" />
      )}
      {picker === 'taxCategory' && taxSelectorUrl && (
        <SelectorDialog
          title={ui('ocrProductCreateTaxCategory')}
          initialQuery=""
          selectorUrl={taxSelectorUrl}
          authHeader={authHeader}
          currentId={taxCategory?.id || null}
          onPick={(value) => { setTaxCategory(value); setPicker(null); }}
          onClose={() => setPicker(null)}
          ui={ui}
          data-testid="SelectorDialog__b3ae11" />
      )}
    </div>
  );
}
