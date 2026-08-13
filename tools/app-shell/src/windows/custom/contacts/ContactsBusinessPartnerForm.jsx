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
