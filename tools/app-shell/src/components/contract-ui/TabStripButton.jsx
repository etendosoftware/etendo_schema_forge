import React from 'react';
import { List, Shield } from 'lucide-react';
import { AttachmentIcon } from '@/components/attachments/AttachmentIcon';
import { PricingIcon, WarehouseProductsIcon } from '@/components/ui/custom-icons';

const TAB_ICONS = {
  'custom:attachments': AttachmentIcon,
  'custom:sif': Shield,
  'custom:pricing': PricingIcon,
  'products': WarehouseProductsIcon,
};

export function TabStripButton({
  iconKey, label, count, isActive, onClick,
  paddingY = 'py-2.5', showHoverLine = false, indicatorCls, tMenu, testId,
}) {
  const defaultCls = 'absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full';
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={[
        `${showHoverLine ? 'group ' : ''}flex items-center gap-2 px-4 ${paddingY} text-sm font-medium transition-colors relative`,
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {React.createElement(TAB_ICONS[iconKey] ?? List, { className: 'h-4 w-4' })}
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
