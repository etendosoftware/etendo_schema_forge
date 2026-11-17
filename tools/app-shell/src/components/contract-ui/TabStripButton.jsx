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
/** Box classes that decide a tab's width; shared with DetailTabStrip's width probe so they cannot drift. */
export const tabStripButtonBaseCls = (paddingY = 'py-2.5', showHoverLine = false) =>
  `${showHoverLine ? 'group ' : ''}flex items-center gap-2 px-4 ${paddingY} text-sm font-medium whitespace-nowrap shrink-0 transition-colors relative`;
export const TAB_COUNT_CHIP_CLS = 'inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 text-xs rounded-full bg-muted text-muted-foreground';

export default function TabStripButton({
  iconKey, icon = null, label, count, isActive, onClick,
  paddingY = 'py-2.5', showHoverLine = true, indicatorCls, tMenu, testId, disabledHint = null,
  hoverDarkText = false, activeAccent = 'default',
}) {
  // activeAccent 'primary' (opt-in): active text, icon and underline use the brand blue.
  const activeText = activeAccent === 'primary' ? 'text-primary' : 'text-foreground';
  const activeBg = activeAccent === 'primary' ? 'bg-primary' : 'bg-foreground';
  const defaultGeometry = 'absolute bottom-0 left-2 right-2 h-0.5 rounded-full';
  const effectiveIndicatorGeometry = indicatorCls
    ? indicatorCls.replace(/\bbg-\S+/g, '').trim()
    : defaultGeometry;
  const disabled = disabledHint != null;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      title={disabled ? disabledHint : undefined}
      data-testid={testId}
      className={[
        tabStripButtonBaseCls(paddingY, showHoverLine),
        isActive ? activeText : 'text-muted-foreground',
        !isActive && !disabled && hoverDarkText && 'hover:text-foreground',
        disabled && 'opacity-50 cursor-not-allowed',
      ].filter(Boolean).join(' ')}
    >
      {React.createElement(resolveTabIcon(iconKey, icon), { className: 'h-4 w-4' })}
      {tMenu(label)}
      {count != null && (
        <span className={TAB_COUNT_CHIP_CLS}>
          {count}
        </span>
      )}
      {showHoverLine ? (
        <span className={[
          effectiveIndicatorGeometry,
          'transition-colors',
          isActive ? activeBg : 'bg-transparent',
          !isActive && !disabled && 'group-hover:bg-muted-foreground/30',
        ].filter(Boolean).join(' ')} />
      ) : (
        isActive && <span className={indicatorCls ? indicatorCls.replace(/\bbg-foreground\b/, activeBg) : `${defaultGeometry} ${activeBg}`} />
      )}
    </button>
  );
}
