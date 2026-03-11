import { ListView, DetailView } from '@/components/contract-ui';
import DealTable from './DealTable';
import DealForm from './DealForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'crm', name: 'Deal' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="deal"
        Form={DealForm}
        catalogs={catalogs}
        entityLabel="Deal"
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
      entity="deal"
      Table={DealTable}
      entityLabel="Deals"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
