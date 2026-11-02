/**
 * The table shell of the "Representante legal / Modelo 390" section (ETP-5716, ETP-5831): the
 * bordered, fixed-layout table with a muted header row. Shared by the legal representatives grid
 * (`RepresentantesLegalesSection`) and the single natural-person row of `Modelo390IdentitySection`,
 * so both identity branches of the section read as the same grid.
 *
 * `head` is the content of the header row (`<th>` cells, see `RepresentativeHeaderCell`);
 * `children` are the body rows.
 */
export function RepresentativeTableFrame({ head, children }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border" data-testid="RepresentativeTableFrame__root">
      <table className="w-full table-fixed">
        <thead>
          <tr className="border-b border-border bg-muted/40">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** A header cell with the grid's typography. Extra props (style, grid-view handlers) pass through. */
export function RepresentativeHeaderCell({ className = '', children, ...rest }) {
  return (
    <th className={`relative h-9 px-3 text-left align-middle text-xs font-semibold text-foreground ${className}`.trim()} {...rest}>
      {children}
    </th>
  );
}
