import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AppSidebar from './Sidebar.jsx';
import { CommandPalette } from '@/components/CommandPalette.jsx';
import { InspectorProvider } from '@/components/inspector/InspectorProvider.jsx';
import { SchemaInspector } from '@/components/inspector/SchemaInspector.jsx';
import { findActiveGroup } from './Sidebar.jsx';
import { getSectionColor } from '@/lib/sectionColors.js';
import { CopilotProvider } from '@/components/CopilotContext';
import { CopilotWidget } from '@/components/CopilotWidget';

export default function AppLayout({ menuGroups }) {
  const location = useLocation();
  const activeGroup = findActiveGroup(menuGroups, location.pathname);
  const sectionColor = getSectionColor(activeGroup?.group);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try { return localStorage.getItem('sidebar-expanded') === 'true'; } catch { return false; }
  });

  const marginLeft = sidebarExpanded ? 240 : 60;

  return (
    <CopilotProvider>
      <InspectorProvider>
        <AppSidebar
          menuGroups={menuGroups}
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(prev => {
            const next = !prev;
            try { localStorage.setItem('sidebar-expanded', String(next)); } catch {}
            return next;
          })}
        />
        <div
          className="flex h-screen flex-col overflow-hidden transition-[margin-left] duration-200 ease-in-out bg-background"
          style={{ marginLeft }}
        >
          <div
            key={location.pathname}
            className="relative flex-1 flex flex-col overflow-hidden page-transition"
          >
            <div className="relative z-10 flex-1 flex flex-col min-h-0">
              <Outlet />
            </div>
          </div>
        </div>
        <CommandPalette />
        <SchemaInspector />
        <CopilotWidget />
      </InspectorProvider>
    </CopilotProvider>
  );
}
