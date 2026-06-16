import * as React from 'react';
import { Paperclip, Send, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils.js';
import { useUI } from '@/i18n';
import { SatisfactionRating } from './SatisfactionRating.jsx';

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function MessageBubble({ message }) {
  const isUser = message.sender === 'user';
  return (
    <div className={cn('flex gap-2 items-end', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mb-1">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={cn('flex flex-col gap-0.5 max-w-[75%]', isUser ? 'items-end' : 'items-start')}>
        {!isUser && (
          <span className="text-[11px] text-muted-foreground px-1">{message.senderName}</span>
        )}
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted text-foreground rounded-bl-sm'
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
          {message.attachments?.length > 0 && (
            <div className="mt-1 flex flex-col gap-1">
              {message.attachments.map((att, i) => (
                <a
                  key={i}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline opacity-80"
                >
                  {att.filename}
                </a>
              ))}
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground px-1">{formatTime(message.timestamp)}</span>
      </div>
      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted mb-1">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function PendingFileChip({ file, onRemove }) {
  const isImage = file.type.startsWith('image/');
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs">
      {isImage ? (
        <img
          src={URL.createObjectURL(file)}
          alt={file.name}
          className="h-5 w-5 rounded object-cover"
        />
      ) : (
        <Paperclip className="h-3 w-3 text-muted-foreground" />
      )}
      <span className="max-w-[100px] truncate">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Remove file"
      >
        ×
      </button>
    </div>
  );
}

export function ChatView({
  messages,
  input,
  onInputChange,
  onSend,
  isSending,
  isLoadingMessages,
  isClosed,
  isRated,
  pendingFiles,
  onAddFile,
  onRemoveFile,
  onSubmitRating,
}) {
  const ui = useUI();
  const bottomRef = React.useRef(null);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isClosed && !isSending && (input.trim() || pendingFiles.length > 0)) {
        onSend();
      }
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((f) => onAddFile(f));
    e.target.value = '';
  };

  if (isLoadingMessages) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {ui('supportLoading')}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 && !isLoadingMessages && (
          <div className="flex flex-col items-center gap-3 pt-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">{ui('supportAiGreeting')}</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isSending && (
          <div className="flex gap-2 items-end">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mb-1">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
              <span className="flex gap-1 text-muted-foreground">
                <span className="animate-bounce [animation-delay:0ms]">·</span>
                <span className="animate-bounce [animation-delay:150ms]">·</span>
                <span className="animate-bounce [animation-delay:300ms]">·</span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Closed: rating prompt */}
      {isClosed && (
        <div className="shrink-0">
          <div className="px-4 py-2 text-center text-xs text-muted-foreground border-t border-border/50">
            {ui('supportClosedConversation')}
          </div>
          <SatisfactionRating onSubmit={onSubmitRating} submitted={isRated} />
        </div>
      )}

      {/* Input area */}
      {!isClosed && (
        <div className="shrink-0 border-t border-border/50 px-3 py-2">
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {pendingFiles.map((f, i) => (
                <PendingFileChip
                  key={i}
                  file={f}
                  onRemove={() => onRemoveFile(i)}
                />
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={ui('supportAttachFile')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,.pdf,.xlsx,.docx,.txt,.csv"
              onChange={handleFileChange}
            />
            <textarea
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={ui('supportTypeMessage')}
              className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-[120px] overflow-y-auto"
              style={{ height: 'auto' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={isSending || (!input.trim() && pendingFiles.length === 0)}
              onClick={onSend}
              aria-label={ui('send')}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
