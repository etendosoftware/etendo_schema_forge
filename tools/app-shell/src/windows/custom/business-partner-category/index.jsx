import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFeatureFlag, CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { ACCOUNTING_CAPABILITY, isCapabilityVisible } from '@/lib/capabilityVisibility.js';
import BusinessPartnerCategoryApp from '@generated/business-partner-category/generated/web/business-partner-category/index.jsx';
import BusinessPartnerCategoryForm from '@generated/business-partner-category/generated/web/business-partner-category/BusinessPartnerCategoryForm';
import BpCategoryAccountingPanel from '@generated/business-partner-category/custom/BpCategoryAccountingPanel';
import DefaultAssignmentField from '@generated/business-partner-category/custom/DefaultAssignmentField';
import ContactTypeField from '@generated/business-partner-category/custom/ContactTypeField';
import { contactTypeBaseFilter } from '@generated/business-partner-category/custom/bpCategoryContactTypes.js';
import { BpCategoryWindowContext, useBpCategoryWindow } from '@generated/business-partner-category/custom/bpCategoryWindowContext.js';
import { useNotifyOnHeaderSave } from '@generated/business-partner-category/custom/useAssociatedContactsNotice.js';

/* eslint-disable react/prop-types */

/**
 * Contact Category window — the toggle point of the `contact-category-type` flag (ETP-5791) for
 * the record view and the list filter. The list columns are gated by `BpCategoryTable`
 * (decisions.json `customComponents.headerTable`); everything here relies on the generated page
 * spreading `{...props}` AFTER its own props, so what this wrapper passes wins.
 *
 * The contact type (`etgoIscustomer` / `etgoIsvendor`): with the flag off it is not shown at all
 * (the window as before ETP-5791); with the flag on it lives in the Accounting tab. While the form
 * does not draw it, it excludes `etgoIscustomer` and registers it as a gate exclusion (it is
 * `required` in the contract: without the exclusion DetailView's required-field gate would wait
 * for a field this form does not render, see ETP-4933). One exception: the Accounting tab is
 * hidden for a role without the `showAccountingFields` capability (decisions
 * `detailVisibleWhenCapability`), and such a role must still be able to set a type (the backend
 * refuses a category with none) — so with the flag on and no capability the header keeps the
 * "Tipo de contacto" group (`ContactTypeField`) in its own row, as before the Figma alignment.
 *
 * Flag ON (Figma "Form View Categoría de contacto" / "Categoría de Contacto Tabla"):
 *  - header form: Identificador, Nombre, "Asignación predeterminada" (`DefaultAssignmentField`,
 *    the `default` checkbox with a caption) in row 1 and Descripción in row 2. The form also hosts
 *    the "category saved with associated contacts" notice (always mounted);
 *  - Accounting tab: `BpCategoryAccountingPanel` (contact-type cards + accounts) instead of the
 *    generated inline-editable table. It writes the type checkboxes through `formBridge`;
 *  - list: the contact-type quick filter's value becomes ListView's `baseFilter` (server-side).
 *
 * Flag OFF: the generated form (minus the type), the generated Accounting table, no list filter.
 */

const CONTACT_TYPE_FIELDS = ['etgoIscustomer'];

// Flag-on header order: the `default` checkbox (with its caption) right after Name, so row 1 is
// Identificador | Nombre | Asignación predeterminada and Descripción (span 2) wraps to row 2.
const FLAG_ON_ORDER = ['searchKey', 'name', 'default', 'description'];
const GENERATED_FIELDS = Array.isArray(BusinessPartnerCategoryForm.fields) ? BusinessPartnerCategoryForm.fields : [];
const FLAG_ON_RENDERERS = {
  default: { customRenderer: DefaultAssignmentField },
  // Only drawn in the no-accounting-capability fallback (otherwise excluded): a full-width row.
  etgoIscustomer: { customRenderer: ContactTypeField, span: 4 },
};
const FLAG_ON_FIELDS = [
  ...FLAG_ON_ORDER
    .map((key) => GENERATED_FIELDS.find((f) => f?.key === key))
    .filter(Boolean),
  ...GENERATED_FIELDS.filter((f) => !FLAG_ON_ORDER.includes(f?.key)),
].map((f) => (FLAG_ON_RENDERERS[f?.key] ? { ...f, ...FLAG_ON_RENDERERS[f.key] } : f));
const NO_EXCLUSIONS = [];

function BpCategoryForm({ registerGateExclusions, ...props }) {
  const categoryTypeEnabled = useFeatureFlag(CONTACT_CATEGORY_TYPE);
  const capabilities = useCapabilitiesSafe();
  const windowState = useBpCategoryWindow();
  const typeInHeader = categoryTypeEnabled && !isCapabilityVisible(capabilities, ACCOUNTING_CAPABILITY);
  const excludeFields = typeInHeader ? NO_EXCLUSIONS : CONTACT_TYPE_FIELDS;
  useEffect(() => {
    registerGateExclusions?.(excludeFields);
  }, [registerGateExclusions, excludeFields]);
  // The notice is a flag-on behaviour; with a null record the hook does nothing. DetailView mounts
  // this form twice (the `principal` section and the always-mounted, often hidden `collapsed`
  // one), so only the principal instance notifies — otherwise one save would toast twice.
  useNotifyOnHeaderSave(categoryTypeEnabled && props.section === 'principal' ? props.data : null);
  // Hand the form's write callbacks to the Accounting tab panel (a sibling inside DetailView).
  const { onChange, onFieldBlur } = props;
  useLayoutEffect(() => {
    if (windowState?.formBridge) windowState.formBridge.current = { onChange, onFieldBlur };
  }, [windowState, onChange, onFieldBlur]);
  const flagOnProps = categoryTypeEnabled ? { fields: FLAG_ON_FIELDS } : {};
  return (
    <BusinessPartnerCategoryForm
      {...props}
      {...flagOnProps}
      excludeFields={excludeFields}
      data-testid="BusinessPartnerCategoryForm__bpCategoryWindow" />
  );
}
// DetailView reads these statics off the Form it is given (required-field gate, collapsed fields).
BpCategoryForm.fields = BusinessPartnerCategoryForm.fields;
BpCategoryForm.hasCollapsedFields = BusinessPartnerCategoryForm.hasCollapsedFields;

export default function BusinessPartnerCategoryWindow(props) {
  const categoryTypeEnabled = useFeatureFlag(CONTACT_CATEGORY_TYPE);
  const formBridge = useRef(null);
  const [contactType, setContactType] = useState(null);
  const windowState = useMemo(
    () => ({ formBridge, contactType, setContactType }),
    [contactType],
  );
  const accountingTab = categoryTypeEnabled
    ? {
      DetailTable: null,
      DetailForm: null,
      CustomLines: BpCategoryAccountingPanel,
      customLinesLabel: 'Accounting',
    }
    : {};
  // The list's contact-type quick filter (BpCategoryTable.ToolbarQuickFilter), server-side.
  const baseFilter = categoryTypeEnabled && !props.recordId ? contactTypeBaseFilter(contactType) : null;
  const listFilter = baseFilter ? { baseFilter } : {};
  return (
    <BpCategoryWindowContext.Provider value={windowState}>
      <BusinessPartnerCategoryApp
        {...props}
        Form={BpCategoryForm}
        {...accountingTab}
        {...listFilter}
        data-testid="BusinessPartnerCategoryApp__bpCategoryWindow" />
    </BpCategoryWindowContext.Provider>
  );
}
