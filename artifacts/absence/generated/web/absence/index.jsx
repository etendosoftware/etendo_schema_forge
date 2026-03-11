import { ListView, DetailView } from '@/components/contract-ui';
import AbsenceTable from './AbsenceTable';
import AbsenceForm from './AbsenceForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'hr', name: 'Absence' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="absence"
        Form={AbsenceForm}
        catalogs={catalogs}
        entityLabel="Absence"
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
      entity="absence"
      Table={AbsenceTable}
      entityLabel="Absences"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
