import * as React from 'react';
import { FileText, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { useUI } from '@/i18n';

/**
 * AttachmentChips — compact row of chips representing the records / list views
 * currently attached to the Copilot conversation. Each chip is individually
 * removable.
 *
 * Props:
 *   attachments {Array}    [{ id, kind, tabTitle, recordIdentifier }]
 *   onRemove    {Function} called with the attachment id
 */
export function AttachmentChips({ attachments = [], onRemove }) {
  const ui = useUI();

  if (!attachments.length) return null;

  return (
    <div className="flex max-h-24 shrink-0 flex-wrap gap-2 overflow-y-auto p-3">
      {attachments.map((attachment) => {
        const label = attachment.recordIdentifier || ui('copilotListView');
        return (
          <Badge
            key={attachment.id}
            variant="outline"
            className="gap-2"
            title={`${attachment.tabTitle} — ${label}`}
            data-testid="Badge__5836c2">
            <FileText
              className="h-3 w-3 shrink-0 text-muted-foreground"
              data-testid="FileText__5836c2" />
            <span className="max-w-[220px] truncate">
              {attachment.tabTitle} — {label}
            </span>
            <button
              type="button"
              onClick={() => onRemove?.(attachment.id)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={ui('copilotRemoveAttachment')}
            >
              <X className="h-3 w-3" data-testid="X__5836c2" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}
