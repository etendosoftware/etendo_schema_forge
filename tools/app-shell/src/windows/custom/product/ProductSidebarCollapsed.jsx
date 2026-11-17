import { Package, Warehouse } from 'lucide-react';
import { useUI } from '@/i18n';
import { SIDEBAR_PANEL_ID } from './ProductSidebarDividerToggle';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
const BTN = `inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted ${FOCUS}`;

// Collapsed 48 px strip of the product side panel (ETP-5908 RF-16). The width itself is switched by
// `sidebarClassName` in artifacts/product/decisions.json via `has-[[data-product-sidebar-collapsed=true]]`,
// driven by the marker attribute rendered here. Only the two tab icons live here: the open/close control is the
// single ProductSidebarDividerToggle button on the divider.
export default function ProductSidebarCollapsed({ onSelectTab }) {
  const ui = useUI();
  const tabs = [
    { tab: 'summary', Icon: Package, label: ui('summary'), testId: 'ProductSidebarStripSummary' },
    { tab: 'warehouses', Icon: Warehouse, label: ui('warehouses'), testId: 'ProductSidebarStripWarehouses' },
  ];
  return (
    <aside
      aria-label={ui('productSidePanel')}
      id={SIDEBAR_PANEL_ID}
      data-product-sidebar-collapsed="true"
      data-testid="ProductSidebarCollapsed"
      className="flex flex-col items-center gap-2 pt-2"
    >
      {tabs.map(({ tab, Icon, label, testId }) => (
        <button
          key={tab}
          type="button"
          onClick={() => onSelectTab(tab)}
          title={label}
          aria-label={label}
          className={BTN}
          data-testid={testId}
        >
          <Icon size={20} aria-hidden="true" data-testid="Icon__ba169c" />
        </button>
      ))}
    </aside>
  );
}
