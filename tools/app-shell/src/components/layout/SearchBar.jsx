import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * The app's search bar, presentational only (ETP-6209): the rounded pill of the top bar's global
 * search — search icon, an optional `leading` slot before the input (the top bar's scope chip),
 * and the input. It owns no state and no search: the top bar keeps `useGlobalSearch`, the scopes,
 * the vector search and its popup; the customer portal wires its own documents search to it.
 * No microphone.
 *
 * The pill has no width of its own: the caller sets it through `className` (the top bar's
 * 392px, the portal's full width). With `onClick` the pill acts as a button (`role="button"`,
 * focusable), as the top bar's does; without it, it is a plain box around the input.
 *
 * @param {object}   props
 * @param {string}   props.value          the input's value
 * @param {Function} props.onChange       the input's change handler (receives the event)
 * @param {string}   [props.placeholder]
 * @param {string}   [props.ariaLabel]    the input's accessible name; defaults to `placeholder`
 * @param {object}   [props.inputRef]
 * @param {object}   [props.inputProps]   extra input props (focus, click, key handlers, `cmdk-input`)
 * @param {Function} [props.onClick]      makes the pill a button
 * @param {Function} [props.onKeyDown]    the pill's own key handler (with `onClick`)
 * @param {*}        [props.leading]      rendered between the icon and the input
 * @param {string}   [props.className]
 * @param {string}   [props.testId]       the pill's test id
 * @param {string}   [props.inputTestId]  the input's test id
 */
export function SearchBar({
  value, onChange, placeholder, ariaLabel, inputRef, inputProps, onClick, onKeyDown, leading,
  className, testId, inputTestId,
}) {
  const asButton = typeof onClick === 'function';
  return (
    <div
      className={cn(
        'relative flex h-11 items-center rounded-full border border-transparent bg-search-bg px-4 text-sm transition-colors hover:bg-search-bg/80 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20',
        className,
      )}
      onClick={onClick}
      onKeyDown={asButton ? onKeyDown : undefined}
      role={asButton ? 'button' : undefined}
      tabIndex={asButton ? 0 : undefined}
      data-testid={testId}
    >
      <MagnifyingGlassIcon className="mr-2 h-5 w-5 shrink-0 text-search-placeholder" data-testid="Search__133e64" />
      {leading}
      <input
        ref={inputRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        {...inputProps}
        className="min-w-0 flex-1 bg-transparent text-left text-sm text-foreground outline-none placeholder:text-search-placeholder"
        data-testid={inputTestId}
      />
    </div>
  );
}
