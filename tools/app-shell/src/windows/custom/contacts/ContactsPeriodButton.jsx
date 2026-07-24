import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Calendar } from 'lucide-react';
import { useUI } from '@/i18n';
import { useContactsFinance } from './ContactsFinanceContext';

/* eslint-disable react/prop-types */

const PERIOD_OPTIONS = [
  { value: '3M', labelKey: 'bpLast3Months' },
  { value: '6M', labelKey: 'bpLast6Months' },
];

/**
 * Period selector rendered in the DetailView `tabsBarRight` slot, next to the
 * General / Financial tabs. Reads and writes the shared period from
 * ContactsFinanceContext so the summary widget and chart react in sync.
 */
export default function ContactsPeriodButton() {
  const ui = useUI();
  const { period, setPeriod } = useContactsFinance();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const label = period === '3M' ? ui('bpLast3Months') : ui('bpLast6Months');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="h-10 flex items-center gap-1 px-3 bg-card border border-border-control rounded-lg shadow-[0px_1px_2px_rgba(18,18,23,0.05)] text-sm font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Calendar
          className="h-5 w-5 text-icon-secondary shrink-0"
          data-testid="Calendar__28b84a" />
        <span className="flex-1 text-left mx-1">{label}</span>
        <ChevronDown
          className="h-5 w-5 text-icon-secondary shrink-0"
          data-testid="ChevronDown__28b84a" />
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-50 min-w-full bg-card border border-border-control rounded-lg shadow-md overflow-hidden">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setPeriod(opt.value); setOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-sm whitespace-nowrap hover:bg-muted text-text-primary ${period === opt.value ? 'font-medium' : 'font-normal'}`}
            >
              {ui(opt.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
