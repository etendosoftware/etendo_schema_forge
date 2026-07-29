import { List, Shield } from 'lucide-react';
import { AttachmentIcon } from '@/components/attachments/AttachmentIcon';
import { PricingIcon, WarehouseProductsIcon } from '@/components/ui/custom-icons';

/**
 * Tab strip leaves — the icon and the button rendered by DetailView's primary and
 * secondary tab bars. Extracted from DetailView.jsx (ETP-4708): the file-lines ratchet
 * failed the branch, and the guard's own instruction is that new code goes into a
 * sub-component rather than into the god component. This is report §10 T22
 * ("extract PrimaryTabBar, a stateless leaf") arriving early because the guard asked
 * for it. Both components are presentational — no state, no hooks, no data access.
 */

const TAB_ICONS = {
  'custom:attachments': AttachmentIcon,
  'custom:sif': Shield,
  'custom:pricing': PricingIcon,
  'products': WarehouseProductsIcon,
};

/**
 * The identity attributes live on a wrapper rather than on the icon itself
 * because the non-lucide icons (AttachmentIcon, PricingIcon, WarehouseProductsIcon)
 * accept only `className` and drop any other prop, so a data-* passed through
 * createElement would silently vanish for exactly the tabs worth asserting.
 * `data-icon` names the resolved component: the unmapped case falls back to List
 * without throwing, so only the name distinguishes "no icon configured" from
 * "icon lookup broken".
 *
 * The wrapper is layout-transparent by construction, not by luck: as a flex item the
 * span is blockified, so `inline-flex` computes to `flex` and it shrink-wraps the
 * 16x16 svg as the same single flex item in the same slot — `items-center` and
 * `gap-2` on the button produce identical geometry either way (measured: 0px delta
 * on icon position, size, centring, label gap and button width). That holds ONLY
 * while the span has no padding, margin or fixed size. Do not "style" it.
 */
export function TabStripIcon({ iconKey }) {
  const Icon = TAB_ICONS[iconKey] ?? List;
  return (
    <span
      className="inline-flex"
      data-testid={`tab-icon-${iconKey}`}
      data-icon={Icon.displayName ?? Icon.name ?? 'unknown'}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function TabStripButton({
  iconKey, label, count, isActive, onClick,
  paddingY = 'py-2.5', showHoverLine = false, indicatorCls, tMenu, testId,
}) {
  const defaultCls = 'absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full';
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      data-active={isActive ? 'true' : 'false'}
      className={[
        `${showHoverLine ? 'group ' : ''}flex items-center gap-2 px-4 ${paddingY} text-sm font-medium transition-colors relative`,
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      <TabStripIcon iconKey={iconKey} />
      {tMenu(label)}
      {count != null && (
        <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 text-xs rounded-full bg-muted text-muted-foreground">
          {count}
        </span>
      )}
      {showHoverLine ? (
        <span className={[
          'absolute bottom-0 left-2 right-2 h-0.5 rounded-full transition-colors',
          isActive ? 'bg-foreground' : 'bg-transparent group-hover:bg-muted-foreground/30',
        ].join(' ')} />
      ) : (
        isActive && <span className={indicatorCls || defaultCls} />
      )}
    </button>
  );
}
