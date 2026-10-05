import { useEffect, useState } from 'react';

import { useApiFetch } from '@/auth/useApiFetch.js';
import { buildSearchUrl, deriveSelectorUrl, readSearchRows } from '../ocrQuery.js';
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Endpoint an OCR entity field searches. `selector` (`<spec>/<entity>/<COLUMN>`) targets a
 * NEO selector; `entitySpec` (`<spec>/<entity>`) targets a CRUD list.
 */
export function deriveEntityEndpoint({ entitySpec, selector, apiBaseUrl, contactsBase } = {}) {
  if (selector) {
    const [selSpec, selEntity, column] = String(selector).split('/');
    return selSpec && selEntity && column
      ? deriveSelectorUrl(apiBaseUrl, selSpec, selEntity, column)
      : null;
  }
  const [spec, entity] = String(entitySpec || '').split('/');
  if (!spec || !entity) return null;
  if (spec === 'contacts') {
    return contactsBase ? `${contactsBase}/${entity}` : null;
  }
  if (!apiBaseUrl) return `/sws/neo/${spec}/${entity}`;
  const specBase = apiBaseUrl.replace(/\/[^/]+$/, '/' + spec);
  return `${specBase}/${entity}`;
}

export function useClickOutside(ref, enabled, onOutside) {
  useEffect(() => {
    if (!enabled) return undefined;
    const handle = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onOutside();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [enabled, ref, onOutside]);
}

export function useEntitySearch({ open, endpoint, token, query, params, limit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const apiFetch = useApiFetch('');
  // `params` is usually a config literal; key the effect on its content, not its identity.
  const paramsKey = JSON.stringify(params || {});

  useEffect(() => {
    if (!open || !endpoint) return undefined;
    let cancelled = false;
    const trimmed = query.trim();
    const timer = setTimeout(async () => {
      setLoading(true);
      const url = buildSearchUrl(endpoint, { query: trimmed, limit, params: JSON.parse(paramsKey) });
      try {
        const res = await apiFetch(url, { baseUrl: '' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        if (!cancelled) setItems(readSearchRows(json));
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, endpoint, token, query, paramsKey, limit, apiFetch]);

  return { items, loading };
}
