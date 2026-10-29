import { useEffect } from 'react';
import { ENVIRONMENT_LIST_REFRESH_EVENT } from './useEnvironmentSwitch.js';
import { QUOTA_REFUSED_EVENT } from '../lib/planQuotas.js';

/** A visible app re-reads the environment list at most this often on its own. */
export const ENVIRONMENT_LIST_INTERVAL_MS = 5 * 60_000;

/**
 * Minimum spacing for the focus and interval triggers. A tab switch fires both `focus` and
 * `visibilitychange`, and rapid alt-tabbing must not re-run the live quota counts of every listed
 * tenant each time. The quota-refusal trigger ignores it: that read must reflect the refusal.
 */
export const ENVIRONMENT_LIST_MIN_SPACING_MS = 30_000;

/**
 * ETP-5051 — keeps `GET /sws/go/environments` (and with it the quota banner) fresh while the app
 * is open. Since O-3 every `useEnvironmentSwitch` instance shares ONE read through the
 * DataProvider query cache, and that cache has no refetch-on-focus or interval option, so the
 * triggers live here, mounted ONCE (`AppLayoutInner`), and each fires the existing
 * `ENVIRONMENT_LIST_REFRESH_EVENT`: one forced read that every instance joins. Never put these
 * triggers in `useEnvironmentSwitch`, which several components mount.
 *
 * Triggers:
 * - the tab regains focus (`focus`, or `visibilitychange` to visible);
 * - every {@link ENVIRONMENT_LIST_INTERVAL_MS} while the tab is visible;
 * - a write refused with 403 QUOTA_EXCEEDED (`QUOTA_REFUSED_EVENT`, see `announceQuotaRefusal`).
 *
 * The page-load read itself is not repeated: the spacing clock starts at mount.
 */
export function useEnvironmentListFreshness({ enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    let lastRefreshAt = Date.now();
    const visible = () => globalThis.document?.visibilityState !== 'hidden';
    const refresh = () => {
      lastRefreshAt = Date.now();
      globalThis.dispatchEvent(new Event(ENVIRONMENT_LIST_REFRESH_EVENT));
    };
    const refreshIfSpaced = () => {
      if (visible() && Date.now() - lastRefreshAt >= ENVIRONMENT_LIST_MIN_SPACING_MS) refresh();
    };
    const onVisibilityChange = () => {
      if (globalThis.document?.visibilityState === 'visible') refreshIfSpaced();
    };
    // A refresh fired by anyone (an upgrade, provisioning) also restarts the spacing clock.
    const onAnyRefresh = () => { lastRefreshAt = Date.now(); };

    globalThis.addEventListener('focus', refreshIfSpaced);
    globalThis.document?.addEventListener('visibilitychange', onVisibilityChange);
    globalThis.addEventListener(QUOTA_REFUSED_EVENT, refresh);
    globalThis.addEventListener(ENVIRONMENT_LIST_REFRESH_EVENT, onAnyRefresh);
    const timer = setInterval(refreshIfSpaced, ENVIRONMENT_LIST_INTERVAL_MS);
    return () => {
      globalThis.removeEventListener('focus', refreshIfSpaced);
      globalThis.document?.removeEventListener('visibilitychange', onVisibilityChange);
      globalThis.removeEventListener(QUOTA_REFUSED_EVENT, refresh);
      globalThis.removeEventListener(ENVIRONMENT_LIST_REFRESH_EVENT, onAnyRefresh);
      clearInterval(timer);
    };
  }, [enabled]);
}

export default useEnvironmentListFreshness;
