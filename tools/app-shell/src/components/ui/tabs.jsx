import { createContext, useContext, useMemo } from 'react';
import { cn } from '@/lib/utils';

/** @type {React.Context<{ value: string; onValueChange: (v: string) => void } | null>} */
const TabsContext = createContext(null);

/**
 * Simple tab primitives — hand-built because Radix react-tabs is not installed.
 *
 * Usage:
 *   <Tabs value={tab} onValueChange={setTab}>
 *     <TabsList>
 *       <TabsTrigger value="one">One</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="one">...</TabsContent>
 *   </Tabs>
 */

export function Tabs({ value, onValueChange, children, className }) {
  const ctx = useMemo(() => ({ value, onValueChange }), [value, onValueChange]);
  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn('flex flex-col', className)}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }) {
  return (
    <div
      role="tablist"
      className={cn('flex flex-row items-end', className)}
    >
      {children}
    </div>
  );
}

/**
 * @param {{ value: string; children: React.ReactNode; icon?: React.ElementType; badge?: number; className?: string }} props
 */
export function TabsTrigger({ value, children, icon: Icon, badge, className }) {
  const ctx = useContext(TabsContext);
  const isActive = ctx?.value === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx?.onValueChange(value)}
      className={cn(
        'inline-flex items-center gap-1 px-3 py-3 text-sm transition-colors',
        'border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#121217] focus-visible:ring-offset-1',
        isActive
          ? 'border-[#121217] font-medium text-[#121217]'
          : 'border-transparent font-normal text-[#555B6D] hover:text-[#3f3f50]',
        className,
      )}
    >
      {Icon ? <Icon className="h-6 w-6 shrink-0" data-testid="Icon__fa4214" /> : null}
      <span className="px-1">{children}</span>
      {badge != null ? (
        <span className="flex items-center rounded-full bg-[#F5F7F9] px-2 py-1 text-xs font-normal leading-4 text-[#3F3F50]">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/**
 * @param {{ value: string; children: React.ReactNode; className?: string }} props
 */
export function TabsContent({ value, children, className }) {
  const ctx = useContext(TabsContext);
  if (ctx?.value !== value) return null;
  return (
    <div role="tabpanel" className={cn('flex flex-1 flex-col', className)}>
      {children}
    </div>
  );
}
