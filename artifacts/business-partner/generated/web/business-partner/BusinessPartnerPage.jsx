import { ListView, DetailView } from '@/components/contract-ui';
import BusinessPartnerTable from './BusinessPartnerTable';
import BusinessPartnerForm from './BusinessPartnerForm';
import BpLocationTable from './BpLocationTable';
import BpLocationForm from './BpLocationForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Reference / Business Partner';

// @sf-generated-start summary:businessPartner
const summary = [
  { key: 'creditUsed', column: 'SO_CreditUsed', type: 'amount' },
  { key: 'active', column: 'IsActive', type: 'boolean' },
];

const statusField = null;
// @sf-generated-end summary:businessPartner

// @sf-custom-slot extraBadges:businessPartner
// @sf-generated-start extraBadges:businessPartner
const extraBadges = [];
// @sf-generated-end extraBadges:businessPartner

// @sf-generated-start processes:businessPartner
const processes = [

];
// @sf-generated-end processes:businessPartner

// @sf-generated-start draftMode:businessPartner
const draftMode = null;
// @sf-generated-end draftMode:businessPartner

// @sf-generated-start addLineFields:bpLocation
const addLineFields = {
  entry: [
    { key: 'name', column: 'Name', type: 'text', required: true },
    { key: 'address', column: 'Address1', type: 'text' },
    { key: 'city', column: 'City', type: 'text' },
    { key: 'postalCode', column: 'Postal', type: 'text' },
    { key: 'country', column: 'C_Country_ID', type: 'text' },
    { key: 'phone', column: 'Phone', type: 'text' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:bpLocation

// @sf-generated-start component:BusinessPartnerPage
export default function BusinessPartnerPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:BusinessPartnerPage
  if (recordId) {
    return (
      <DetailView
        entity="businessPartner"
        detailEntity="bpLocation"
        Form={BusinessPartnerForm}
        DetailTable={BpLocationTable}
        DetailForm={BpLocationForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Business Partner"
        detailLabel="Bp Location"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="businessPartner"
      Table={BusinessPartnerTable}
      entityLabel="Business Partners"
      windowName={windowName}
      breadcrumb={breadcrumb}
      {...props}
    />
  );
}
// @sf-generated-end component:BusinessPartnerPage

// @sf-custom-slot section:BusinessPartnerPage-custom
