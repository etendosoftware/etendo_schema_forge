import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import LeadTable from './LeadTable';
import LeadForm from './LeadForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'crm', name: 'Lead' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="lead"
        Form={LeadForm}
        catalogs={catalogs}
        entityLabel="Lead"
        windowName={windowName}
        recordId={recordId}
        window={windowMeta}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="lead"
      Table={LeadTable}
      entityLabel="Lead"
      windowName={windowName}
      window={windowMeta}
      {...props}
    />
  );
}
