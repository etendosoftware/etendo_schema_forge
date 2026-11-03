import { Button } from '@/components/ui/button';
import { useUI, useLocaleSwitch } from '@/i18n';

/**
 * ETP-6080 — the interactive report view (behind `dynamic-reports`). Shell only: the query
 * hook (F7) and the tree, filters and drill-down (F8, F9) are built on it.
 */
export default function DynamicReportView({ report, onBack }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const title = report.title?.[locale] || report.title?.en_US || report.title?.es_ES || report.id;
  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="DynamicReportView">
      <div className="flex items-center gap-3 px-2 py-2 bg-card border-b border-border/30 shrink-0">
        <Button variant="outline" className="h-9 px-3 rounded-lg" data-testid="action-cancel" onClick={onBack}>
          {ui('cancel')}
        </Button>
        <span className="text-sm font-medium text-foreground truncate" data-testid="DynamicReportView__title">{title}</span>
      </div>
    </div>
  );
}
