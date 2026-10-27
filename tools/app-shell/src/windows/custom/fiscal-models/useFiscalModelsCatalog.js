// The fiscal models catalog (ETP-5831) — which AEAT models the client has switched on in
// "Modelos fiscales → Catálogo de modelos". One reader shared by every surface that gates on it
// (the declarations list, the Organization window's fiscal sections), so the endpoint, its shape
// and the empty-catalog rule live in one place.
//
// Source: `GET <neo base>/fiscal-models-catalog` — a client-level AD_PREFERENCE
// (ETGO_FiscalModelsCatalog, NeoFiscalModelsCatalogService.java), not scoped to any spec, shaped
// `{ "303": true, "390": false, ... }`.
//
// Empty-catalog rule: a catalog that was never saved answers `{}`, which means NO model is active.
// The registry's `defaultActive` is deliberately NOT applied here — it only seeds the catalog
// drawer's toggles. Every reader must agree on this, or one surface would show a model as active
// while another hides it.
import { useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { neoBase } from '@/components/related-documents/helpers.js';

/** True when the catalog `activeModels` marks model `id` as active. */
export function isModelActive(activeModels, id) {
  return activeModels?.[id] === true;
}

/**
 * Reads the catalog for the NEO base of `apiBaseUrl` (any spec URL under `/sws/neo/`).
 *
 * @param {string} apiBaseUrl a spec URL (`.../sws/neo/<spec>`); falsy → nothing is fetched
 * @param {*} [refreshKey] re-reads the catalog when it changes (e.g. the session token)
 * @returns {{ activeModels: object, setActiveModels: Function, loaded: boolean, error: * }}
 *   `loaded` turns true once the read settles, successfully or not. On failure `activeModels`
 *   stays `{}` (no model active) and `error` holds the cause.
 */
export function useFiscalModelsCatalog(apiBaseUrl, refreshKey) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const [activeModels, setActiveModels] = useState({});
  const [loaded, setLoaded] = useState(!apiBaseUrl);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiBaseUrl) return undefined;
    let cancelled = false;
    apiFetch(`${neoBase(apiBaseUrl)}/fiscal-models-catalog`, { baseUrl: '' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => {
        if (cancelled) return;
        setActiveModels(data ?? {});
        setError(null);
      })
      .catch(err => { if (!cancelled) setError(err ?? true); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [apiBaseUrl, apiFetch, refreshKey]);

  return { activeModels, setActiveModels, loaded, error };
}
