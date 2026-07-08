import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUI } from '@/i18n';

/**
 * Generic clipboard copy button. Copies `value` to the clipboard, shows a
 * transient "copied" state (icon swap + tooltip) and a toast.
 *
 * Consolidates the `navigator.clipboard.writeText` + toast + `copied` state
 * pattern that was previously duplicated across several pages.
 *
 * @param {{
 *   value: string,
 *   label?: string,
 *   className?: string,
 *   iconClassName?: string,
 *   'data-testid'?: string,
 * }} props
 */
export function CopyButton({
  value,
  label,
  className,
  iconClassName,
  'data-testid': dataTestId,
}) {
  const ui = useUI();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(String(value ?? ''));
      setCopied(true);
      toast.success(ui('copied'));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(ui('copyFailed'));
    }
  }, [value, ui]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={ui('copy')}
      aria-label={ui('copy')}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs font-medium',
        'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        className,
      )}
      data-testid={dataTestId || 'CopyButton'}
    >
      {copied ? (
        <Check className={cn('h-3.5 w-3.5 text-green-600 dark:text-green-400', iconClassName)} data-testid="CopyButton__check" />
      ) : (
        <Copy className={cn('h-3.5 w-3.5', iconClassName)} data-testid="CopyButton__copy" />
      )}
      {label ? <span>{copied ? ui('copied') : label}</span> : null}
    </button>
  );
}

/**
 * A copyable code/snippet block: monospace content in a bordered surface with a
 * CopyButton in the top-right corner. By default long content scrolls
 * horizontally inside its own container (never pushes the page width) — ideal
 * for URLs and config snippets.
 *
 * Pass `wrap` for prose-like values (e.g. an agent prompt): the text wraps onto
 * multiple lines and the block grows up to `maxLines` (default 4) before
 * scrolling vertically.
 *
 * @param {{
 *   value: string,
 *   language?: string,
 *   className?: string,
 *   wrap?: boolean,
 *   maxLines?: number,
 *   'data-testid'?: string,
 * }} props
 */
export function CopyBlock({ value, className, wrap = false, maxLines = 4, 'data-testid': dataTestId }) {
  // leading-relaxed = 1.625; cap the wrapped block at `maxLines` before scrolling.
  const wrapStyle = wrap ? { maxHeight: `${(maxLines * 1.625).toFixed(3)}em` } : undefined;
  return (
    <div
      className={cn('relative rounded-lg border bg-muted/40', className)}
      data-testid={dataTestId || 'CopyBlock'}
    >
      <div className="absolute right-1.5 top-1.5 z-10">
        <CopyButton
          value={value}
          className="bg-background/70 backdrop-blur-sm"
          data-testid={dataTestId ? `${dataTestId}__copy` : 'CopyBlock__copy'}
        />
      </div>
      <pre
        className={cn(
          'p-3 pr-12 text-xs leading-relaxed',
          wrap ? 'overflow-y-auto' : 'overflow-x-auto',
        )}
        style={wrapStyle}
      >
        <code className={cn('font-mono', wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre')}>{value}</code>
      </pre>
    </div>
  );
}
