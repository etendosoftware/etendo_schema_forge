import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseLocaleNumber } from '@/lib/parseLocaleNumber.js';
import { formatPlainDecimal } from '@/lib/formatCurrency.js';
import { normalizeNumber, sameNumber } from './invoiceInboxReviewModel.js';
import { useReviewEditor } from './useInvoiceInboxReviewEditor.js';

/** Typing pauses this long before the value is saved (blur and Enter save at once). */
export const AUTOSAVE_DEBOUNCE_MS = 700;

const INVALID_CLASS = 'border-destructive bg-[var(--status-destructive-bg)] text-destructive';

/**
 * ETP-6050 S2 (plan 9.6 F3/F5) — an input that autosaves. ONE commit path (`settle`) serves the
 * 700 ms debounce, blur, Enter and the panel's `flush()`, and it clears the pending timer, so a
 * timer and a blur can never both fire.
 *
 * While the user edits, the input shows what they are typing (`draft`, the plain number for a
 * numeric cell); otherwise it shows `display(value)`, the formatted effective value (server answer
 * plus pending edits). `parse(text)` answers `{ok, value}`: a value that cannot be committed
 * (letters, out of range) marks the input invalid, is never sent, and reverts on blur. `same`
 * stops a blur without change from writing anything. Outside the panel's editor (no context) or
 * `readOnly`, it is a plain read-only input.
 *
 * @param {{value: *, display: (value: *) => string, plain?: (value: *) => string,
 *   parse?: (text: string) => {ok: boolean, value?: *}, same?: (a: *, b: *) => boolean,
 *   onCommit: (value: *) => void, readOnly?: boolean, disabled?: boolean, invalid?: boolean,
 *   title?: string, ariaLabel?: string, className?: string, inputRef?: object,
 *   testId: string, id?: string}} props
 */
export function CommitInput({
  value, display, plain = display, parse = (text) => ({ ok: true, value: text }),
  same = (a, b) => a === b, onCommit, readOnly = false, disabled = false, invalid = false,
  title, ariaLabel, className = '', inputRef = null, testId, id,
  'data-testid': _codemodTestId, // the id the data-testid codemod adds to a component usage: `testId` is the input's
  ...rest
}) {
  const editor = useReviewEditor();
  const editable = Boolean(editor) && !readOnly && !disabled;
  const [draft, setDraft] = useState(null);
  const [rejected, setRejected] = useState(false);
  const draftRef = useRef(null);
  const timerRef = useRef(null);
  const latest = useRef({});
  latest.current = { value, parse, same, onCommit };

  const settle = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const text = draftRef.current;
    if (text == null) return;
    const parsed = latest.current.parse(text);
    if (!parsed.ok) {
      setRejected(true);
      return;
    }
    setRejected(false);
    if (!latest.current.same(parsed.value, latest.current.value)) latest.current.onCommit(parsed.value);
  }, []);

  const registerFlush = editor?.registerFlush;
  useEffect(() => (editable && registerFlush ? registerFlush(settle) : undefined), [editable, registerFlush, settle]);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!editable) {
    return (
      <Input
        id={id}
        readOnly
        disabled={disabled}
        value={display(value)}
        title={title ?? display(value)}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={`${className} ${invalid ? INVALID_CLASS : ''}`}
        data-testid={testId}
        {...rest} />
    );
  }

  const shown = draft ?? display(value);
  const bad = invalid || rejected;
  return (
    <Input
      id={id}
      ref={inputRef}
      value={shown}
      title={title ?? shown}
      aria-label={ariaLabel}
      aria-invalid={bad || undefined}
      className={`${className} ${bad ? INVALID_CLASS : ''}`}
      onFocus={() => {
        const text = plain(value);
        draftRef.current = text;
        setDraft(text);
      }}
      onChange={(event) => {
        const text = event.target.value;
        draftRef.current = text;
        setDraft(text);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(settle, AUTOSAVE_DEBOUNCE_MS);
      }}
      onBlur={() => {
        settle();
        draftRef.current = null;
        setDraft(null);
        setRejected(false);
      }}
      onKeyDown={(event) => { if (event.key === 'Enter') settle(); }}
      data-testid={testId}
      {...rest} />
  );
}

/** A numeric line cell: parsed with `parseLocaleNumber`, bounded and rounded per field, `0 = absent` for the discount. */
export function NumberCommitInput({
  field, value, display, onCommit, ...rest
}) {
  return (
    <CommitInput
      value={value}
      display={display}
      plain={(v) => formatPlainDecimal(v ?? '')}
      parse={(text) => normalizeNumber(field, parseLocaleNumber(text))}
      same={(a, b) => sameNumber(a, b, { absentIsZero: field === 'discount' })}
      onCommit={onCommit}
      {...rest}
      data-testid="CommitInput__number" />
  );
}
