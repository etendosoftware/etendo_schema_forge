import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useLocaleSwitch } from '@/i18n/LocaleProvider';
import { MessageSquare, Send, ChevronDown } from 'lucide-react';

/**
 * Format a timestamp into a human-readable relative string.
 * Handles Date objects, ISO strings, and Unix timestamps (ms).
 * The locale is used only for the absolute-date fallback (>= 7 days old).
 */
function formatRelativeTime(timestamp, locale = 'es_ES') {
  if (!timestamp) return '';
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(locale.replace('_', '-'), { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * Extract the first letter of an author name for the avatar.
 */
function getInitial(author) {
  return (author || '?').charAt(0).toUpperCase();
}

/**
 * A single message row in the chatter.
 */
function MessageItem({ message }) {
  const { locale } = useLocaleSwitch();
  const isSystem = message.type === 'system';

  if (isSystem) {
    return (
      <div className="flex items-start gap-2 py-2 px-1">
        <div className="w-7 h-7 shrink-0" />
        <p className="text-xs italic text-muted-foreground leading-relaxed">
          {message.text}
          {message.timestamp && (
            <span className="ml-2 text-[10px] text-muted-foreground/60">
              {formatRelativeTime(message.timestamp, locale)}
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-2 px-1">
      <div
        className="w-7 h-7 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold"
        aria-hidden="true"
      >
        {getInitial(message.author)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium truncate">{message.author || 'Unknown'}</span>
          {message.timestamp && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatRelativeTime(message.timestamp, locale)}
            </span>
          )}
        </div>
        <p className="text-sm text-foreground/80 mt-0.5 break-words">{message.text}</p>
      </div>
    </div>
  );
}

/**
 * Chatter - A collapsible notes and activity panel for entity detail views.
 *
 * Displays messages (notes and system events) with author avatars,
 * relative timestamps, and an input to add new notes.
 * In mock mode (no onAddNote callback), notes are stored in local state.
 */
export function Chatter({
  entityType,
  entityId,
  messages = [],
  onAddNote,
  collapsed = true,
}) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [inputValue, setInputValue] = useState('');
  const [localMessages, setLocalMessages] = useState([]);
  const listRef = useRef(null);

  // Combine external messages with locally added ones
  const allMessages = [...messages, ...localMessages];

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    if (listRef.current && !isCollapsed) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [allMessages.length, isCollapsed]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text) return;

    if (onAddNote) {
      onAddNote(text);
    } else {
      // Mock mode: store locally
      setLocalMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          author: 'You',
          text,
          timestamp: new Date(),
          type: 'note',
        },
      ]);
    }
    setInputValue('');
  }

  return (
    <Card className="mt-4" data-testid="Card__a26193">
      <CardHeader
        className="cursor-pointer select-none p-4"
        onClick={() => setIsCollapsed((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        aria-label="Toggle notes and activity panel"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsCollapsed((v) => !v);
          }
        }}
        data-testid="CardHeader__a26193">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare
              className="h-4 w-4 text-muted-foreground"
              data-testid="MessageSquare__a26193" />
            <span className="text-sm font-medium">Notes &amp; Activity</span>
            {allMessages.length > 0 && (
              <Badge
                variant="secondary"
                className="text-[11px] px-1.5 py-0"
                data-testid="Badge__a26193">
                {allMessages.length}
              </Badge>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              !isCollapsed && 'rotate-180'
            )}
            data-testid="ChevronDown__a26193" />
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="p-4 pt-0" data-testid="CardContent__a26193">
          <Separator className="mb-3" data-testid="Separator__a26193" />

          {/* Message list */}
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto space-y-1"
            role="log"
            aria-label={`Notes for ${entityType || 'entity'} ${entityId || ''}`}
          >
            {allMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No notes yet. Add the first one below.
              </p>
            ) : (
              allMessages.map((msg) => (
                <MessageItem key={msg.id} message={msg} data-testid="MessageItem__a26193" />
              ))
            )}
          </div>

          {/* Input area */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-3">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 text-sm"
              aria-label="Note text"
              data-testid="Input__a26193" />
            <Button
              type="submit"
              size="sm"
              disabled={!inputValue.trim()}
              aria-label="Send note"
              data-testid="Button__a26193">
              <Send className="h-4 w-4" data-testid="Send__a26193" />
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
