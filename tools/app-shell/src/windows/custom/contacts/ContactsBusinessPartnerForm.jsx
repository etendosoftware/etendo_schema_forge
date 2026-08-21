import BusinessPartnerForm from '@generated/contacts/generated/web/contacts/BusinessPartnerForm';
import { useContactsType } from './ContactsContext';

/* eslint-disable react/prop-types */

const PERSON_EXCLUDE = ['name'];
const COMPANY_EXCLUDE = ['etgoFirstname', 'etgoLastname'];

export default function ContactsBusinessPartnerForm(props) {
  const { personType } = useContactsType();
  const excludeFields = personType === 'person' ? PERSON_EXCLUDE : COMPANY_EXCLUDE;
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
