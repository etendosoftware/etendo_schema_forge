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
      className="flex items-center justify-between gap-4 py-3 border-b border-[hsl(var(--muted))] last:border-b-0"
      data-testid={dataTestId}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
          {hint}
        </div>
        {caption && <p className="text-xs text-[hsl(var(--text-disabled))] mt-0.5">{caption}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        // ETP-4879 / ETP-5120: the shared Switch's default look derives the enabled
        // tracks from `bg-primary`/`bg-input` and the disabled tracks from a blanket
        // `disabled:opacity-50` on top of those same classes — none of the 4 resulting
        // shades match the real Figma export. Cancel the opacity dimming and pin all 4
        // states explicitly (`--switch-track-{off,on}-{enabled,disabled}`, defined in
        // this app's index.css as HSL triplets, same convention as every other theme
        // token) so every state — off/on x enabled/disabled — is a deliberate,
        // theme-aware colour instead of a Tailwind default or an opacity side effect.
        className="data-[state=unchecked]:bg-[hsl(var(--switch-track-off-enabled))] data-[state=checked]:bg-[hsl(var(--switch-track-on-enabled))] disabled:opacity-100 disabled:data-[state=unchecked]:bg-[hsl(var(--switch-track-off-disabled))] disabled:data-[state=checked]:bg-[hsl(var(--switch-track-on-disabled))]"
        data-testid={dataTestId ? `${dataTestId}-switch` : undefined}
      />
    </div>
  );
}

export default ToggleRow;
