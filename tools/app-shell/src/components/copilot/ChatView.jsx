import * as React from 'react';
import { Bot, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Separator } from '@/components/ui/separator.jsx';
import { cn } from '@/lib/utils';
import { useUI } from '@/i18n';
import { AttachmentChips } from './AttachmentChips.jsx';

/**
 * ChatView — scrollable message area + file upload bar + input form.
 *
 * Props:
 *   messages          {Array}    [{ id, role, text, timestamp, files? }]
 *   input             {string}
 *   onInputChange     {Function} called with new input string
 *   onSubmit          {Function} called when form is submitted
 *   onFilePick        {Function} triggers the hidden file input
 *   onFileChange      {Function} called with the file input change event
 *   onRemoveFile      {Function} called with file index to remove
 *   files             {Array}    pending File objects
 *   isSending         {boolean}
 *   welcomeMessage    {string}
 *   inputPlaceholder  {string}
 */
export function ChatView({
  messages = [],
  input = '',
  onInputChange,
  onSubmit,
  onFilePick,
  onFileChange,
  onRemoveFile,
  files = [],
  attachments = [],
  onRemoveAttachment,
  isSending = false,
  welcomeMessage,
  inputPlaceholder,
}) {
  const ui = useUI();
  const inputRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const messagesEndRef = React.useRef(null);

  // Auto-scroll to the bottom when messages or sending state changes
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Auto-focus input when the component mounts or when isSending clears
  React.useEffect(() => {
    if (!isSending) {
      inputRef.current?.focus();
    }
  }, [isSending]);

  const handleSubmit = React.useCallback(
    (e) => {
      e.preventDefault();
      onSubmit?.();
    },
    [onSubmit],
  );

  const handleFilePick = React.useCallback(() => {
    fileInputRef.current?.click();
    onFilePick?.();
  }, [onFilePick]);

  return (
    <>
      {/* Message area */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {welcomeMessage || ui('copilotWelcome')}
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex gap-2 max-w-[88%]',
              message.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto',
            )}
          >
            {message.role !== 'user' && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <Bot className="h-4 w-4 text-muted-foreground" data-testid="Bot__61b427" />
              </div>
            )}
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-sm whitespace-pre-line',
                message.role === 'user' && 'bg-primary text-primary-foreground',
                message.role === 'copilot' && 'bg-muted text-foreground',
                message.role === 'error' &&
                  'bg-destructive/10 text-destructive',
              )}
            >
              <div>{message.text}</div>
              {Array.isArray(message.files) && message.files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {message.files.map((file, index) => (
                    <Badge
                      key={`${file.name}-${index}`}
                      variant="secondary"
                      className="max-w-full truncate"
                      data-testid="Badge__61b427">
                      {file.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isSending && (
          <div className="flex gap-2 mr-auto">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
              <Bot className="h-4 w-4 text-muted-foreground" data-testid="Bot__61b427" />
            </div>
            <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="animate-bounce [animation-delay:0ms]">.</span>
                <span className="animate-bounce [animation-delay:150ms]">.</span>
                <span className="animate-bounce [animation-delay:300ms]">.</span>
              </span>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
      {/* Attached record / list-view context chips */}
      {attachments.length > 0 && (
        <>
          <Separator data-testid="Separator__61b427" />
          <AttachmentChips
            attachments={attachments}
            onRemove={onRemoveAttachment}
            data-testid="AttachmentChips__61b427" />
        </>
      )}
      {/* Pending file preview bar */}
      {files.length > 0 && (
        <>
          <Separator data-testid="Separator__61b427" />
          <div className="flex flex-wrap gap-2 p-3">
            {files.map((file, index) => (
              <Badge
                key={`${file.name}-${index}`}
                variant="outline"
                className="gap-2"
                data-testid="Badge__61b427">
                <span className="max-w-[180px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFile?.(index)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`${ui('remove')} ${file.name}`}
                >
                  <X className="h-3 w-3" data-testid="X__61b427" />
                </button>
              </Badge>
            ))}
          </div>
        </>
      )}
      <Separator data-testid="Separator__61b427" />
      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3">
        {/* Hidden real file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onFileChange}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleFilePick}
          disabled={isSending}
          aria-label={ui('copilotAttachFile')}
          data-testid="Button__61b427">
          <Paperclip className="h-4 w-4" data-testid="Paperclip__61b427" />
        </Button>

        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange?.(e.target.value)}
          placeholder={inputPlaceholder || ui('askSomething')}
          className="flex-1 h-9"
          disabled={isSending}
          data-testid="Input__61b427" />

        <Button
          type="submit"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={!input.trim() || isSending}
          aria-label={ui('send')}
          data-testid="Button__61b427">
          <Send className="h-4 w-4" data-testid="Send__61b427" />
        </Button>
      </form>
    </>
  );
}
