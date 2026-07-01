import * as React from 'react';
import { Archive, LoaderCircle, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Separator } from '@/components/ui/separator.jsx';
import { cn } from '@/lib/utils';
import { useUI } from '@/i18n';
import { ConversationItem } from './ConversationItem.jsx';

/**
 * ConversationSidebar — conversation history panel with search and archive section.
 *
 * Props:
 *   conversations          {Array}         [{ conversation_id, title }]
 *   archivedConversations  {Array}         [{ conversation_id, title }]
 *   activeConversationId   {string|null}
 *   onSelect               {Function}      called with conversation object
 *   onNew                  {Function}
 *   onDelete               {Function}      called with conversation_id
 *   onRestore              {Function}      called with conversation_id
 *   onPermanentDelete      {Function}      called with conversation_id
 *   onRename               {Function}      called with (conversation_id, newTitle)
 *   isLoading              {boolean}
 *   isLoadingArchived      {boolean}
 */
export function ConversationSidebar({
  conversations = [],
  archivedConversations = [],
  activeConversationId = null,
  onSelect,
  onNew,
  onDelete,
  onRestore,
  onPermanentDelete,
  onRename,
  isLoading = false,
  isLoadingArchived = false,
}) {
  const ui = useUI();
  const [search, setSearch] = React.useState('');
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  const filteredActive = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) =>
      (c.title || '').toLowerCase().includes(term),
    );
  }, [conversations, search]);

  const filteredArchived = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return archivedConversations;
    return archivedConversations.filter((c) =>
      (c.title || '').toLowerCase().includes(term),
    );
  }, [archivedConversations, search]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-semibold text-foreground">
          {ui('copilotConversations')}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onNew}
          aria-label={ui('copilotNewConversation')}
          data-testid="Button__db7c3f">
          <Plus className="h-4 w-4" data-testid="Plus__db7c3f" />
        </Button>
      </div>
      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none"
            data-testid="Search__db7c3f" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={ui('copilotSearchConversations')}
            className="pl-8 h-8 text-sm"
            data-testid="Input__db7c3f" />
        </div>
      </div>
      <Separator data-testid="Separator__db7c3f" />
      {/* Active conversations list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" data-testid="LoaderCircle__db7c3f" />
          </div>
        )}
        {!isLoading && filteredActive.length > 0 && filteredActive.map((conv) => (
          <ConversationItem
            key={conv.conversation_id}
            conversation={conv}
            isActive={conv.conversation_id === activeConversationId}
            isArchived={false}
            onSelect={() => onSelect?.(conv)}
            onDelete={() => onDelete?.(conv.conversation_id)}
            onRename={(newTitle) => onRename?.(conv.conversation_id, newTitle)}
            data-testid="ConversationItem__db7c3f" />
        ))}
        {!isLoading && filteredActive.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {ui('copilotNoConversations')}
          </div>
        )}
      </div>
      {/* Archived section */}
      {(archivedConversations.length > 0 || isLoadingArchived) && (
        <>
          <Separator data-testid="Separator__db7c3f" />
          <div className="px-2 py-1">
            <button
              type="button"
              onClick={() => setArchiveOpen((prev) => !prev)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Archive className="h-3.5 w-3.5 shrink-0" data-testid="Archive__db7c3f" />
              <span className="flex-1 text-left">
                {ui('copilotArchived')}
                {filteredArchived.length > 0 && (
                  <span className="ml-1 text-xs">({filteredArchived.length})</span>
                )}
              </span>
              <span
                className={cn(
                  'text-xs transition-transform',
                  archiveOpen && 'rotate-180',
                )}
              >
                ▾
              </span>
            </button>

            {archiveOpen && (
              <div className="mt-1">
                {isLoadingArchived && (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" data-testid="LoaderCircle__db7c3f" />
                  </div>
                )}
                {!isLoadingArchived && filteredArchived.length > 0 && filteredArchived.map((conv) => (
                  <ConversationItem
                    key={conv.conversation_id}
                    conversation={conv}
                    isActive={conv.conversation_id === activeConversationId}
                    isArchived={true}
                    onSelect={() => onSelect?.(conv)}
                    onRestore={() => onRestore?.(conv.conversation_id)}
                    onPermanentDelete={() =>
                      onPermanentDelete?.(conv.conversation_id)
                    }
                    data-testid="ConversationItem__db7c3f" />
                ))}
                {!isLoadingArchived && filteredArchived.length === 0 && (
                  <div className="py-2 text-center text-xs text-muted-foreground">
                    {ui('copilotNoArchivedConversations')}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
