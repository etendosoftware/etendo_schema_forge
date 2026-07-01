import * as React from 'react';
import { Check, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input.jsx';
import { cn } from '@/lib/utils';
import { useUI } from '@/i18n';

/**
 * ConversationItem — single conversation row with hover actions and inline rename.
 *
 * Props:
 *   conversation    {{ conversation_id: string, title: string }}
 *   isActive        {boolean}
 *   isArchived      {boolean}
 *   onSelect        {Function}
 *   onDelete        {Function}  archive (soft-delete) when not archived
 *   onRestore       {Function}  restore when archived
 *   onPermanentDelete {Function} hard-delete when archived
 *   onRename        {Function}  called with (newTitle: string)
 */
export function ConversationItem({
  conversation,
  isActive = false,
  isArchived = false,
  onSelect,
  onDelete,
  onRestore,
  onPermanentDelete,
  onRename,
}) {
  const ui = useUI();
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const inputRef = React.useRef(null);

  const startRename = React.useCallback(
    (e) => {
      e.stopPropagation();
      setRenameValue(conversation.title || '');
      setIsRenaming(true);
    },
    [conversation.title],
  );

  React.useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const commitRename = React.useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename?.(trimmed);
    }
    setIsRenaming(false);
  }, [renameValue, conversation.title, onRename]);

  const cancelRename = React.useCallback(() => {
    setIsRenaming(false);
    setRenameValue('');
  }, []);

  const handleKeyDown = React.useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRename();
      } else if (e.key === 'Escape') {
        cancelRename();
      }
    },
    [commitRename, cancelRename],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !isRenaming && onSelect?.()}
      onKeyDown={(e) => {
        if (!isRenaming && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={cn(
        'group relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-muted/60 text-foreground',
      )}
    >
      {isRenaming ? (
        <div
          className="flex flex-1 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            className="h-6 flex-1 py-0 text-sm"
            data-testid="Input__238ff6" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              commitRename();
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label={ui('save')}
          >
            <Check className="h-3.5 w-3.5" data-testid="Check__238ff6" />
          </button>
        </div>
      ) : (
        <>
          <span className="flex-1 truncate">{conversation.title || ui('copilotUntitledConversation')}</span>

          {/* Action icons — visible on hover */}
          <div
            className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            {isArchived ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore?.();
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={ui('copilotRestoreConversation')}
                >
                  <RotateCcw className="h-3.5 w-3.5" data-testid="RotateCcw__238ff6" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPermanentDelete?.();
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  aria-label={ui('copilotPermanentDelete')}
                >
                  <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__238ff6" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startRename}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={ui('copilotRenameConversation')}
                >
                  <Pencil className="h-3.5 w-3.5" data-testid="Pencil__238ff6" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.();
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  aria-label={ui('copilotDeleteConversation')}
                >
                  <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__238ff6" />
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
