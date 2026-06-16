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
import { SupportChatProvider, useSupportChat } from '@/components/support/SupportChatContext.jsx';
import { SupportChatWidget } from '@/components/support/SupportChatWidget.jsx';

const COLLAPSED_W = 56;
const EXPANDED_W = 240;

function AppLayoutInner({ menuGroups, embedded }) {
  const location = useLocation();
  const { expanded, toggle } = useSidebar();
  const meta = usePageMeta();
  const marginLeft = expanded ? EXPANDED_W : COLLAPSED_W;
  const { state: supportState, actions: supportActions } = useSupportChat();

  return (
    <>
      {!embedded && (
        <SideMenu
          menuGroups={menuGroups}
          expanded={expanded}
          onToggle={toggle}
          onHelpClick={supportState.isOpen ? supportActions.close : supportActions.open}
          unreadCount={supportState.unreadCount}
        />
      )}
      <div
        className="flex h-screen flex-col transition-[margin-left] duration-200 ease-in-out bg-page-bg"
        style={{ marginLeft: embedded ? 0 : marginLeft }}
      >
        {!embedded && (
          <TopBar
            onBack={meta?.onBack}
            title={meta?.title}
            breadcrumb={meta?.breadcrumb}
            recordCount={meta?.recordCount}
            menuAction={meta?.menuAction}
            onAddToFavorites={meta?.onAddToFavorites}
            isFavorite={meta?.isFavorite}
            onPageHelp={meta?.onPageHelp}
            onAIClick={meta?.onAIClick}
            rightExtras={meta?.rightExtras}
          />
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
                <Outlet />
              </div>
            </div>
          );
        })()}
      </div>
      {!embedded && <CommandPalette />}
      {!embedded && <CopilotWidget hideTrigger />}
      {!embedded && <SupportChatWidget />}
    </>
  );
}

export default function AppLayout({ menuGroups }) {
  const [searchParams] = useSearchParams();
  const embedded = searchParams.get('embedded') === '1';

  return (
    <CurrentWindowProvider>
      <CopilotProvider>
        <SupportChatProvider>
          <FavoritesProvider>
            <SidebarProvider>
              <PageMetaProvider>
                <AppLayoutInner menuGroups={menuGroups} embedded={embedded} />
              </PageMetaProvider>
            </SidebarProvider>
          </FavoritesProvider>
        </SupportChatProvider>
      </CopilotProvider>
    </CurrentWindowProvider>
  );
}
