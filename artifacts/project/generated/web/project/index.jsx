import { ListView, DetailView } from '@/components/contract-ui';
import ProjectTable from './ProjectTable';
import ProjectForm from './ProjectForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'projects', name: 'Project' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="project"
        Form={ProjectForm}
        catalogs={catalogs}
        entityLabel="Project"
        windowName={windowName}
        recordId={recordId}
<<<<<<< HEAD
        window={windowMeta}
=======
>>>>>>> origin/main
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="project"
      Table={ProjectTable}
      entityLabel="Project"
      windowName={windowName}
<<<<<<< HEAD
      window={windowMeta}
=======
>>>>>>> origin/main
      {...props}
    />
  );
}
