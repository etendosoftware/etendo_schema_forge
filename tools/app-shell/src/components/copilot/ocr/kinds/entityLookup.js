import { useEffect, useState } from 'react';

import { useApiFetch } from '@/auth/useApiFetch.js';
export const SEARCH_DEBOUNCE_MS = 250;

export function escHql(value) {
  return String(value).replace(/'/g, "''");
}

export function deriveEntityEndpoint({ entitySpec, apiBaseUrl, contactsBase } = {}) {
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

export function useEntitySearch({ open, endpoint, token, query, filter, limit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const apiFetch = useApiFetch('');

  useEffect(() => {
    if (!open || !endpoint || !token) return undefined;
    let cancelled = false;
    const trimmed = query.trim();
    const timer = setTimeout(async () => {
      setLoading(true);
      const baseFilter = filter || 'active = true';
      const where = trimmed
        ? `lower(name) like lower('%${escHql(trimmed)}%') and ${baseFilter}`
        : baseFilter;
      const url = `${endpoint}?_neoWhere=${encodeURIComponent(where)}&limit=${limit}`;
      try {
        const res = await apiFetch(url, { baseUrl: '' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        const data = json?.response?.data ?? json?.data ?? [];
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
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
  }, [open, endpoint, token, query, filter, limit, apiFetch]);

  return { items, loading };
}
