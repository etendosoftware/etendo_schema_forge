import { useEffect } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import SideMenu from '@/components/layout/SideMenu';
import { filterMenuGroupsByAccess } from '@/windows/registry.js';
import { useRoleMenu } from '@/hooks/useRoleMenu.js';
import { useAccountIdentity } from '@/lib/flags/useAccountIdentity.js';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
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
import { Button } from '@/components/ui/button';
import { useLogout } from '@/auth/useLogout.js';
import { useUI } from '@/i18n';
import { fetchCurrencyFormatConfig } from '@/lib/currencyFormatConfig.js';

const COLLAPSED_W = 56;
const EXPANDED_W = 240;

// ETP-4514: `allowedIds` is a real, resolved `Set` only once SFListMenu has
// answered — `undefined` (in flight) and `null` (unauthenticated or fetch
// failure, deliberately fail-open per useRoleMenu.js) must NOT trigger this,
// only a confirmed empty Set (the role — or lack of one — grants zero access).
function NoAccessScreen() {
  const ui = useUI();
  const logout = useLogout();
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center"
      data-testid="NoAccessScreen__488148"
    >
      <p className="text-base font-medium text-foreground">{ui('noAccessTitle')}</p>
      <p className="text-sm text-muted-foreground">{ui('noAccessMessage')}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-4"
        onClick={logout}
        data-testid="NoAccessScreenLogout__488148"
      >
        <LogOut className="h-4 w-4 mr-2" data-testid="LogOut__488148" />
        {ui('logout')}
      </Button>
    </div>
  );
}

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
              <div className="flex-1 flex flex-col min-h-0 bg-card rounded-xl border border-border/30 overflow-hidden">
                <Outlet data-testid="Outlet__488148" />
              </div>
            </div>
          );
        })()}
      </div>
      {!embedded && <CommandPalette data-testid="CommandPalette__488148" />}
      {!embedded && <CopilotWidget hideTrigger data-testid="CopilotWidget__488148" />}
      {!embedded && <SupportChatWidget data-testid="SupportChatWidget__488148" />}
    </>
  );
}

export default function AppLayout({ menuGroups }) {
  const [searchParams] = useSearchParams();
  const embedded = searchParams.get('embedded') === '1';
  // AppLayout is rendered inside AppShellRuntime's AuthProvider (same place
  // SideMenu below already calls useAuth() today), unlike App.jsx itself — see
  // the note in App.jsx. That's why role-filtering is applied here rather than
  // where menuGroups is originally built.
  const allowedIds = useRoleMenu();
  // Same reason: this is the first component inside AuthProvider that has the
  // token, and flag targeting needs the account identity behind it.
  useAccountIdentity();
  // ETP-4314 — fetch the instance-wide currency separator config once per session
  // (fire-and-forget, fails soft to the current `.`/`,` defaults on error) so
  // formatCurrency() picks up the real configured value instead of a hardcoded one.
  useEffect(() => {
    fetchCurrencyFormatConfig();
  }, []);
  // ETP-4513 — the `SFWindowAccessMap` capabilities map (e.g.
  // `isAdminOrClientAdmin`), used to gate menu.json entries that declare
  // `"capability": "<key>"` (no backing AD_Window/AD_Process to check via
  // allowedIds — e.g. "Configuración > Roles"). `useCapabilitiesSafe()`
  // returns `{}` before the map has loaded, which `filterMenuGroupsByAccess`
  // already treats as "hide" for any capability-gated item (fails closed).
  const capabilities = useCapabilitiesSafe();
  // `undefined` = SFListMenu fetch still in flight — pass an empty Set so
  // filterMenuGroupsByAccess() fails closed for AD-backed items (any item
  // carrying a windowId/processId/obuiappProcessId is hidden until the real
  // Set arrives); items with none of those ids (dashboard, custom pages,
  // installed apps) and the Favorites group are never filtered and stay
  // visible throughout. This avoids the AD-backed part of the menu rendering
  // fully, then shrinking, once real data arrives (see useRoleMenu.js for the
  // full undefined/null/Set contract).
  const filteredMenuGroups = filterMenuGroupsByAccess(
    menuGroups,
    allowedIds === undefined ? new Set() : allowedIds,
    capabilities
  );

  // ETP-4514: a confirmed (not loading, not fail-open-null) empty Set means
  // the current role — or the lack of one — grants zero window/process
  // access. Render the blocking screen in place of the sidebar/Outlet entirely
  // so no menu item or direct route is reachable, per the "no menu/windows
  // reachable" acceptance criterion.
  if (allowedIds instanceof Set && allowedIds.size === 0) {
    return <NoAccessScreen data-testid="NoAccessScreen__488148" />;
  }

  return (
    <CurrentWindowProvider data-testid="CurrentWindowProvider__488148">
      <CopilotProvider menuGroups={filteredMenuGroups} data-testid="CopilotProvider__488148">
        <SupportChatProvider data-testid="SupportChatProvider__488148">
          <FavoritesProvider data-testid="FavoritesProvider__488148">
            <SidebarProvider data-testid="SidebarProvider__488148">
              <PageMetaProvider data-testid="PageMetaProvider__488148">
                <AppLayoutInner
                  menuGroups={filteredMenuGroups}
                  embedded={embedded}
                  data-testid="AppLayoutInner__488148" />
              </PageMetaProvider>
            </SidebarProvider>
          </FavoritesProvider>
        </SupportChatProvider>
      </CopilotProvider>
    </CurrentWindowProvider>
  );
}
