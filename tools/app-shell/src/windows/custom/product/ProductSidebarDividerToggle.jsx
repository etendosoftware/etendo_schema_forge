import { ArrowLineRightIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';

export const SIDEBAR_PANEL_ID = 'product-sidebar-panel';

// Positioned by CSS only, inside the side panel column (`relative`, overflow visible; ProductSidebarFrame keeps the
// scrolling in an inner layer so nothing clips the half of the circle that sticks out). `left: -0.5px` + `-translate-x-1/2`
// centres the 24 px circle on the column's 1 px `border-l`; `top-6` puts its top edge 24 px below the column top
// (8 px column padding + 8 px tab row padding = tabs at 16 px, the button 8 px below). Being a child of the column,
// it moves with the divider on every frame of the width animation, with no measurement.
const BUTTON_CLASS = 'absolute left-[-0.5px] top-6 z-20 h-6 w-6 -translate-x-1/2 inline-flex items-center justify-center rounded-full bg-card border border-border-control text-muted-foreground transition-colors hover:text-primary hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

// Single collapse/expand control of the product side panel, centred on the divider between the form and the
// panel. Same button in both states: the arrow rotates 180 degrees when the panel is collapsed.
export default function ProductSidebarDividerToggle({ collapsed, onToggle }) {
  const ui = useUI();
  // One accessible signal: a stable name + aria-expanded. The tooltip alone states the action for sighted users.
  const tooltip = ui(collapsed ? 'showPanel' : 'hidePanel');

  return (
    <button
      type="button"
      onClick={onToggle}
      title={tooltip}
      aria-label={ui('productSidebarPanelToggleLabel')}
      aria-controls={SIDEBAR_PANEL_ID}
      aria-expanded={!collapsed}
      data-collapsed={collapsed ? 'true' : 'false'}
      className={BUTTON_CLASS}
      data-testid={collapsed ? 'ProductSidebarOpenButton' : 'ProductSidebarCollapseButton'}
    >
      <ArrowLineRightIcon
        size={14}
        aria-hidden="true"
        className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
        data-testid="ArrowRightToLine__d1v7e2"
      />
    </button>
  );
}
