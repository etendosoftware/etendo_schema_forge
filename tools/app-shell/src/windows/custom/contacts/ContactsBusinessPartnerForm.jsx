import { useEffect } from 'react';
import BusinessPartnerForm from '@generated/contacts/generated/web/contacts/BusinessPartnerForm';
import { useContactsType } from './ContactsContext';

/* eslint-disable react/prop-types */

const PERSON_EXCLUDE = ['name'];
const COMPANY_EXCLUDE = ['etgoFirstname', 'etgoLastname'];

export default function ContactsBusinessPartnerForm({ registerGateExclusions, ...props }) {
  const { personType } = useContactsType();
  const excludeFields = personType === 'person' ? PERSON_EXCLUDE : COMPANY_EXCLUDE;
  // ETP-4933: all three excluded fields (`name` for a person, first/last name for a
  // company) are `required: true` in the contract. Without this the required-field
  // gate asks for a field this form never renders, and Save can never be enabled.
  // Both exclusion lists are module constants, so the effect only re-fires when the
  // person/company toggle actually changes.
  useEffect(() => {
    registerGateExclusions?.(excludeFields);
  }, [registerGateExclusions, excludeFields]);
  return (
    <BusinessPartnerForm
      {...props}
      excludeFields={excludeFields}
      data-testid="BusinessPartnerForm__2c74bf" />
  );
}

ContactsBusinessPartnerForm.hasCollapsedFields = BusinessPartnerForm.hasCollapsedFields;
// ETP-4933: forward the descriptor static too, or DetailView's required-field gate
// loses this window (it reads `Form.fields` off whatever component it was given).
ContactsBusinessPartnerForm.fields = BusinessPartnerForm.fields;
