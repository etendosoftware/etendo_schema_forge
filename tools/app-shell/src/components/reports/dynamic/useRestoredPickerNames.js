import { useEffect } from 'react';
import { detectBaseUrl } from '@etendosoftware/app-shell-core/auth';
import { useApiFetch } from '@/auth/useApiFetch.js';

// The selectors' own page cap (the year selector's, ReportSelectorsServlet MAX_LIMIT): there is no lookup by id.
const LIMIT = 100;

/**
 * ETP-6239 — a picker restored from the URL carries ids only (names in a link would be unchecked text shown
 * as a label and printed in the export header). Resolves the names through the selector endpoints the
 * pickers already use, once, and writes them to `_display_<name>`. The query never waits for it; an item
 * outside the first page, or a failed lookup, keeps showing its id.
 */
export function useRestoredPickerNames(pickers, state, setState) {
  const apiFetch = useApiFetch(detectBaseUrl());
  useEffect(() => {
    let cancelled = false;
    for (const { name, selector } of pickers) {
      const ids = state[name] ? state[name].split(',') : [];
      if (!ids.length || state[`_display_${name}`]) continue;
      apiFetch(`/sws/report-selectors/${selector}?q=&limit=${LIMIT}&offset=0`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const items = Array.isArray(data) ? data : data?.items ?? [];
          const byId = new Map(items.map((i) => [i.id, i.name]));
          if (cancelled || !ids.some((id) => byId.has(id))) return;
          // Only if the user has not picked something else meanwhile.
          setState((s) => (s[name] === ids.join(',') && !s[`_display_${name}`] ? { ...s, [`_display_${name}`]: ids.map((id) => byId.get(id) || id).join(', ') } : s));
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
    // Once, for what the URL restored: later picks write their own names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
