import { Switch } from '@/components/ui/switch';

/**
 * ToggleRow — a single switch row: label + optional grey sub-caption on the left,
 * an iOS-style Switch on the right. Generic / backwards-compatible: every prop
 * beyond `label` is optional.
 *
 * `hint` is an optional ReactNode rendered next to the label — callers use it to
 * attach a marker (e.g. a "non-functional / unbacked" indicator) without this
 * component needing to know about any window-specific concept.
 *
 * Use a list of ToggleRow inside a section to form a toggle group (e.g. the
 * "Políticas contables" and "Dimensiones contables" sections).
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.caption]
 * @param {import('react').ReactNode} [props.hint]
 * @param {boolean} props.checked
 * @param {(checked:boolean)=>void} [props.onCheckedChange]
 * @param {boolean} [props.disabled]
 */
export function ToggleRow({
  label,
  caption,
  hint,
  checked = false,
  onCheckedChange,
  disabled = false,
  'data-testid': dataTestId,
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-3 border-b border-[#F0F1F3] last:border-b-0"
      data-testid={dataTestId}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#121217]">{label}</span>
          {hint}
        </div>
        {caption && <p className="text-xs text-[#9A9DA8] mt-0.5">{caption}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        data-testid={dataTestId ? `${dataTestId}-switch` : undefined}
      />
    </div>
  );
}

export default ToggleRow;
