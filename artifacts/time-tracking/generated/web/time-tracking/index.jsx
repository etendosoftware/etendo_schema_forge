import { ListView, DetailView } from '@/components/contract-ui';
import TimeTrackingTable from './TimeTrackingTable';
import TimeTrackingForm from './TimeTrackingForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'hr', name: 'Time Tracking' };
const breadcrumb = 'Projects / Time Tracking';

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="timeTracking"
        Form={TimeTrackingForm}
        catalogs={catalogs}
        entityLabel="Time Tracking"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
        window={windowMeta}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="timeTracking"
      Table={TimeTrackingTable}
      entityLabel="Time Tracking"
      windowName={windowName}
      breadcrumb={breadcrumb}
      window={windowMeta}
      {...props}
    />
  );
}
