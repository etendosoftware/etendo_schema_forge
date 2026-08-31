import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUI } from '@/i18n';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';

import { useApiFetch } from '@/auth/useApiFetch.js';
const SELECTOR_PAGE = 50;

function buildSelectPlaceholder(ui, label) {
  return label ? `${ui('selectLabelPrefix')} ${label}...` : ui('selectPlaceholder');
}

/**
 * Radix Select wrapper for FK fields rendered as a pure dropdown (no free-text typing).
 *
 * Used by EntityForm (full record form) and DataTable's InlineAddRow (inline new-row).
 * The `compact` prop swaps the trigger to a table-cell-sized variant.
 *
 * Options are resolved from:
 * 1. The server selector at `selectorUrl` (lazy-loaded on first dropdown open, paginated).
 * 2. `catalogs` (mock/dev fallback, only when no selectorUrl is configured).
 *
 * If the current value is not present in the loaded options (e.g. a stale FK), a hidden
 * SelectItem keeps Radix able to display the current label without offering it for re-selection.
 */
export function SelectorInput({
  entityName,
  field,
  value,
  displayValue,
  onChange,
  catalogs,
  resolvedLabel,
  selectorUrl,
  selectorContext,
  token,
  compact = false,
  triggerClassName,
  optionTranslator,
}) {
  const ui = useUI();
  const apiFetch = useApiFetch();
  const catalogOptions = selectorUrl ? [] : getCatalogOptions(catalogs, entityName, field);
  const [serverOptions, setServerOptions] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [fetching, setFetching] = useState(false);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const offsetRef = useRef(0);
  // Guards fetchPage's .then()/.catch() against setState after unmount — fetchPage
  // is triggered imperatively from a callback ref (dropdown open / scroll), not from
  // inside a useEffect, so there's no natural cleanup to cancel it. Without this, an
  // in-flight fetch that settles after unmount still calls the state setters below,
  // which can crash (not just warn) if the environment itself is gone by then — e.g.
  // dispatchSetState -> getCurrentEventPriority reading `window` when it no longer exists.
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  // Compare selectorContext by content, not by reference. DetailView/EntityForm
  // recreate the context object on every render even when values are identical,
  // which would otherwise make fetchPage (and the SelectContent ref callback that
  // depends on it) re-identify on every render and re-trigger fetches indefinitely.
  const contextKey = JSON.stringify(selectorContext ?? {});

  const fetchPage = useCallback((offset) => {
    if (!selectorUrl || loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setFetching(true);
    const url = buildUrlWithParams(selectorUrl, {
      ...selectorContext,
      limit: SELECTOR_PAGE,
      offset,
    });
    apiFetch(url, { baseUrl: '' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        loadingRef.current = false;
        if (!isMountedRef.current) return;
        const items = data?.items ?? data?.response?.data ?? (Array.isArray(data) ? data : null);
        if (items) {
          const mapped = items.map(i => ({ id: i.id, name: i.label ?? i.name ?? i.id }));
          setServerOptions(prev => offset === 0 ? mapped : [...(prev ?? []), ...mapped]);
          offsetRef.current = offset + items.length;
          if (items.length < SELECTOR_PAGE) { setHasMore(false); hasMoreRef.current = false; }
        } else {
          setHasMore(false);
          hasMoreRef.current = false;
          if (offset === 0) setServerOptions([]);
        }
        setFetching(false);
      })
      .catch(() => {
        loadingRef.current = false;
        if (isMountedRef.current) setFetching(false);
      });
  }, [selectorUrl, contextKey, token, apiFetch]);

  // Invalidate cached options when the URL or the selector context changes.
  // We do NOT eager-fetch here — the identifier (`<field>$_identifier`) usually
  // arrives with the default/record payload, so the trigger can render the label
  // without a list. The actual fetch is deferred to the first time the user opens
  // the dropdown.
  useEffect(() => {
    offsetRef.current = 0;
    hasMoreRef.current = true;
    setHasMore(true);
    setServerOptions(null);
  }, [selectorUrl, token, contextKey]);

  // Callback ref: fires when SelectContent mounts (dropdown opens).
  // Triggers the first page load if we don't have server options yet, then attaches
  // the scroll listener for infinite pagination.
  const contentCallbackRef = useCallback((node) => {
    if (!node || !selectorUrl) return;
    if (serverOptions === null && !loadingRef.current) {
      fetchPage(0);
    }
    const viewport = node.querySelector('[data-radix-select-viewport]') ?? node;
    viewport.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      if (scrollHeight - scrollTop - clientHeight < 100) fetchPage(offsetRef.current);
    }, { passive: true });
  }, [fetchPage, selectorUrl, serverOptions]);

  const baseOptions = serverOptions ?? catalogOptions;
  const hasValue = value && baseOptions.some(opt => opt.id === value);

  const defaultTriggerClass = compact
    ? 'w-full h-8 text-sm bg-card focus:ring-2 focus:ring-primary'
    : 'focus:ring-2 focus:ring-primary';

  // Radix shows the placeholder when the controlled value is EITHER '' or undefined
  // (see @radix-ui/react-select shouldShowPlaceholder). We MUST use '' — never
  // undefined — for the empty state: Radix derives `isControlled` from
  // `prop !== undefined`, so flipping value between a string and `undefined`
  // silently toggles the Select between controlled and uncontrolled. During that
  // flip Radix's controllable-state hook swaps to a freshly-initialized internal
  // store, which SWALLOWS the onValueChange of the very selection that triggered
  // the flip — the "clearing an FK needs two clicks" bug (a selected FK cleared via
  // the empty option: first pick was dropped by the controlled→uncontrolled swap,
  // only the second pick landed). A constant-typed '' keeps the Select controlled
  // for its whole lifetime while still rendering the placeholder for the empty case,
  // including required fields (where the '__empty__' item is not offered).
  const selectValue = value ? value : '';
  // Optional FK fields can label their empty/null choice (e.g. "All accounts")
  // instead of a blank entry. When set, the empty value also reads as that label
  // on the trigger rather than the "Select X..." placeholder.
  const emptyLabel = field.emptyOptionLabelKey ? (ui(field.emptyOptionLabelKey) ?? field.emptyOptionLabelKey) : null;
  // Compact mode (inline tables) mirrors the placeholder style of plain text/
  // number inputs in the same row: just the field label in muted color, no
  // verbose "Select X..." prefix.
  const placeholderText = compact
    ? (emptyLabel ?? resolvedLabel ?? field.label ?? field.key)
    : (emptyLabel ?? buildSelectPlaceholder(ui, resolvedLabel ?? field.label ?? field.key));

  return (
    <Select
      value={selectValue}
      onValueChange={(val) => {
        if (val === '__empty__') {
          onChange('', '', null);
          return;
        }
        const opt = baseOptions.find(o => o.id === val);
        onChange(val, opt?.name, opt);
      }}
      required={field.required}
      data-testid={"Select__" + field.id}>
      <SelectTrigger
        id={field.key}
        data-testid={`field-${field.key}`}
        className={triggerClassName ?? defaultTriggerClass}
      >
        <SelectValue placeholder={placeholderText} data-testid={"SelectValue__" + field.id} />
        {fetching && <Loader2
          className="h-4 w-4 text-muted-foreground animate-spin ml-auto mr-1"
          data-testid={"Loader2__" + field.id} />}
      </SelectTrigger>
      <SelectContent ref={contentCallbackRef} data-testid={"SelectContent__" + field.id}>
        {!field.required && <SelectItem value="__empty__" data-testid={"SelectItem__" + field.id}>{emptyLabel || ' '}</SelectItem>}
        {!hasValue && value && displayValue && (
          <SelectItem
            key={`__current__${value}`}
            value={value}
            style={{ display: 'none', height: 0, padding: 0, overflow: 'hidden' }}
            aria-hidden="true"
            data-testid={"SelectItem__" + field.id}>
            {displayValue}
          </SelectItem>
        )}
        {baseOptions
          .filter(opt => !optionTranslator || optionTranslator(opt.name) !== null)
          .map(opt => (
            <SelectItem key={opt.id} value={opt.id} data-testid={`option-${field.key}-${opt.id}`}>
              {optionTranslator ? optionTranslator(opt.name) : opt.name}
            </SelectItem>
          ))}
        {hasMore && selectorUrl && (
          <div className="py-1 text-center text-xs text-muted-foreground select-none pointer-events-none">{ui('loading')}</div>
        )}
      </SelectContent>
    </Select>
  );
}

export default SelectorInput;
