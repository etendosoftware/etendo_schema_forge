import { useEffect } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Building2, ChevronDown, Loader2, LogOut } from 'lucide-react';
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
import { GlobalSearchProvider } from '@/components/global-search/GlobalSearchContext.jsx';
import { CopilotProvider } from '@/components/CopilotContext';
import { CopilotWidget } from '@/components/CopilotWidget';
import { CurrentWindowProvider } from '@/components/CurrentWindowContext';
import { SupportChatProvider, useSupportChat } from '@/components/support/SupportChatContext.jsx';
import { SupportChatWidget } from '@/components/support/SupportChatWidget.jsx';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';
import { useLogout } from '@/auth/useLogout.js';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';
import { useUI } from '@/i18n';
import { fetchCurrencyFormatConfig } from '@/lib/currencyFormatConfig.js';
import { WalkthroughProvider } from '@etendosoftware/app-shell-core/walkthrough';
import { WALKTHROUGH_FLOWS } from '@/walkthrough/flows';
import { handleWalkthroughFinish } from '@/lib/walkthrough/walkthrough-events.js';

/**
 * ETP-5144 — the engine's `onFinish`, bound to the flow list so the handler can
 * look up the finished flow's `revision`. Module-level so its identity is
 * stable across renders; it persists progress AND reports the outcome, which
 * must agree on the same run (see `lib/walkthrough/walkthrough-events.js`).
 */
const reportWalkthroughFinish = (info) => handleWalkthroughFinish(info, WALKTHROUGH_FLOWS);

const COLLAPSED_W = 56;
const EXPANDED_W = 240;

function readSessionValue(key) {
  try {
    return globalThis.localStorage?.getItem(key) || '';
  } catch {
    return '';
  }
}

