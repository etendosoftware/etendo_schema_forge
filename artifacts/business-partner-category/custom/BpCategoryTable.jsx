import { forwardRef, useMemo } from 'react';
import { DataTable } from '@/components/contract-ui';
import { TruncatedText } from '@/components/ui/truncated-text';
import { useFeatureFlag, CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import BusinessPartnerCategoryTable from '../generated/web/business-partner-category/BusinessPartnerCategoryTable';
import { ContactTypeQuickFilter } from './ContactTypeQuickFilter.jsx';

/**
 * Contact Category list (`window.customComponents.headerTable`), gated by the
 * `contact-category-type` flag (ETP-5791):
 *
 *  - OFF → the generated table, Identificador + Nombre — the list exactly as before ETP-5791
 *    (the flag-only columns are hidden through `hiddenColumns`).
 *  - ON  → the designer's list (Figma "Categoría de Contacto Tabla"): Nombre | Cliente |
 *    Proveedor/Acreedor | Valor por defecto, no Identificador. The columns are declared here, not
 *    in the generated literal, because they carry flag-only layout the generated table cannot
 *    express per flag: Nombre in semibold at a fixed 240px, the two type badges at 158px, and
 *    "Valor por defecto" as the single `grow` column, so it absorbs the leftover width and no
 *    column is stretched (DataTable's colgroup: one width-less <col>, see getTableContainerStyle).
 *    Every column keeps its real AD `column`, so all of them filter and sort server-side. The
 *    Identificador column stays declared (hidden) so the advanced filter still offers it, as it
 *    did while it was hidden from the generated list.
 *
 * The literal must stay in step with decisions.json (same keys, AD columns and badge config).
 *
 * `ToolbarQuickFilter` (static, read by ListView) is the contact-type quick filter; it renders
 * nothing with the flag off.
 */
const HIDDEN_WHEN_OFF = ['etgoIscustomer', 'etgoIsvendor', 'default'];
const HIDDEN_WHEN_ON = ['searchKey'];

const YES_NO_BADGE = {
  badge: true,
  badgeLabels: { true: { es_ES: 'Sí', en_US: 'Yes' }, false: { es_ES: 'No', en_US: 'No' } },
  badgeVariants: { true: 'green', false: 'neutral' },
};

const NAME_WIDTH_PX = 240;
const TYPE_BADGE_WIDTH_PX = 158;

function renderName(row) {
  const name = row?.name ?? '';
  return (
    <TruncatedText
      text={String(name)}
      className="text-sm font-semibold leading-5 text-[hsl(var(--foreground))]"
      data-testid="bp-category-name-cell" />
  );
}

const FLAG_ON_COLUMNS = [
  { key: 'searchKey', column: 'Value', type: 'string', label: 'Search Key', required: true, maxLength: 40 },
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true, maxLength: 60, minWidth: NAME_WIDTH_PX, render: renderName },
  { key: 'etgoIscustomer', column: 'EM_Etgo_Iscustomer', type: 'boolean', label: 'Customer', ...YES_NO_BADGE, required: true, minWidth: TYPE_BADGE_WIDTH_PX },
  { key: 'etgoIsvendor', column: 'EM_Etgo_Isvendor', type: 'boolean', label: 'Vendor/Creditor', ...YES_NO_BADGE, required: true, minWidth: TYPE_BADGE_WIDTH_PX },
  { key: 'default', column: 'IsDefault', type: 'boolean', label: 'Default', ...YES_NO_BADGE, required: true, grow: true },
];
const FLAG_ON_FILTERS = ['searchKey', 'name'];

const BpCategoryTable = forwardRef(function BpCategoryTable({ hiddenColumns: listHidden, ...props }, ref) {
  const categoryTypeEnabled = useFeatureFlag(CONTACT_CATEGORY_TYPE);
  const hiddenColumns = useMemo(
    () => [...(categoryTypeEnabled ? HIDDEN_WHEN_ON : HIDDEN_WHEN_OFF), ...(listHidden ?? [])],
    [categoryTypeEnabled, listHidden],
  );
  if (categoryTypeEnabled) {
    return (
      <DataTable
        columns={FLAG_ON_COLUMNS}
        filters={FLAG_ON_FILTERS}
        {...props}
        hiddenColumns={hiddenColumns}
        data-testid="BusinessPartnerCategoryTable__bpCategoryTable" />
    );
  }
  return (
    <BusinessPartnerCategoryTable
      ref={ref}
      {...props}
      hiddenColumns={hiddenColumns}
      data-testid="BusinessPartnerCategoryTable__bpCategoryTable" />
  );
});

BpCategoryTable.ToolbarQuickFilter = ContactTypeQuickFilter;

export default BpCategoryTable;
