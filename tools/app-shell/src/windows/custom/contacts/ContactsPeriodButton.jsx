import { useState, useEffect, useRef, useId } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, Calendar, Check } from 'lucide-react';
import { useUI } from '@/i18n';
import { useContactsFinance } from './ContactsFinanceContext';

/* eslint-disable react/prop-types */

const PERIOD_OPTIONS = [
  { value: '3M', labelKey: 'bpLast3Months' },
  { value: '6M', labelKey: 'bpLast6Months' },
];

// Shared by the focus-visible state and the open state: Figma shows the trigger with the
// focused (dark double ring) look while its menu is open.
const TRIGGER_FOCUS_RING = 'ring-2 ring-focus-ring ring-offset-1 ring-offset-card';

const TRIGGER_CLS = [
  'h-8 flex items-center gap-1 px-2.5 bg-card border border-border-control rounded-lg',
  'shadow-[0px_1px_2px_rgba(18,18,23,0.05)] text-sm font-medium text-text-primary whitespace-nowrap',
  'transition-colors hover:bg-muted focus-visible:outline-none',
  // Literal (not derived from TRIGGER_FOCUS_RING) so Tailwind's content scan sees every class.
  'focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
].join(' ');

const OPTION_CLS = [
  'w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm whitespace-nowrap text-text-primary',
  'hover:bg-muted focus-visible:outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
].join(' ');

/**
 * Period selector ("Últimos 3 meses" / "Últimos 6 meses") rendered inside the contacts
 * summary block (`ContactsSummaryWidget`), to the left of the "Ver gráfico" button. Reads and
 * writes the shared period from ContactsFinanceContext, so the summary trend badges and the
 * chart dialog follow the same period.
 *
 * Keyboard: Enter/Space or ArrowDown/ArrowUp on the trigger opens the menu with the current
 * option focused; ArrowUp/ArrowDown/Home/End move between options; Enter/Space choose;
 * Escape closes and returns focus to the trigger; Tab closes and moves on.
 */
export default function ContactsPeriodButton() {
  const ui = useUI();
  const { period, setPeriod } = useContactsFinance();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const listId = useId();
  const triggerId = useId();

  const selectedIdx = Math.max(0, PERIOD_OPTIONS.findIndex((o) => o.value === period));

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Keep DOM focus on the keyboard-active option while the menu is open.
  useEffect(() => {
    if (open) optionRefs.current[activeIdx]?.focus();
  }, [open, activeIdx]);

  const openMenu = () => { setActiveIdx(selectedIdx); setOpen(true); };
  const closeMenu = () => { setOpen(false); triggerRef.current?.focus(); };
  const choose = (value) => { setPeriod(value); closeMenu(); };

  const onTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu();
    }
  };

  const onListKeyDown = (e) => {
    const last = PERIOD_OPTIONS.length - 1;
    const moves = {
      ArrowDown: (i) => (i >= last ? 0 : i + 1),
      ArrowUp: (i) => (i <= 0 ? last : i - 1),
      Home: () => 0,
      End: () => last,
    };
    if (moves[e.key]) {
      e.preventDefault();
      setActiveIdx(moves[e.key]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    } else if (e.key === 'Tab') {
      // No preventDefault: move focus back to the trigger and unmount the options
      // synchronously (flushSync), so the browser's own Tab / Shift+Tab continues from the
      // trigger in natural order instead of from an unmounted option (focus would fall to body).
      triggerRef.current?.focus();
      flushSync(() => setOpen(false));
    }
  };

  const label = ui(PERIOD_OPTIONS[selectedIdx].labelKey);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={`${TRIGGER_CLS}${open ? ` ${TRIGGER_FOCUS_RING}` : ''}`}
      >
        <Calendar
          className="h-4 w-4 text-icon-secondary shrink-0"
          data-testid="Calendar__28b84a" />
        <span className="flex-1 text-left mx-1">{label}</span>
        <ChevronDown
          className="h-4 w-4 text-icon-secondary shrink-0"
          data-testid="ChevronDown__28b84a" />
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-labelledby={triggerId}
          onKeyDown={onListKeyDown}
          className="absolute top-10 right-0 z-50 min-w-full py-1 bg-popover border border-border-control rounded-lg shadow-md overflow-hidden"
        >
          {PERIOD_OPTIONS.map((opt, idx) => {
            const isSelected = period === opt.value;
            return (
              <button
                key={opt.value}
                ref={(el) => { optionRefs.current[idx] = el; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={idx === activeIdx ? 0 : -1}
                onClick={() => choose(opt.value)}
                className={`${OPTION_CLS} ${isSelected ? 'bg-muted font-medium' : 'font-normal'}`}
              >
                <span>{ui(opt.labelKey)}</span>
                {isSelected && (
                  <Check
                    className="h-4 w-4 text-text-primary shrink-0"
                    data-testid="Check__28b84a" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
