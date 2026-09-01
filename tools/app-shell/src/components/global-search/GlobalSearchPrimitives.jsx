import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils.js';

export function GlobalSearchDialog({ children, onOpenChange, open, ...props }) {
  const [rect, setRect] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const anchor = document.querySelector('[data-testid="global-search-trigger"]');
      if (anchor) setRect(anchor.getBoundingClientRect());
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open]);
  if (!open) return null;
  return (
    <div {...props} data-testid="CommandDropdown__8e5d1a" className="fixed z-50" style={rect ? { left: rect.left, top: rect.bottom + 8, width: rect.width } : { left: 16, top: 72, right: 16 }}>
      <div className="relative flex max-h-[min(700px,calc(100vh-120px))] flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border-control))] bg-card text-popover-foreground shadow-lg">
        {children}
        <button type="button" onClick={() => onOpenChange?.(false)} aria-label="Close" className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function GlobalSearchList({ children, className, ...props }) {
  return <div {...props} className={cn('min-h-0 overflow-y-auto overflow-x-hidden [&>section+section]:border-t [&>section+section]:border-border/50', className)}>{children}</div>;
}
export function GlobalSearchGroup({ heading, children, className, ...props }) {
  return <section {...props} className={cn('px-2 py-1.5', className)}><h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{heading}</h3>{children}</section>;
}
export function GlobalSearchItem({ children, onSelect, className, disabled = false, ...props }) {
  return <button type="button" {...props} disabled={disabled} onClick={onSelect} className={cn('relative flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent disabled:pointer-events-none disabled:opacity-50', className)} data-global-search-item="true">{children}</button>;
}
export function GlobalSearchEmpty({ children, ...props }) { return <div {...props} className="py-6 text-center text-sm">{children}</div>; }
