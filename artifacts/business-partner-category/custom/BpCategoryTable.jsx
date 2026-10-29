import { forwardRef, useMemo } from 'react';
import { useFeatureFlag, CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import BusinessPartnerCategoryTable from '../generated/web/business-partner-category/BusinessPartnerCategoryTable';

/**
 * Contact Category list (`window.customComponents.headerTable`). Wraps the generated table and
 * picks its columns by the `contact-category-type` flag (ETP-5791):
 *
 *  - ON  → Nombre, Cliente, Proveedor/Acreedor, Valor por defecto (the Identificador is hidden);
 *  - OFF → Identificador, Nombre — the list as it was before ETP-5791.
 *
 * decisions.json declares every column (`grid: true`) so the generated table carries all of them;
 * this wrapper only hides the ones the current flag state does not show. ListView's own
 * `hiddenColumns` (if any) are kept on top.
 */
const HIDDEN_WHEN_ON = ['searchKey'];
const HIDDEN_WHEN_OFF = ['etgoIscustomer', 'etgoIsvendor', 'default'];

const BpCategoryTable = forwardRef(function BpCategoryTable({ hiddenColumns: listHidden, ...props }, ref) {
  const categoryTypeEnabled = useFeatureFlag(CONTACT_CATEGORY_TYPE);
  const hiddenColumns = useMemo(
    () => [...(categoryTypeEnabled ? HIDDEN_WHEN_ON : HIDDEN_WHEN_OFF), ...(listHidden ?? [])],
    [categoryTypeEnabled, listHidden],
  );
  return (
    <BusinessPartnerCategoryTable
      ref={ref}
      {...props}
      hiddenColumns={hiddenColumns}
      data-testid="BusinessPartnerCategoryTable__bpCategoryTable" />
  );
});

export default BpCategoryTable;
