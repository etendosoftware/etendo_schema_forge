import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isMovementsPresetRequest } from './productSidebarPeriod';

/**
 * ETP-5908 — the Movements tab side of the side panel's "Ver movimientos" link.
 *
 * The link navigates to the same path with `state: { openSecondaryTab: 'custom:movements',
 * movementsPeriod: 'last6m' }`. DetailView activates the tab; this hook (the tab stays mounted while
 * hidden) consumes `movementsPeriod` once: it hands the preset to `onPeriod` and clears the router state
 * (`replace`, so Back is not polluted) so a reload or a re-render never re-applies it. With the tab not
 * available (`enabled` false) the request is ignored and left untouched.
 *
 * Returns the telemetry `source` of the next opening: 'side_panel_link' from the moment a request is
 * consumed until the tab is deactivated again, 'tab' otherwise.
 */
export function useMovementsPeriodRequest({ enabled, isActive, onPeriod }) {
  const location = useLocation();
  const navigate = useNavigate();
  const requested = location.state?.movementsPeriod;
  const [viaLink, setViaLink] = useState(false);
  const wasActive = useRef(false);
  const onPeriodRef = useRef(onPeriod);
  onPeriodRef.current = onPeriod;

  useEffect(() => {
    if (!enabled || !requested) return;
    if (isMovementsPresetRequest(requested)) {
      onPeriodRef.current({ presetId: requested });
      setViaLink(true);
    }
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, requested]);

  useEffect(() => {
    if (wasActive.current && !isActive) setViaLink(false);
    wasActive.current = Boolean(isActive);
  }, [isActive]);

  return viaLink ? 'side_panel_link' : 'tab';
}
