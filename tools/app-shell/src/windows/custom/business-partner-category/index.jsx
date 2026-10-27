import { useEffect } from 'react';
import { useFeatureFlag, CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import BusinessPartnerCategoryApp from '@generated/business-partner-category/generated/web/business-partner-category/index.jsx';
import BusinessPartnerCategoryForm from '@generated/business-partner-category/generated/web/business-partner-category/BusinessPartnerCategoryForm';
import BpCategoryAccountingPanel from '@generated/business-partner-category/custom/BpCategoryAccountingPanel';

/* eslint-disable react/prop-types */

/**
 * Contact Category window — the toggle point of the `contact-category-type` flag (ETP-5791) for
 * the record view. The list columns are gated by `BpCategoryTable` (decisions.json
 * `customComponents.headerTable`); everything here relies on the generated page spreading
 * `{...props}` AFTER its own props, so what this wrapper passes wins.
 *
 * Flag ON:
 *  - the header form shows the required "Tipo de contacto" group (`ContactTypeField`, the
 *    `customRenderer` decisions.json declares on `etgoIscustomer`), which also hosts the
 *    "category saved with associated contacts" notice;
 *  - the Accounting tab is `BpCategoryAccountingPanel` (accounts grouped by contact type) instead
 *    of the generated inline-editable accounting table.
 *
 * Flag OFF — the window as it was before ETP-5791: the form without the type group (and without
 * its required check), and the generated Accounting table.
 */

const CONTACT_TYPE_FIELDS = ['etgoIscustomer'];

function BpCategoryForm({ registerGateExclusions, ...props }) {
  const categoryTypeEnabled = useFeatureFlag(CONTACT_CATEGORY_TYPE);
  const excludeFields = categoryTypeEnabled ? undefined : CONTACT_TYPE_FIELDS;
  // `etgoIscustomer` is `required` in the contract: without the exclusion DetailView's
  // required-field gate would wait for a field this form does not render (see ETP-4933).
  useEffect(() => {
    registerGateExclusions?.(excludeFields ?? []);
  }, [registerGateExclusions, excludeFields]);
  return (
    <BusinessPartnerCategoryForm
      {...props}
      excludeFields={excludeFields}
      data-testid="BusinessPartnerCategoryForm__bpCategoryWindow" />
  );
}
// DetailView reads these statics off the Form it is given (required-field gate, collapsed fields).
BpCategoryForm.fields = BusinessPartnerCategoryForm.fields;
BpCategoryForm.hasCollapsedFields = BusinessPartnerCategoryForm.hasCollapsedFields;

export default function BusinessPartnerCategoryWindow(props) {
  const categoryTypeEnabled = useFeatureFlag(CONTACT_CATEGORY_TYPE);
  const accountingTab = categoryTypeEnabled
    ? {
      DetailTable: null,
      DetailForm: null,
      CustomLines: BpCategoryAccountingPanel,
      customLinesLabel: 'Accounting',
    }
    : {};
  return (
    <BusinessPartnerCategoryApp
      {...props}
      Form={BpCategoryForm}
      {...accountingTab}
      data-testid="BusinessPartnerCategoryApp__bpCategoryWindow" />
  );
}
