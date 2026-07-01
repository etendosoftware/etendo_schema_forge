import { X } from 'lucide-react';

/**
 * Figma chip used by FK pickers (Contacto, Tarifa, Dirección, etc.) when a
 * value is selected. Gray pill (`#F5F7F9`) with the display label and an
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
      className="inline-flex items-center gap-1 max-w-full min-w-0 px-2 py-1 rounded-lg bg-[#F5F7F9] text-sm text-[#3F3F50] hover:brightness-95 transition cursor-text"
    >
      <span className="truncate">{label}</span>
      {clearable && (
        <span
          role="button"
          tabIndex={0}
          aria-label={clearAriaLabel}
          onMouseDown={triggerClear}
          onKeyDown={onClearKeyDown}
          className="shrink-0 inline-flex items-center justify-center"
        >
          <X
            className="h-4 w-4 text-[#828FA3] hover:text-foreground transition-colors"
            data-testid="X__88e7eb" />
        </span>
      )}
    </button>
  );
}

export default SelectorChip;
