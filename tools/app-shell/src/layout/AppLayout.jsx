import { useEffect, useState } from 'react';
import { isChromelessEmbed } from '@/lib/embeddedWindow.js';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, ChevronDown, Loader2, LogOut } from 'lucide-react';
import SideMenu from '@/components/layout/SideMenu';
import { filterMenuGroupsByAccess } from '@/windows/registry.js';
import { useRoleMenu } from '@/hooks/useRoleMenu.js';
import { useAccountIdentity } from '@/lib/flags/useAccountIdentity.js';
import { useAuthOptional } from '@etendosoftware/app-shell-core/auth';
import { useCapabilitiesSafe, useWindowAccessSafe } from '@/hooks/useCapabilitiesSafe.js';
import { SidebarProvider, useSidebar } from '@/components/layout/SidebarContext';
import { FavoritesProvider } from '@/components/layout/FavoritesContext';
import { PageMetaProvider, usePageMeta } from '@/components/layout/PageMetaContext';
import TopBar from '@/components/layout/TopBar';
import { CommandPalette } from '@/components/CommandPalette.jsx';
import { GlobalSearchProvider } from '@/components/global-search/GlobalSearchContext.jsx';
import { CopilotProvider } from '@/components/CopilotContext';
import { CopilotWidget } from '@/components/CopilotWidget';
import { CurrentWindowProvider } from '@/components/CurrentWindowContext';
import { FirstStepsProvider, useFirstStepsProgressOptional }
  from '@/pages/first-steps/FirstStepsContext.jsx';
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
import { useEnvironmentAccessGate } from '@/hooks/useEnvironmentAccessGate.js';
import { useUI } from '@/i18n';
import { fetchCurrencyFormatConfig } from '@/lib/currencyFormatConfig.js';
import { fetchMyReportAccess } from '@/lib/rolesApi.js';
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
  // ETP-4576 — both of these came out of localStorage (`sf_auth_rolelist`, `sf_auth_client_name`).
  // Those are legacy auth keys: `purgeLegacyAuthStorage` deletes them, so the reads answered ""
  // and "[]" for every user. The consequence was not cosmetic — `hasRole` was permanently false,
  // so this screen always told the visitor that nobody had assigned them a role, including the
  // user whose role simply grants no window. That is precisely the distinction the comment above
  // says the screen must not guess at. The session carries the role list; the company name is not
  // in it, so it is read off the environment list this hook already loads.
  const roleList = useAuthOptional()?.roleList;
  const hasRole = Array.isArray(roleList) && roleList.length > 0;
  // One entry per client: the backend returns an environment per organization, so a client with
  // several orgs would otherwise be listed several times over. The current one is kept in the
  // list (disabled) rather than filtered out, so the menu also answers "where am I?".
  const companies = [...new Map(
    environments.filter((env) => env.clientId).map((env) => [env.clientId, env])
  ).values()];
  const companyName = companies.find((env) => env.clientId === currentClientId)?.clientName
    || ui('yourCompany');
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
          all — there is nowhere else to go, and an empty list would only suggest otherwise.
          "Cannot list them" is no longer "has no platform token": `useEnvironmentSwitch` gates on
          the session being authenticated, and the listing rides the `__Host-` cookie. */}
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

// ETP-5443 follow-up — copy + CTA target per blocking decision. See
// lib/environmentAccessGate.js for how these two decisions are detected and why
// MEMBERSHIP_REQUIRED (the third member of EnvironmentAccessPolicy.Decision) is not here.
const BLOCKED_ACCESS_CONTENT = {
  DEMO_TRIAL_EXPIRED: {
    titleKey: 'blockedAccessDemoExpiredTitle',
    messageKey: 'blockedAccessDemoExpiredMessage',
    ctaKey: 'blockedAccessUpgradeCta',
    ctaPath: '/upgrade',
  },
  SUBSCRIPTION_REQUIRED: {
    titleKey: 'blockedAccessSubscriptionRequiredTitle',
    messageKey: 'blockedAccessSubscriptionRequiredMessage',
    ctaKey: 'blockedAccessManageSubscriptionCta',
    ctaPath: '/account',
  },
};

