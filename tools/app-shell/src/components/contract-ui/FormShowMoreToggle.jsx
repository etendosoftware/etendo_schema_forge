import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * "Show more details" / "Show less details" toggle of a header form limited to its
 * first rows (ETP-5513). Rendered as a full-width grid item, so it always starts its
 * own row under the last visible field whatever the column count.
 */
export function FormShowMoreToggle({ expanded, onToggle, locked = false }) {
  const ui = useUI();
  return (
    <div className="col-span-full flex">
      <button
        type="button"
        onClick={locked ? undefined : onToggle}
        aria-expanded={expanded}
        aria-disabled={locked || undefined}
        data-testid="form-show-more-toggle"
        className={`inline-flex items-center gap-1 rounded-md${locked ? ' cursor-not-allowed opacity-60' : ''} text-sm font-medium text-[hsl(var(--foreground))] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
      >
        {ui(expanded ? 'showLessFormData' : 'showMoreFormData')}
        <ChevronDown
          className={`h-4 w-4 transition-transform${expanded ? ' rotate-180' : ''}`}
          aria-hidden="true"
          data-testid="ChevronDown__form-show-more" />
      </button>
    </div>
  );
}

export default FormShowMoreToggle;
