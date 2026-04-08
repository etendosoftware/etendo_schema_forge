import { useState, useEffect, useRef } from 'react';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { getSelectorCatalogKeys } from '@/lib/selectorCatalog.js';

/**
 * Hook that fetches selector/catalog data from NEO Headless API.
 *
 * Uses the `api.selectors` array from the generated contract to know
 * which selectors to fetch and at which URLs.
 *
 * Returns a catalogs object keyed by selector identity and, when unique, by reference name.
 * Each entry is an array of { id, name } objects (normalized from NEO's { id, label } format).
 *
 * Falls back to the static `fallback` catalogs (mock data) for selectors that fail or aren't available.
 */
export function useCatalogs(api, token, apiBaseUrl, fallback = {}, selectorContext = {}) {
  const [catalogs, setCatalogs] = useState(fallback);
  const [loaded, setLoaded] = useState(false);
  const fetchedRef = useRef(null);
  const selectorContextKey = JSON.stringify(selectorContext ?? {});
  const selectorsKey = JSON.stringify(
    (api?.selectors ?? []).map(sel => `${sel.entity}:${sel.column}:${sel.reference}`)
  );

  useEffect(() => {
    if (!api?.selectors?.length || !token || !apiBaseUrl) return;

    const fetchKey = `${apiBaseUrl}|${selectorsKey}|${selectorContextKey}`;
    if (fetchedRef.current === fetchKey) return;
    fetchedRef.current = fetchKey;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // Deduplicate selectors by entity+column.
    // Skip "search" inputMode fields — those use server-side ?q= fetching in SearchInput
    // and don't benefit from pre-loading 20 results.
    const seen = new Set();
    const unique = api.selectors.filter(sel => {
      if (sel.inputMode === 'search') return false;
      const key = `${sel.entity}:${sel.column}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const referenceCounts = unique.reduce((acc, sel) => {
      acc[sel.reference] = (acc[sel.reference] || 0) + 1;
      return acc;
    }, {});

    // Fetch all selectors in parallel
    const fetches = unique.map(async (sel) => {
      // NEO expects column name in the URL: /{entity}/selectors/{columnName}
      const url = buildUrlWithParams(
        `${apiBaseUrl}/${sel.entity}/selectors/${sel.column}`,
        selectorContext?.[sel.entity]
      );
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        const data = await res.json();
        const items = (data.items || []).map(item => ({
          id: item.id,
          name: item.label || item.name || item.id,
          // Preserve extra properties for dependent selectors (e.g., C_BPartner_ID on locations)
          ...item,
        }));
        return {
          selector: sel,
          items,
          allowReferenceKey: referenceCounts[sel.reference] === 1,
        };
      } catch {
        return null;
      }
    });

    Promise.all(fetches).then(resolved => {
      const results = {};
      for (const result of resolved) {
        if (result) {
          const keys = getSelectorCatalogKeys(result.selector.entity, result.selector).filter(key => (
            key !== result.selector.reference || result.allowReferenceKey
          ));
          for (const key of keys) {
            results[key] = result.items;
          }
        }
      }
      setCatalogs({ ...fallback, ...results });
      setLoaded(true);
    });
  }, [api, token, apiBaseUrl, fallback, selectorContextKey, selectorsKey]);

  return { catalogs, catalogsLoaded: loaded };
}
