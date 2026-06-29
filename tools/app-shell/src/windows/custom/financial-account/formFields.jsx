/**
 * Shared form-field primitives for the financial-account modals (Create
 * movement, Create statement). Keeping a single `inputClass` + `FieldRow` here
 * guarantees both modals render identical fields.
 */

export const inputClass =
  'h-10 rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm text-[#121217] placeholder:text-[#8a8aa3] shadow-[0_1px_2px_rgba(18,18,23,0.05)] focus:outline-none focus:ring-2 focus:ring-[#121217] focus:ring-offset-1';

export const selectClass = inputClass;

/** Multi-line variant of {@link inputClass} (auto height instead of h-10). */
export const textareaClass =
  'min-h-[60px] rounded-lg border border-[#D1D4DB] bg-white px-3 py-2 text-sm text-[#121217] placeholder:text-[#8a8aa3] shadow-[0_1px_2px_rgba(18,18,23,0.05)] focus:outline-none focus:ring-2 focus:ring-[#121217] focus:ring-offset-1';

/**
 * Label + control stacked vertically. The control fills the cell width via the
 * flex-column's default `align-items: stretch`.
 *
 * @param {{ label: string, required?: boolean, optional?: string, children: React.ReactNode }} props
 */
export function FieldRow({ label, required, optional, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-[#3F3F50]">
        {label}
        {required ? <span className="text-[#9A1B1B]"> *</span> : null}
        {optional ? <span className="font-normal text-[#6C6C89]"> {optional}</span> : null}
      </span>
      {children}
    </label>
  );
}
