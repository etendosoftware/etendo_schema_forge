import React, { useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu.jsx';
import { useUI } from '@/i18n';
import TabStripButton, { tabStripButtonBaseCls, TAB_COUNT_CHIP_CLS } from './TabStripButton.jsx';
import { resolveTabIcon } from './tabIcons.js';
import { resolveTabStripLayout } from './detailTabStripLayout.js';
import useFittingTabCount from './useFittingTabCount.js';

const MORE_TRIGGER_CLS = 'flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 text-muted-foreground hover:text-foreground transition-colors';
const COUNT_CHIP_CLS = TAB_COUNT_CHIP_CLS;
// Text drawn by CSS generated content: takes the text's width but is not a DOM text node,
// so the width probe never shows up in getByText / textContent.
const GHOST_TEXT_CLS = 'after:content-[attr(data-text)]';

function GhostText({ text }) {
  return <span data-text={text} className={GHOST_TEXT_CLS} />;
}

/** Width-only twin of a tab button: same box classes, icon and chip, text as generated content. */
function ProbeTab({ iconKey, label, count, buttonProps }) {
  return (
    <span className={tabStripButtonBaseCls(buttonProps.paddingY, buttonProps.showHoverLine)}>
      {React.createElement(resolveTabIcon(iconKey), { className: 'h-4 w-4' })}
      <GhostText text={label} data-testid="GhostText__detailTabStripProbeLabel" />
      {count != null && (
        <span className={COUNT_CHIP_CLS}><GhostText text={String(count)} data-testid="GhostText__detailTabStripProbeCount" /></span>
      )}
    </span>
  );
}

/**
 * Secondary tab strip of the Form View (ETP-5515): up to 4 tabs plus a "More" menu holding
 * the rest, with the last visible tab acting as a dynamic slot (see detailTabStripLayout.js).
 * Record counters travel with their tab in and out of the menu.
 *
 * `onSelect(index)` receives the tab's index in the ORIGINAL `tabs` array. Every other prop
 * is forwarded to TabStripButton for the visible tabs.
 */
export default function DetailTabStrip({
  tabs, activeIndex, onSelect, tMenu, getIndicatorCls, buttonProps = {},
}) {
  const ui = useUI();
  const activeKey = tabs[activeIndex]?.key;
  const wrapperRef = useRef(null);
  const measureRef = useRef(null);
  const maxVisible = useFittingTabCount({ wrapperRef, measureRef, tabs, activeKey });
  const { visible, hidden } = resolveTabStripLayout(tabs, activeKey, maxVisible);

  return (
    // min-w-0 + overflow-hidden: the strip takes the room its container gives it and can
    // never paint over a neighbour (e.g. the side panel) even when nothing more can be hidden.
    <div ref={wrapperRef} className="relative flex flex-1 min-w-0 items-center gap-0 overflow-hidden" data-testid="detail-tab-strip">
      {/* Invisible natural-width probe for useFittingTabCount: every tab + the More trigger. */}
      <div ref={measureRef} aria-hidden="true" className="invisible pointer-events-none absolute left-0 top-0 flex w-max items-center gap-0">
        {tabs.map((tab) => (
          <ProbeTab
            key={tab.key}
            iconKey={tab.key}
            label={tMenu(tab.label)}
            count={tab.count}
            buttonProps={buttonProps}
            data-testid="ProbeTab__detailTabStripProbe" />
        ))}
        <span className={MORE_TRIGGER_CLS}>
          <GhostText text={ui('more')} data-testid="GhostText__detailTabStripProbeMore" />
          <span className={COUNT_CHIP_CLS}><GhostText text={String(tabs.length)} data-testid="GhostText__detailTabStripProbeMoreCount" /></span>
          <ChevronDown className="h-4 w-4" data-testid="ChevronDown__detailTabStripProbe" />
        </span>
      </div>
      {visible.map(({ tab, index }) => (
        <TabStripButton
          key={tab.key}
          iconKey={tab.key}
          label={tab.label}
          count={tab.count}
          isActive={activeIndex === index}
          onClick={() => onSelect(index)}
          indicatorCls={getIndicatorCls?.()}
          tMenu={tMenu}
          testId={`tab-${tab.key}`}
          disabledHint={tab.saveFirstHint}
          {...buttonProps}
          data-testid="TabStripButton__detailTabStrip" />
      ))}
      {hidden.length > 0 && (
        <DropdownMenu modal={false} data-testid="DropdownMenu__detailTabStrip">
          <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__detailTabStrip">
            <button
              type="button"
              className={MORE_TRIGGER_CLS}
              data-testid="detail-tab-more"
            >
              {ui('more')}
              <span className={COUNT_CHIP_CLS}>{hidden.length}</span>
              <ChevronDown className="h-4 w-4" data-testid="ChevronDown__detailTabStrip" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]" data-testid="detail-tab-more-menu">
            {hidden.map(({ tab, index }) => {
              const disabled = tab.saveFirstHint != null;
              return (
                <DropdownMenuItem
                  key={tab.key}
                  disabled={disabled}
                  title={disabled ? tab.saveFirstHint : undefined}
                  onSelect={() => onSelect(index)}
                  data-testid={`detail-tab-more-item-${tab.key}`}
                >
                  {React.createElement(resolveTabIcon(tab.key), { className: 'h-4 w-4' })}
                  <span className="flex-1 whitespace-nowrap">{tMenu(tab.label)}</span>
                  {tab.count != null && <span className={COUNT_CHIP_CLS}>{tab.count}</span>}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
