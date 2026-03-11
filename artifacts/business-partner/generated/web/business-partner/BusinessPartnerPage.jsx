import { ListView, DetailView } from '@/components/contract-ui';
import BusinessPartnerTable from './BusinessPartnerTable';
import BusinessPartnerForm from './BusinessPartnerForm';
import BpLocationTable from './BpLocationTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'isActive', column: 'IsActive', type: 'boolean' },
];

const statusField = null;

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'name', column: 'Name', type: 'text', required: true, lookup: true },
    { key: 'address', column: 'Address1', type: 'text' },
    { key: 'city', column: 'City', type: 'text' },
    { key: 'postalCode', column: 'Postal', type: 'text' },
    { key: 'country', column: 'C_Country_ID', type: 'text' },
    { key: 'phone', column: 'Phone', type: 'text' },
  ],
  derived: [

  ],
};

export default function BusinessPartnerPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="businessPartner"
        detailEntity="bpLocation"
        Form={BusinessPartnerForm}
        DetailTable={BpLocationTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Business Partner"
        detailLabel="Bp Location"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="businessPartner"
      Table={BusinessPartnerTable}
      entityLabel="Business Partner"
      windowName={windowName}
      {...props}
    />
  );
}
