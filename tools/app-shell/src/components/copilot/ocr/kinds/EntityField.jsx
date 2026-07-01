import { useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { useUI } from '@/i18n';
import {
  deriveEntityEndpoint,
  useClickOutside,
  useEntitySearch,
} from './entityLookup';

const SEARCH_LIMIT = 20;

export default function EntityField({
  field,
  value,
  token,
  contactsBase,
  apiBaseUrl,
  createComponent: CreateComponent,
  onChange,
}) {
  const ui = useUI();
  const initialHint = useMemo(() => {
    if (value?.id) return '';
    const extracted = field?.extracted || {};
    const keys = Array.isArray(field?.extractFrom) ? field.extractFrom : [field?.extractFrom];
    for (const key of keys) {
      const candidate = key ? extracted?.[key] : null;
      if (candidate && String(candidate).trim()) return String(candidate).trim();
    }
    return '';
  }, [field, value]);
  const [query, setQuery] = useState(initialHint);
  const [open, setOpen] = useState(Boolean(initialHint));
  const [showCreate, setShowCreate] = useState(false);
  const wrapRef = useRef(null);

  const endpoint = useMemo(
    () => deriveEntityEndpoint({ entitySpec: field?.entitySpec, apiBaseUrl, contactsBase }),
    [field, contactsBase, apiBaseUrl],
  );

  useClickOutside(wrapRef, open, () => setOpen(false));

  const { items, loading } = useEntitySearch({
    open,
    endpoint,
    token,
    query,
    filter: field?.filter,
    limit: SEARCH_LIMIT,
  });

  const handleCreateSubmit = (decision) => {
    const record = decision?.created;
    if (!record?.id) {
      setShowCreate(false);
      return;
    }
    const label = record.name || ui('ocrReviewVendorCreate');
    onChange({
      id: record.id,
      label,
      bpId: record.id,
      bpCreate: null,
      locationCreate: null,
    });
    setShowCreate(false);
  };

  const createPrefilled = Object.fromEntries(
    Object.entries(field.createPrefilledFrom || {}).map(([target, source]) => [target, field.extracted?.[source] || '']),
  );
  if (!createPrefilled.name && query.trim()) createPrefilled.name = query.trim();

  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 focus-within:border-gray-900">
        <Search
          size={14}
          className="shrink-0 text-gray-400"
          data-testid={"Search__" + field.id} />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={value?.label || ui(field.searchPlaceholder || 'ocrReviewVendorSearch')}
          className="flex-1 text-sm text-gray-900 placeholder-gray-500 outline-none"
        />
        {loading && <Loader2
          size={14}
          className="animate-spin text-gray-400"
          data-testid={"Loader2__" + field.id} />}
      </div>
      {open && (CreateComponent || query.trim() || items.length > 0) && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {CreateComponent && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); setShowCreate(true); }}
              className="flex w-full items-center gap-1.5 border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-blue-50"
            >
              <Plus size={14} data-testid={"Plus__" + field.id} />
              {ui(field.createLabel || 'ocrReviewVendorCreate')}
            </button>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">{ui(field.noMatchesLabel || 'ocrReviewVendorNoMatches')}</div>
          )}
          {items.map((item) => {
            const label = item.name || item._identifier || item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChange({ id: item.id, label, bpId: item.id, bpCreate: null, locationCreate: null });
                  setQuery('');
                  setOpen(false);
                }}
                className="block w-full truncate px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      {showCreate && CreateComponent ? (
        <CreateComponent
          item={{ kind: 'createContact', payload: { prefilled: createPrefilled, documentType: field.createDocumentType || null } }}
          apiBaseUrl={apiBaseUrl}
          token={token}
          onCancel={() => setShowCreate(false)}
          onSubmit={handleCreateSubmit}
          data-testid={"CreateComponent__" + field.id} />
      ) : null}
    </div>
  );
}
