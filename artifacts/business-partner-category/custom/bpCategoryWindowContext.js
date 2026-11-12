import { createContext, useContext } from 'react';

/**
 * Contact category window state shared between pieces that DetailView / ListView render as
 * siblings (ETP-5791, `contact-category-type` flag on). Provided by the window wrapper
 * (`tools/app-shell/src/windows/custom/business-partner-category/index.jsx`), the only common
 * ancestor of all of them.
 *
 *  - `formBridge` — a ref the header form wrapper fills with the form's own write callbacks
 *    (`onChange(key, value, column)` and `onFieldBlur(key)`, the ones EntityForm uses). The
 *    Accounting tab panel writes the contact-type checkboxes through it, so a toggle there is the
 *    same header edit (and the same autosave, validation and rollback) as a checkbox of the form.
 *  - `contactType` / `setContactType` — the list's contact-type quick filter value (`null` = all,
 *    or a key of `CONTACT_TYPE_FILTERS`). The wrapper turns it into ListView's `baseFilter`.
 *
 * `null` outside the wrapper: every consumer treats that as "feature not wired" and renders
 * nothing / does nothing.
 */
export const BpCategoryWindowContext = createContext(null);

export function useBpCategoryWindow() {
  return useContext(BpCategoryWindowContext);
}
