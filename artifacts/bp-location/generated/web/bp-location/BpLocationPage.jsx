import { useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import BpLocationTable from './BpLocationTable';
import BpLocationForm from './BpLocationForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Reference / BP Location';


// @sf-generated-start summary:bpLocation
const summary = [

];

const statusField = null;
// @sf-generated-end summary:bpLocation

// @sf-generated-start extraBadges:bpLocation
const extraBadges = [];
// @sf-generated-end extraBadges:bpLocation

// @sf-generated-start processes:bpLocation
const processes = [

];
// @sf-generated-end processes:bpLocation

// @sf-generated-start draftMode:bpLocation
const draftMode = null;
// @sf-generated-end draftMode:bpLocation



// @sf-generated-start component:BpLocationPage
export default function BpLocationPage({ windowName, recordId, ...props }) {
  
  if (recordId) {
    return (
      <DetailView
        entity="bpLocation"
        Form={BpLocationForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Bp Location"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="bpLocation"
      Table={BpLocationTable}
      entityLabel="BP Location"
      windowName={windowName}
      breadcrumb={breadcrumb}
      {...props}
    />
  );
}
// @sf-generated-end component:BpLocationPage
