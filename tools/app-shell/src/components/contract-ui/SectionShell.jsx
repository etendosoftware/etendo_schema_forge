/**
 * SectionShell — the left-column (title + grey subtitle) / right-area (field grid) section
 * pattern of the Esquema contable (General Ledger Configuration) tabs (see that window's
 * figma-spec.md "Section pattern"). Sections are separated by a hairline rule.
 *
 * Generic and window-agnostic: promoted from `windows/custom/general-ledger-configuration/`
 * (ETP-5791) so the contact category Accounting tab renders its
 * account sections with the same card.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {boolean} [props.first] — omit the top divider on the first section
 * @param {string} [props.paddingY] — vertical padding classes (default `py-6`, the Esquema contable
 *   rhythm); a host with its own top spacing (e.g. a detail tab) can tighten its first section.
 * @param {import('react').ReactNode} props.children — the right area (grid)
 */
export function SectionShell({ title, subtitle, first = false, paddingY = 'py-6', children, 'data-testid': dataTestId }) {
  return (
    <section
      className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-x-8 gap-y-4 ${paddingY} ${first ? '' : 'border-t border-[hsl(var(--border-subtle))]'}`}
      data-testid={dataTestId}
    >
      <div className="lg:pr-4">
        <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</h3>
        {subtitle && <p className="text-xs text-[hsl(var(--text-disabled))] mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export default SectionShell;
