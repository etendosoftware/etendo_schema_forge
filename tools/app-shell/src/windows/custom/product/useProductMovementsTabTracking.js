import { useEffect, useRef } from 'react';
import { trackProductMovementsTabOpened } from '@/lib/productUsageTelemetry.js';

/**
 * ETP-5889 — records one `product_movements_tab_opened` each time the Movements tab is shown.
 *
 * `DetailView` mounts every custom tab as soon as a record opens and only hides the inactive ones
 * (`display: none`), handing each an `isActive` flag. Firing on mount would therefore count every
 * product opened, whether or not anybody looked at this tab, so the event follows `isActive`
 * instead: a tab that becomes active, or that is already active when it mounts (landing on it
 * through `openSecondaryTab`), is one opening. Staying active across re-renders is not.
 *
 * `source` says how the user got here: 'tab' (the default) or 'side_panel_link'.
 */
export function useProductMovementsTabTracking({
  isActive,
  source = 'tab',
  entity = 'product',
  specName = 'product',
} = {}) {
  const wasActive = useRef(false);

  useEffect(() => {
    if (isActive && !wasActive.current) {
      trackProductMovementsTabOpened({ entity, specName, source });
    }
    wasActive.current = Boolean(isActive);
  }, [isActive, entity, specName, source]);
}
