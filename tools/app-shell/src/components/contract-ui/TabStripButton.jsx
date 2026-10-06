import React from 'react';
import { resolveTabIcon } from './tabIcons.js';

/**
 * One button of DetailView's secondary tab strips.
 *
 * `disabledHint` (ETP-5309): when non-null the tab renders disabled, ignores clicks and
 * shows the hint as its tooltip — e.g. a custom tab that needs a persisted record while
 * the record is still new (see getCustomTabSaveFirstHint). `aria-disabled` rather than
 * the native attribute so the tooltip still shows on hover.
 */
export default function TabStripButton({
  iconKey, label, count, isActive, onClick,
  paddingY = 'py-2.5', showHoverLine = false, indicatorCls, tMenu, testId, disabledHint = null,
}) {
  const defaultCls = 'absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full';
  const disabled = disabledHint != null;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      title={disabled ? disabledHint : undefined}
      data-testid={testId}
      className={[
        `${showHoverLine ? 'group ' : ''}flex items-center gap-2 px-4 ${paddingY} text-sm font-medium transition-colors relative`,
        isActive ? 'text-foreground' : 'text-muted-foreground',
        !isActive && !disabled && 'hover:text-foreground',
        disabled && 'opacity-50 cursor-not-allowed',
      ].filter(Boolean).join(' ')}
    >
      {React.createElement(resolveTabIcon(iconKey), { className: 'h-4 w-4' })}
      {tMenu(label)}
      {count != null && (
        <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 text-xs rounded-full bg-muted text-muted-foreground">
          {count}
        </span>
      )}
      {showHoverLine ? (
        <span className={[
          'absolute bottom-0 left-2 right-2 h-0.5 rounded-full transition-colors',
          isActive ? 'bg-foreground' : 'bg-transparent',
          !isActive && !disabled && 'group-hover:bg-muted-foreground/30',
        ].filter(Boolean).join(' ')} />
      ) : (
        isActive && <span className={indicatorCls || defaultCls} />
      )}
    </button>
  );
}