function readSessionRoleList() {
  try {
    const parsed = JSON.parse(readSessionValue('sf_auth_rolelist') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ETP-4514: `allowedIds` is a real, resolved `Set` only once SFListMenu has
// answered — `undefined` (in flight) and `null` (unauthenticated or fetch
// failure, deliberately fail-open per useRoleMenu.js) must NOT trigger this,
// only a confirmed empty Set (the role — or lack of one — grants zero access).
function NoAccessScreen() {
  const ui = useUI();
  const logout = useLogout();
  // ETP-5202 follow-up — this screen used to offer logout and nothing else, which turns
  // "your role grants no windows in THIS tenant" into a dead end for the whole account: no way
  // to reach another company, no way back to your own. Accepting an invitation makes it easy to
  // land here, since an invited user has no role assigned until an admin does it (ETP-4830).
  //
  // Switching company does NOT weaken ETP-4514's "no menu/windows reachable" criterion: it is a
  // platform-level action authorised by the account's own token, not by the role that grants
  // nothing here, and every window of THIS tenant stays just as unreachable. The sidebar itself
  // stays out, precisely because it does lead to AD windows.
  const { environments, switchTo, switching, currentClientId } = useEnvironmentSwitch();

  // "No access" has two causes that look identical from here — `allowedIds` is an empty Set
  // either way — but they need DIFFERENT things from an administrator, so the screen must not
  // guess. The role list the session was opened with tells them apart: no role at all (the
  // invited-user case: you belong to the company, nobody has assigned you a role yet) versus a
  // role that grants no window. Telling the first user "your role has no permissions" would send
  // them to ask for the wrong thing.
  const roleList = readSessionRoleList();
  const hasRole = roleList.length > 0;
  const companyName = readSessionValue('sf_auth_client_name') || ui('yourCompany');
  // One entry per client: the backend returns an environment per organization, so a client with
  // several orgs would otherwise be listed several times over. The current one is kept in the
  // list (disabled) rather than filtered out, so the menu also answers "where am I?".
  const companies = [...new Map(
    environments.filter((env) => env.clientId).map((env) => [env.clientId, env])
  ).values()];
  const canSwitch = companies.some((env) => env.clientId !== currentClientId);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center"
      data-testid="NoAccessScreen__488148"
    >
      <p className="text-base font-medium text-foreground" data-testid="no-access-title">
        {hasRole ? ui('noAccessRoleTitle') : ui('noAccessNoRoleTitle')}
      </p>
      <p className="max-w-md text-sm text-muted-foreground" data-testid="no-access-message">
        {/* replaceAll, not replace: the no-role copy names the company TWICE, and
            String.replace(string, …) only ever substitutes the first occurrence — which left a
            literal {companyName} on screen. */}
        {(hasRole ? ui('noAccessRoleMessage') : ui('noAccessNoRoleMessage'))
          .replaceAll('{companyName}', companyName)}
      </p>

      {/* Absent for an account that owns a single environment, or one that cannot list them at
          all (no platform token) — there is nowhere else to go, and an empty list would only
          suggest otherwise. */}
      {canSwitch && (
        <div className="mt-6 w-full max-w-xs text-left" data-testid="no-access-company-switch">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {ui('switchCompany')}
          </p>
          {/* A dropdown rather than a row of buttons: an account can belong to many companies,
              and a list that grows without bound would push the way out of the screen. The
              trigger doubles as the answer to "which one am I in?", which the blocking screen
              otherwise never says. */}
          <DropdownMenu data-testid="DropdownMenu__488148">
            <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__488148">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={switching !== null}
                data-testid="no-access-company-trigger"
              >
                {switching !== null
                  ? <Loader2 className="h-4 w-4 mr-2 shrink-0 animate-spin" data-testid="Loader2__488148" />
                  : <Building2 className="h-4 w-4 mr-2 shrink-0" data-testid="Building2__488148" />}
                <span className="flex-1 truncate text-left">{companyName}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" data-testid="ChevronDown__488148" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56" data-testid="DropdownMenuContent__488148">
              {companies.map((env) => {
                const isCurrent = env.clientId === currentClientId;
                return (
                  <DropdownMenuItem
                    key={env.clientId}
                    disabled={isCurrent || switching !== null}
                    onSelect={() => { if (!isCurrent) switchTo(env); }}
                    data-testid={`no-access-company-${env.clientId}`}
                  >
                    <Building2 className="h-4 w-4 mr-2 shrink-0" data-testid="Building2__488148" />
                    <span className="flex-1 truncate">
                      {env.clientName || env.orgName || ui('yourCompany')}
                    </span>
                    {switching === env.clientId && (
                      <Loader2 className="h-3.5 w-3.5 ml-2 shrink-0 animate-spin" data-testid="Loader2__488148" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

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
    <GlobalSearchProvider>
      <CurrentWindowProvider data-testid="CurrentWindowProvider__488148">
      <CopilotProvider menuGroups={filteredMenuGroups} data-testid="CopilotProvider__488148">
        <SupportChatProvider data-testid="SupportChatProvider__488148">
          <FavoritesProvider data-testid="FavoritesProvider__488148">
            <SidebarProvider data-testid="SidebarProvider__488148">
              <PageMetaProvider data-testid="PageMetaProvider__488148">
                {/* ETP-5144 — mounted here, inside the router and the locale
                    provider but ABOVE the routed Outlet, so a walkthrough that
                    navigates between windows survives the route change. The
                    flows are pure data (src/walkthrough/flows); the engine
                    itself lives in app-shell-core and is window-agnostic. */}
                <WalkthroughProvider
                  flows={WALKTHROUGH_FLOWS}
                  onFinish={reportWalkthroughFinish}
                  data-testid="WalkthroughProvider__488148">
                  <AppLayoutInner
                    menuGroups={filteredMenuGroups}
                    embedded={embedded}
                    data-testid="AppLayoutInner__488148" />
                </WalkthroughProvider>
              </PageMetaProvider>
            </SidebarProvider>
          </FavoritesProvider>
        </SupportChatProvider>
      </CopilotProvider>
      </CurrentWindowProvider>
    </GlobalSearchProvider>
  );
}
