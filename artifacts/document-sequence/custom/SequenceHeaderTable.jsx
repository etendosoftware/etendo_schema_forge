// Header table of "Secuencias de documentos": the generated SequenceTable, with the Name column
// sorted by the label the user reads instead of the internal AD_Sequence.Name (ETP-5837, QA CP-18).
//
// WHY CLIENT-SIDE. The list sorts server-side (ListView -> `_sortBy=name asc`), which orders the
// rows by the stored, untranslated names: "Purchase Order, Quotation, Standard Order" render as
// "Pedido de compra, Presupuesto de venta, Pedido de venta" — not alphabetical in either language.
// The spec exposes only a handful of rows (the seven series of DocumentSequenceHandler
// .VISIBLE_SEQUENCE_NAMES; a tenant with two quotation doctypes has two Quotation rows), always one
// page, so the page ListView already fetched IS the whole set and re-ordering it here is exact.
// Only the grid is re-sorted: Print/CSV goes through ReportDrawer with ListView's server sort.
// Only the Name sort is re-applied; every other column keeps the server order. MCP is unaffected:
// it still lists and sorts by the internal name.
//
// The label is resolved exactly as the cell renders it (DataTable's renderEnumCell:
// `tMenu(enumLabels[raw] ?? raw)`), from the same enumValues the generator reads, so the sort can
// never disagree with what is on screen.
import { forwardRef, useMemo } from 'react';
import { useLocaleSwitch, useMenuLabel } from '@/i18n';
import { sortRows } from '@/lib/clientSort';
import contract from '../contract.json';
import SequenceTable from '../generated/web/document-sequence/SequenceTable';

const NAME_KEY = 'name';

/** AD_Sequence.Name -> i18n key, from the contract's enumValues (decisions.json is the source). */
export const NAME_LABEL_KEYS = Object.fromEntries(
  (contract.frontendContract.entities.sequence.fields
    .find((field) => field.name === NAME_KEY)?.enumValues ?? [])
    .map(({ value, name }) => [value, name]),
);

/**
 * The rows in display order: re-sorted by the translated Name label when the list is sorted by
 * Name, otherwise returned as they came.
 *
 * @param {Array<object>} rows the page ListView fetched
 * @param {object} sort
 * @param {string|null} sort.sortColumn ListView's sort column
 * @param {'asc'|'desc'} [sort.sortDirection] ListView's sort direction
 * @param {function} sort.tMenu the useMenuLabel translator the cell uses
 * @param {string} [sort.locale] BCP-47 locale for the comparison (e.g. 'es-ES')
 * @returns {Array<object>}
 */
export function sortByDisplayedName(rows, { sortColumn, sortDirection, tMenu, locale }) {
  if (sortColumn !== NAME_KEY) return rows;
  return sortRows(rows, {
    key: NAME_KEY,
    direction: sortDirection === 'desc' ? 'desc' : 'asc',
    locale,
    accessors: { [NAME_KEY]: (row) => tMenu(NAME_LABEL_KEYS[row?.name] ?? row?.name) },
  });
}

const SequenceHeaderTable = forwardRef(function SequenceHeaderTable({ data, ...props }, ref) {
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();
  const { sortColumn, sortDirection } = props;
  const rows = useMemo(
    () => sortByDisplayedName(data, {
      sortColumn,
      sortDirection,
      tMenu,
      locale: locale ? locale.replace('_', '-') : undefined,
    }),
    [data, sortColumn, sortDirection, tMenu, locale],
  );
  return <SequenceTable ref={ref} {...props} data={rows} data-testid="SequenceHeaderTable__docseq" />;
});

export default SequenceHeaderTable;