// ETP-5443 follow-up — both routes resolve through the account's own platform token
// (SubscriptionSection.jsx / UpgradePage.jsx), independent of the blocked tenant NEO
// session, and are literally where this screen's own CTA sends the user. They must stay
// reachable while `environmentAccessDecision` is set, so AppLayoutAccessGate falls through
// to the normal Outlet render (full chrome + routed page) instead of this screen on either
// path — see the check around BlockedAccessScreen's render below.
const ENVIRONMENT_GATE_EXEMPT_PATHS = ['/account', '/upgrade'];
function isEnvironmentGateExemptPath(pathname) {
  return ENVIRONMENT_GATE_EXEMPT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

// ETP-5443 follow-up — replaces NoAccessScreen for a commercial cut-off (demo trial
// expired / subscription grace elapsed). Reuses NoAccessScreen's outer layout/style
// (centered column, environment switcher, logout) but with its own copy and a primary CTA,
// since an administrator needs to ACT (upgrade / fix payment), not just be told to ask one.
function BlockedAccessScreen({ decision }) {
  const ui = useUI();
  const logout = useLogout();
  const navigate = useNavigate();
  const { environments, switchTo, switching, currentClientId } = useEnvironmentSwitch();
  const companies = [...new Map(
    environments.filter((env) => env.clientId).map((env) => [env.clientId, env])
  ).values()];
  const companyName = companies.find((env) => env.clientId === currentClientId)?.clientName
    || ui('yourCompany');
  const canSwitch = companies.some((env) => env.clientId !== currentClientId);

  // AppLayoutAccessGate only renders this for a decision BLOCKED_ACCESS_CONTENT knows
  // about (see isBlockingAccessDecision in lib/environmentAccessGate.js) — this is a
  // defensive fallback, not a reachable case, for a future decision this map hasn't
  // learned yet.
  const content = BLOCKED_ACCESS_CONTENT[decision];
  if (!content) return null;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center"
      data-testid="BlockedAccessScreen__488148"
    >
      <p className="text-base font-medium text-foreground" data-testid="blocked-access-title">
        {ui(content.titleKey)}
      </p>
      <p className="max-w-md text-sm text-muted-foreground" data-testid="blocked-access-message">
        {ui(content.messageKey)}
      </p>

      <Button
        type="button"
        className="mt-4"
        onClick={() => navigate(content.ctaPath)}
        data-testid="blocked-access-cta"
      >
        {ui(content.ctaKey)}
      </Button>

      {/* Same rationale as NoAccessScreen's own switcher: a blocked TENANT session does not
          mean a blocked ACCOUNT — the account may own other, unaffected environments. */}
      {canSwitch && (
        <div className="mt-6 w-full max-w-xs text-left" data-testid="blocked-access-company-switch">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {ui('switchCompany')}
          </p>
          <DropdownMenu data-testid="DropdownMenu__488148">
            <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__488148">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={switching !== null}
                data-testid="blocked-access-company-trigger"
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
                    data-testid={`blocked-access-company-${env.clientId}`}
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
        data-testid="BlockedAccessScreenLogout__488148"
      >
        <LogOut className="h-4 w-4 mr-2" data-testid="LogOut__488148" />
        {ui('logout')}
      </Button>
    </div>
  );
}

// ETP-5395 Point 1 Fix B — while `allowedIds === undefined` (SFListMenu fetch
// still in flight), `filterMenuGroupsByAccess`'s stand-in empty Set only hides
// AD-backed menu items (see the comment above its call below) — an item with
// NO windowId/processId/obuiappProcessId (e.g. menu.json's "first-steps" or
// "dashboard" entries) is never filtered and renders immediately, making it
// reachable via <Outlet> before the real Set (and the NoAccessScreen
// size-check) ever gets a chance to act. This blank placeholder replaces the
// whole routed/role-gated tree until the real Set arrives. No message: the
// wait is normally sub-second, so no i18n key is worth adding for it — reuses
// NoAccessScreen's own outer wrapper markup/styling with nothing inside.
function AppLayoutLoading() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center"
      data-testid="AppLayoutLoading__488148"
    />
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

/**
 * ETP-5364 — mounts `FirstStepsProvider` ABOVE the access gate below, so the checklist state is
 * one more input the menu is decided from rather than something that arrives after it painted.
 *
 * Two reasons it has to be here and not inside `AppLayoutAccessGate`'s return tree, where it used
 * to live:
 *
 *  - `filterMenuGroupsByAccess` runs inside that component and now reads `dismissed`, so the
 *    provider must be an ANCESTOR of it, not a descendant;
 *  - mounted below the `allowedIds === undefined` gate, the checklist GET could not even START
 *    until SFListMenu had answered — so the sidebar was guaranteed to paint before the state was
 *    known, and a dismissed user saw the entry appear and then vanish. Up here the two requests
 *    are in flight together.
 *
 * It now also wraps `AppLayoutLoading` and `NoAccessScreen`. That is the point for the first one;
 * for the second it costs one small account-scoped GET in a state that renders nothing, which is
 * cheaper than threading the state around the gate.
 */
export default function AppLayout({ menuGroups }) {
  return (
    <FirstStepsProvider data-testid="FirstStepsProvider__488148">
      <AppLayoutAccessGate menuGroups={menuGroups} data-testid="AppLayoutAccessGate__488148" />
    </FirstStepsProvider>
  );
}

function AppLayoutAccessGate({ menuGroups }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // `1` is the read-only preview embed (DetailView also drops pointer events for it).
  // `interactive` strips the same chrome — sidebar, topbar, palette, widgets — but leaves
  // the window usable, which is what hosting a real window inside a dialog needs.
  const embedded = isChromelessEmbed(searchParams.get('embedded'));
  // ETP-5443 follow-up — see lib/environmentAccessGate.js for how a NEO 402 (the whole
  // environment's commercial access cut off) is captured here, decoupled from AuthContext's
  // own windowAccess/capabilities/menuAccess shape.
  const environmentAccessDecision = useEnvironmentAccessGate();
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
  // ETP-5240 — the real per-window AD_Window_Access tier map, used to gate
  // menu.json entries that declare `"accessWindowId": "<AD_Window_ID>"` for a
  // permission-anchor window with no active AD_Menu node (report viewers,
  // Smart Scan — see filterMenuGroupsByAccess's JSDoc). `useWindowAccessSafe()`
  // returns `{}` before the map has loaded, which filterMenuGroupsByAccess
  // already treats as "hide" for any accessWindowId-gated item (fails closed).
  const windowAccess = useWindowAccessSafe();
  // ETP-5364 — the fourth menu axis, and the only one that is a user preference rather than an
  // access rule: `"hideWhenFirstStepsDismissed": true` on menu.json's first-steps entry. Read
  // through the Optional accessor for the same reason the two above use their `*Safe()` hooks —
  // a tree with no provider must not throw. `undefined` (no provider, or the state not answered
  // yet) fails closed in `filterMenuGroupsByAccess`, which is what stops the entry painting
  // before its state is known.
  const firstStepsDismissed = useFirstStepsProgressOptional()?.dismissed;

  // ETP-5402 QA follow-up — the caller's own Informes-subsection report access
  // (`fetchMyReportAccess()`), used only as a FALLBACK inside `filterMenuGroupsByAccess`'s
  // `accessWindowId` check (see that function's own JSDoc): a role with a real per-report grant
  // but not the category's coarse permission-anchor window (e.g. Sales on `aging-receivable`,
  // not the Financial Reports window) still needs to see the "Informes" sidebar link. Unlike
  // `capabilities`/`windowAccess` above, this is NOT sourced from `useAuth()` (core-managed state
  // this repo cannot extend) — it is this repo's own fetch, fired once per mount. `{}` before it
  // resolves fails closed the same way the other two maps already do.
  const [reportAccess, setReportAccess] = useState({});
  useEffect(() => {
    // Skip entirely once allowedIds confirms zero window/process access (ETP-4514's blocking
    // screen is about to render) — there is no menu left to apply the report-access fallback to,
    // so this fetch would be pure waste on exactly the request path a locked-out caller hits.
    if (allowedIds && allowedIds.size === 0) return undefined;
    let cancelled = false;
    fetchMyReportAccess()
      .then((res) => { if (!cancelled) setReportAccess(res?.reportAccess ?? {}); })
      .catch(() => { if (!cancelled) setReportAccess({}); });
    return () => { cancelled = true; };
  }, [allowedIds]);

  // ETP-5395 Point 1 Fix B — must run BEFORE filterMenuGroupsByAccess and the
  // NoAccessScreen size-check below: id-less menu items (no
  // windowId/processId/obuiappProcessId — e.g. "first-steps", "dashboard")
  // are never filtered by filterMenuGroupsByAccess regardless of the Set
  // passed in, so gating only from the size-check below would still let
  // <Outlet> mount and those routes become reachable while the real Set is
  // in flight. See AppLayoutLoading's JSDoc above for the full story.
  if (allowedIds === undefined) {
    return <AppLayoutLoading data-testid="AppLayoutLoading__488148" />;
  }

  // ETP-5443 follow-up — a commercial cut-off (demo trial expired / subscription grace
  // elapsed) makes com.etendoerp.go answer 402 to every NEO request, which the
  // windowaccessmap fetch above folds into the SAME confirmed-empty-Set shape the
  // NoAccessScreen check below reacts to (see lib/environmentAccessGate.js for the full
  // detection story). `/account` and `/upgrade` stay reachable while blocked — both
  // resolve through the account's platform token, independent of this blocked tenant
  // session — so both the blocked screen AND the (otherwise correct, but wrong-reason in
  // this case) NoAccessScreen below are skipped on either path, letting the normal Outlet
  // render instead.
  const isEnvironmentGateExempt = environmentAccessDecision && isEnvironmentGateExemptPath(location.pathname);

  if (environmentAccessDecision && !isEnvironmentGateExempt) {
    return (
      <BlockedAccessScreen
        decision={environmentAccessDecision}
        data-testid="BlockedAccessScreen__488148" />
    );
  }

  // allowedIds is now either a resolved Set or `null` (unauthenticated /
  // fetch failure, fail-open per useRoleMenu.js) — never pass a stand-in
  // Set to filterMenuGroupsByAccess() below.
  const filteredMenuGroups = filterMenuGroupsByAccess(
    menuGroups,
    allowedIds,
    capabilities,
    windowAccess,
    firstStepsDismissed,
    reportAccess
  );

  // ETP-4514: a confirmed (not loading, not fail-open-null) empty Set means
  // the current role — or the lack of one — grants zero window/process
  // access. Render the blocking screen in place of the sidebar/Outlet entirely
  // so no menu item or direct route is reachable, per the "no menu/windows
  // reachable" acceptance criterion. Skipped on the exempt path above: there the empty Set
  // is itself a side effect of the environment block (windowaccessmap/listmenu both 402),
  // not evidence of a genuinely zero-access role.
  if (allowedIds instanceof Set && allowedIds.size === 0 && !isEnvironmentGateExempt) {
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
