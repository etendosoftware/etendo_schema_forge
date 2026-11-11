import { useCallback } from 'react';
import { DistinctValuesFilter } from '@etendosoftware/app-shell-core/components/ui/distinct-values-filter.jsx';
import { useLabel, useUI } from '@/i18n';
import { useFeatureFlag, CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import { CONTACT_TYPE_FILTERS, CONTACT_TYPE_FILTER_CODES } from './bpCategoryContactTypes.js';
import { useBpCategoryWindow } from './bpCategoryWindowContext.js';

/**
 * Contact category list — the contact-type quick filter (ETP-5791, `contact-category-type` flag).
 *
 * Rendered by ListView's own toolbar row, left of "Filtros", through the `ToolbarQuickFilter`
 * static of `BpCategoryTable` (the Users window's `RoleQuickFilterToolbarSlot` convention). A
 * single-select dropdown — the shared `DistinctValuesFilter`, without its search box: "Todos los
 * contactos" (default) / "Cliente" / "Proveedor/Acreedor", with a check on the active option.
 *
 * The value lives in the window wrapper's context; the wrapper turns it into ListView's
 * `baseFilter` (`contactTypeBaseFilter`), so the filtering is server-side on the real AD columns
 * `EM_Etgo_Iscustomer` / `EM_Etgo_Isvendor`. Option labels are those columns' AD labels, the same
 * words as the list headers.
 *
 * Renders nothing with the flag off or outside the window wrapper.
 */
export function ContactTypeQuickFilter() {
  const enabled = useFeatureFlag(CONTACT_CATEGORY_TYPE);
  const windowState = useBpCategoryWindow();
  const ui = useUI();
  const t = useLabel();
  const labelFor = useCallback(
    (code) => t(CONTACT_TYPE_FILTERS[code]?.column) ?? code,
    [t],
  );
  if (!enabled || !windowState) return null;
  return (
    <DistinctValuesFilter
      value={windowState.contactType}
      onChange={windowState.setContactType}
      codes={CONTACT_TYPE_FILTER_CODES}
      labelFor={labelFor}
      allLabel={ui('bpCategoryAllContacts')}
      searchable={false}
      searchPlaceholder=""
      popoverWidth="w-56"
      triggerTestId="bp-category-contact-type-filter"
      data-testid="DistinctValuesFilter__bpCategoryContactType" />
  );
}

export default ContactTypeQuickFilter;
