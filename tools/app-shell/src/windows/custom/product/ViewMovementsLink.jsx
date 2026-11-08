import { ArrowLeftRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { PRODUCT_MOVEMENTS_CAPABILITY, isCapabilityVisible } from '@/lib/capabilityVisibility.js';
import { MOVEMENTS_TAB_KEY, periodToMovementsPreset } from './productSidebarPeriod';

/**
 * ETP-5908 — "Ver movimientos" link under the side panel chart. Renders nothing unless the account has
 * the `productMovements` capability (fails closed). Clicking it opens the Movements tab prefiltered by
 * the panel period, through the route state DetailView already understands (`openSecondaryTab`). It navigates with
 * `replace` because it only changes UI state (active tab + filter): the entry it would push equals the
 * current one, so Back would appear to do nothing; with replace, one Back leaves the product page.
 */
export default function ViewMovementsLink({ period }) {
  const ui = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const enabled = isCapabilityVisible(useCapabilitiesSafe(), PRODUCT_MOVEMENTS_CAPABILITY);
  if (!enabled) return null;

  const open = () => navigate(`${location.pathname}${location.search}`, {
    replace: true,
    state: { openSecondaryTab: MOVEMENTS_TAB_KEY, movementsPeriod: periodToMovementsPreset(period) },
  });

  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        data-testid="ProductViewMovementsLink"
      >
        <span className="underline underline-offset-2">{ui('productMovementsViewLink')}</span>
        <ArrowLeftRight size={16} aria-hidden="true" data-testid="ArrowLeftRight__1e0b27" />
      </button>
    </div>
  );
}
