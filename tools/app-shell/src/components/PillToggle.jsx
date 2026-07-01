/**
 * Generic pill on/off toggle — the canonical Etendo switch used across windows
 * (assets depreciation card, list-modal "active" cell, and anywhere else a
 * compact boolean control is needed).
 *
 * Controlled: pass `checked` + `onCheckedChange`. Renders a button[role=switch]
 * so it stays accessible and test-friendly (getByRole('switch')).
 *
 * Props:
 *  - checked:          boolean on/off state
 *  - onCheckedChange:  (next: boolean) => void — fired with the toggled value
 *  - disabled:         dims the control and blocks interaction
 *  - className:        extra classes merged onto the track button
 *  - ...rest:          forwarded to the button (id, aria-label, data-testid…)
 */
export function PillToggle({ checked, onCheckedChange, disabled = false, className = '', ...rest }) {
  const isOn = checked === true || checked === 'Y' || checked === 'true';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      disabled={disabled}
      onClick={() => { if (!disabled) onCheckedChange?.(!isOn); }}
      className={`relative inline-flex h-6 w-[42px] shrink-0 items-center rounded-full transition-colors focus:outline-none
        ${isOn ? 'bg-[#121217]' : 'bg-[#D1D1DB]'}
        ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
        ${className}`}
      {...rest}
    >
      <span
        className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm transition-all duration-150
          ${isOn ? 'translate-x-[19px]' : 'translate-x-[3px]'}`}
      />
    </button>
  );
}

export default PillToggle;
