import { ListView, DetailView } from '@/components/contract-ui';
import EmployeeTable from './EmployeeTable';
import EmployeeForm from './EmployeeForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'hr', name: 'Employee' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="employee"
        Form={EmployeeForm}
        catalogs={catalogs}
        entityLabel="Employee"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="employee"
      Table={EmployeeTable}
      entityLabel="Employee"
      windowName={windowName}
      {...props}
    />
  );
}
