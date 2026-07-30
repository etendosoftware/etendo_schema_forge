import { X } from 'lucide-react';

/**
 * Figma chip used by FK pickers (Contacto, Tarifa, Dirección, etc.) when a
 * value is selected. Gray pill (`hsl(var(--muted))`) with the display label and an
 * inline X to clear. Click on the body switches the host picker back to
 * typing mode.
 *
 * Lives in its own file so SearchInput (`EntityForm.jsx`) and
 * CreatableSearchSelect can share the markup without Sonar flagging the
 * duplication.
 *
 * @param {string}   label         - Human-readable label to render.
 * @param {Function} onClick       - Called when the chip body is clicked
 *                                   (host should flip to typing mode).
 * @param {Function} onClear       - Called when the X is activated by
 *                                   click or Enter / Space keypress.
 * @param {string}   clearAriaLabel - aria-label for the X (typically `ui('clear')`).
 * @param {string}   testId        - data-testid for the chip button.
 */
export function SelectorChip({ label, onClick, onClear, clearAriaLabel, testId, clearable = true }) {
  const triggerClear = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClear();
  };
  const onClearKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      triggerClear(event);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex flex-1 self-stretch items-center gap-1 max-w-full min-w-0 text-sm text-[hsl(var(--muted-foreground))] cursor-text bg-transparent"
    >
      <span className="truncate">{label}</span>
      {clearable && (
        <span
          role="button"
          tabIndex={0}
          aria-label={clearAriaLabel}
          onMouseDown={triggerClear}
          onKeyDown={onClearKeyDown}
          className="shrink-0 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        >
          <X
            className="h-4 w-4 text-[hsl(var(--text-disabled))] hover:text-foreground transition-colors"
            data-testid="X__88e7eb" />
        </span>
      )}
    </button>
  );
}

export default SelectorChip;
