import { Outlet, useLocation } from 'react-router-dom';
import AppSidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import { CopilotWidget } from '@/components/CopilotWidget.jsx';
import { CommandPalette } from '@/components/CommandPalette.jsx';
import { InspectorProvider } from '@/components/inspector/InspectorProvider.jsx';
import { SchemaInspector } from '@/components/inspector/SchemaInspector.jsx';

export default function AppLayout({ menuGroups }) {
  const location = useLocation();

  return (
    <InspectorProvider>
      <AppSidebar menuGroups={menuGroups} />
      <div className="ml-[60px] flex h-screen flex-col">
        <TopBar menuGroups={menuGroups} />
        <div key={location.pathname} className="flex-1 overflow-auto p-6 page-transition">
          <Outlet />
        </div>
      </div>
      <CopilotWidget />
      <CommandPalette />
      <SchemaInspector />
    </InspectorProvider>
  );
}
