import { ListView, DetailView } from '@/components/contract-ui';
import ActivityTable from './ActivityTable';
import ActivityForm from './ActivityForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'crm', name: 'Activity' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="activity"
        Form={ActivityForm}
        catalogs={catalogs}
        entityLabel="Activity"
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
      entity="activity"
      Table={ActivityTable}
      entityLabel="Activitys"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
