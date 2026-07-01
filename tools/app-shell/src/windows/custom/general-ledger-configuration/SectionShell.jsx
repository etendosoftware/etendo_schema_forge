/**
 * SectionShell — the left-column (title + grey subtitle) / right-area (field grid)
 * section pattern used on every tab of this window (see figma-spec.md "Section
 * pattern"). Sections are separated by a hairline rule. Window-local layout.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {boolean} [props.first] — omit the top divider on the first section
 * @param {import('react').ReactNode} props.children — the right area (grid)
 */
export default function SectionShell({ title, subtitle, first = false, children, 'data-testid': dataTestId }) {
  return (
    <section
      className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-x-8 gap-y-4 py-6 ${first ? '' : 'border-t border-[#E8EAEF]'}`}
      data-testid={dataTestId}
    >
      <div className="lg:pr-4">
        <h3 className="text-sm font-semibold text-[#121217]">{title}</h3>
        {subtitle && <p className="text-xs text-[#9A9DA8] mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}
