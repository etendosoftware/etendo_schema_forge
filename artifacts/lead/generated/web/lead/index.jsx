import { ListView, DetailView } from '@/components/contract-ui';
import LeadTable from './LeadTable';
import LeadForm from './LeadForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'crm', name: 'Lead' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="lead"
        Form={LeadForm}
        catalogs={catalogs}
        entityLabel="Lead"
        windowName={windowName}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="lead"
      Table={LeadTable}
      entityLabel="Leads"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
