import { Sparkles } from 'lucide-react';
import { useUI } from '@/i18n';

/** Card ring + glow for a report that opens the interactive view (ETP-6080). */
export const DYNAMIC_REPORT_CARD_CLASS = 'border-primary/40 ring-1 ring-primary/20 shadow-md shadow-primary/20';

/** "Interactivo" tag on the catalog card and list row of a report with an interactive view. */
export default function DynamicReportBadge() {
  const ui = useUI();
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
      title={ui('dynamicReportBadgeHint')}
      data-testid="DynamicReportBadge"
    >
      <Sparkles className="w-3 h-3" aria-hidden="true" />
      {ui('dynamicReportBadge')}
    </span>
  );
}
