import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import SideMenu from '@/components/layout/SideMenu';
import { SidebarProvider, useSidebar } from '@/components/layout/SidebarContext';
import { FavoritesProvider } from '@/components/layout/FavoritesContext';
import { PageMetaProvider, usePageMeta } from '@/components/layout/PageMetaContext';
import TopBar from '@/components/layout/TopBar';
import { CommandPalette } from '@/components/CommandPalette.jsx';
import { CopilotProvider } from '@/components/CopilotContext';
import { CopilotWidget } from '@/components/CopilotWidget';
import { CurrentWindowProvider } from '@/components/CurrentWindowContext';

const COLLAPSED_W = 56;
const EXPANDED_W = 240;

function AppLayoutInner({ menuGroups, embedded }) {
  const location = useLocation();
  const { expanded, toggle } = useSidebar();
  const meta = usePageMeta();
  const marginLeft = expanded ? EXPANDED_W : COLLAPSED_W;

  return (
    <>
      {!embedded && (
        <SideMenu
          menuGroups={menuGroups}
          expanded={expanded}
          onToggle={toggle}
          data-testid="SideMenu__488148" />
      )}
      <div
        className="flex h-screen flex-col transition-[margin-left] duration-200 ease-in-out bg-page-bg"
        style={{ marginLeft: embedded ? 0 : marginLeft }}
      >
        {!embedded && (
          <TopBar
            onBack={meta?.onBack}
            title={meta?.title}
            titleExtra={meta?.titleExtra}
            breadcrumb={meta?.breadcrumb}
            recordCount={meta?.recordCount}
            menuAction={meta?.menuAction}
            onAddToFavorites={meta?.onAddToFavorites}
            isFavorite={meta?.isFavorite}
            onPageHelp={meta?.onPageHelp}
            onAIClick={meta?.onAIClick}
            rightExtras={meta?.rightExtras}
            data-testid="TopBar__488148" />
        )}
        {(() => {
          // Key strategy: preserve state when navigating /:window/new → /:window/:id
          // (post-save transition). The animation still replays on list↔detail and
          // across different windows because those change the key.
          const [, win, rec] = location.pathname.split('/');
          const pageKey = rec ? `${win}-detail` : (win || '/');
          return (
            <div
              key={pageKey}
              className="relative flex-1 min-h-0 flex flex-col page-transition pr-3 pb-3"
            >
              <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-border/30 overflow-hidden">
                <Outlet data-testid="Outlet__488148" />
              </div>
            </div>
          );
        })()}
      </div>
      {!embedded && <CommandPalette data-testid="CommandPalette__488148" />}
      {!embedded && <CopilotWidget hideTrigger data-testid="CopilotWidget__488148" />}
    </>
  );
}

export default function AppLayout({ menuGroups }) {
  const [searchParams] = useSearchParams();
  const embedded = searchParams.get('embedded') === '1';

  return (
    <CurrentWindowProvider data-testid="CurrentWindowProvider__488148">
      <CopilotProvider data-testid="CopilotProvider__488148">
        <FavoritesProvider data-testid="FavoritesProvider__488148">
          <SidebarProvider data-testid="SidebarProvider__488148">
            <PageMetaProvider data-testid="PageMetaProvider__488148">
              <AppLayoutInner
                menuGroups={menuGroups}
                embedded={embedded}
                data-testid="AppLayoutInner__488148" />
            </PageMetaProvider>
          </SidebarProvider>
        </FavoritesProvider>
      </CopilotProvider>
    </CurrentWindowProvider>
  );
}
