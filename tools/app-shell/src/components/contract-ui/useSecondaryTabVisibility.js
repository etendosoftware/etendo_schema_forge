import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrencyId } from '@/hooks/useCurrencyId.jsx';
import { buildTabVisibilityContext, isSecondaryTabVisible } from './detailViewHelpers.jsx';

/**
 * Inputs of the record-gated secondary tabs (`visibleWhen`, decisions.json `visibleWhenLogic`):
 * the LIVE header record (unsaved edits included, so a new invoice reacts to the Currency
 * field) and a stable context carrying the org currency. `OrgCurrencyId` stays null while the
 * session currency is loading, which the generated predicates treat as "hidden".
 */
export function useSecondaryTabVisibility({ hook, orgCurrencyCode }) {
  const orgCurrencyId = useCurrencyId();
  const ctx = useMemo(
    () => buildTabVisibilityContext({ orgCurrencyId, orgCurrencyCode }),
    [orgCurrencyId, orgCurrencyCode],
  );
  return { record: hook.editing ?? hook.selected, ctx };
}

/**
 * Fetch-on-reveal: the id-sync effect only re-selects secondary hooks when the record id
 * changes, so a saved record opened while the context was still loading would show an empty
 * tab once a `visibleWhen` tab appears. Re-fetch each record-gated tab that just became visible.
 */
export function useRevealedTabFetch({ secondaryTabs, secondaryHooks, capabilities, vis, selectedId }) {
  const visibleKeys = secondaryTabs
    .filter(st => st.visibleWhen && isSecondaryTabVisible(st, capabilities, vis.record, vis.ctx))
    .map(st => st.key)
    .join('|');
  const prevKeysRef = useRef(null);
  useEffect(() => {
    const prev = prevKeysRef.current;
    prevKeysRef.current = visibleKeys;
    if (prev === null || !selectedId || !visibleKeys) return;
    const before = new Set(prev.split('|'));
    visibleKeys.split('|').filter(k => !before.has(k)).forEach(key => {
      const idx = secondaryTabs.findIndex(st => st.key === key);
      secondaryHooks[idx]?.fetchChildren(selectedId, { force: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKeys]);
}

/**
 * `activeTab` is a numeric index into a `tabs` array rebuilt every render. Track the active
 * tab by its stable key and, whenever the tab-key signature changes (a tab hid or appeared,
 * shifting indices) while nobody changed `activeTab`: re-point the index at the same key, or
 * fall back to the first tab when that key is gone. If `activeTab` itself changed in the same
 * render (a click or a deep link) it is trusted as-is — never overridden by the stale key —
 * and only clamped to the first tab when out of range for the new tabs.
 */
export function useActiveTabResolver(tabs, activeTab, setActiveTab) {
  const activeKeyRef = useRef(null);
  const signatureRef = useRef(null);
  const indexRef = useRef(null);
  const signature = tabs.map(t => t.key).join('|');
  useEffect(() => {
    const prevKey = activeKeyRef.current;
    const signatureChanged = signatureRef.current !== null && signatureRef.current !== signature;
    const userMoved = indexRef.current !== null && indexRef.current !== activeTab;
    signatureRef.current = signature;
    indexRef.current = activeTab;
    let next = activeTab;
    if (signatureChanged && prevKey != null && !userMoved) {
      next = Math.max(tabs.findIndex(t => t.key === prevKey), 0);
    } else if (signatureChanged && activeTab >= tabs.length) {
      next = 0;
    }
    if (next !== activeTab) {
      indexRef.current = next;
      setActiveTab(next);
    }
    activeKeyRef.current = tabs[next]?.key ?? prevKey;
  }, [signature, activeTab]);
}

/**
 * The "Others" tab exists only when its hidden probe renders something. With `primaryTabs` the
 * tab is never auto-added (a primary tab holds those fields). ETP-5684: a capability-gated field
 * may be the only "other" one and capabilities can arrive after the probe ran, so the probe runs
 * again when they change — the reset is declared first so the mount pass ends with its answer.
 *
 * @returns {{ showOthers: boolean|null, othersRef: object }} `null` while probing
 */
export function useOthersProbe(primaryTabs, capabilities) {
  const [showOthers, setShowOthers] = useState(primaryTabs ? false : null);
  const othersRef = useRef(null);
  useEffect(() => {
    if (!primaryTabs) setShowOthers(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities]);
  useEffect(() => {
    if (showOthers === null && othersRef.current) {
      setShowOthers(othersRef.current.childElementCount > 0);
    }
  });
  return { showOthers, othersRef };
}
