import { useEffect, useRef } from 'react';
import { detectBaseUrl } from '@etendosoftware/app-shell-core/auth';
import { useApiFetch } from '@/auth/useApiFetch.js';

/**
 * ETP-6239 — a picker restored from the URL carries ids only (names in a link would be unchecked text shown
 * as a label and printed in the export header). Resolves exactly those ids once (`?ids=`, any number of
 * rows, not just the selector's first page) and writes `_display_<name>` (joined, for the export header)
 * plus `_names_<name>` (the array, so a name containing a comma survives). An id the lookup answers
 * without (stale, deleted, out of the role's reach) is dropped from the selection, and so from the URL.
 * The query never waits for it; a failed lookup keeps showing the ids.
 */
export function useRestoredPickerNames(pickers, state, setState) {
  const apiFetch = useApiFetch(detectBaseUrl());
  const started = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    // Once, for what the URL restored (later picks write their own names); `state` is read only then.
    if (started.current) return;
    started.current = true;
    for (const { name, selector } of pickers) {
      const idsStr = state[name];
      if (!idsStr || state[`_display_${name}`]) continue;
      const ids = idsStr.split(',');
      apiFetch(`/sws/report-selectors/${selector}?ids=${encodeURIComponent(idsStr)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!mounted.current || !data) return;
          const byId = new Map((Array.isArray(data) ? data : data.items ?? []).map((i) => [i.id, i.name]));
          const kept = ids.filter((id) => byId.has(id));
          const names = kept.map((id) => byId.get(id));
          // Only if the user has not picked something else meanwhile.
          setState((s) => (s[name] === idsStr && !s[`_display_${name}`]
            ? { ...s, [name]: kept.join(','), [`_display_${name}`]: names.join(', '), [`_names_${name}`]: names }
            : s));
        })
        .catch(() => {});
    }
  }, [apiFetch, pickers, state, setState]);
}
