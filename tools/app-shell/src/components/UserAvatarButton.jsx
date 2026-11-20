import { useNavigate } from 'react-router-dom';
import { BuildingsIcon, CaretRightIcon, CookieIcon, RocketLaunchIcon, SignOutIcon, UserIcon } from '@phosphor-icons/react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI } from '@/i18n';
import { useLocaleSwitch } from '@/i18n/index.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';
import { useLogout } from '@/auth/useLogout.js';
import { useFeatureFlag, MY_COMPANIES_PAGE } from '@/lib/flags';
import { ADMIN_NAME_I18N_KEY, resolveRoleDisplayName } from '@/lib/roleNameI18n.js';
import { useSupportSession } from '@/hooks/useSupportSession.js';
import { LanguageMenuSection } from '@/components/LanguageMenuSection.jsx';
import { isGtmInstalled, showCookieBanner } from '@/lib/marketing/gtm.js';


/**
 * Button that opens a small user menu with identity details and logout.
 * - Default (compact): avatar circle with the username initial.
 * - expanded=true: full row with user icon + username + chevron (for sidebar footer).
 */
export function UserAvatarButton({ expanded = false }) {
  const { username, selectedRole, selectedOrg } = useAuth();
  const logout = useLogout();
  const ui = useUI();
  const navigate = useNavigate();
  const { locale, setLocale } = useLocaleSwitch();
  // ETP-5351 — the plan and the account (password, sign-in methods, email, subscription) belong to
  // the customer; a support session leaves them alone, and its routes redirect home anyway.
  const { isSupportMode } = useSupportSession();
  // ETP-5734 — gates the entry only; `/companies` is registered unconditionally.
  const myCompaniesEnabled = useFeatureFlag(MY_COMPANIES_PAGE);
  // ETP-5115: the menu used to decide whether to offer "change password" by reading a value
  // stashed in localStorage at login, which is why an SSO account saw no such option at all — not
  // disabled with a reason, simply absent. The account screen asks the server what the account
  // actually has, so the guess is gone and the entry is unconditional.

  const initial = username?.charAt(0).toUpperCase() || '?';
  // ETP-5329: role label precedence, highest first:
  //   1. selectedRole.isClientAdmin -> the localized generic admin label (ADMIN_NAME_I18N_KEY),
  //      exactly what Settings > Users shows. A tenant admin's default role IS the client-admin
  //      AD_Role: it has no composed templates (so no effectiveRoleNames) and its raw name is
  //      tenant-specific ("<Company> Admin"), which used to leak into this menu (QA CP-6/CP-7).
  //   2. effectiveRoleNames -> the composed template role names (backend-resolved from the
  //      personal role's AD_Role_Inheritance), each translated via the shared roleNameI18n map
  //      (same mechanism as the "Roles" chips: RoleChipsCell, UserRolesTab, RoleSummaryCard...)
  //      so e.g. "Sales" renders as "Ventas" in es_ES, joined with '-'.
  //   3. selectedRole.name, untranslated — a legitimate state (rolling deploy, or a personal
  //      role with zero composed templates yet), not an error.
  const isClientAdmin = selectedRole?.isClientAdmin === true;
  const adminLabel = isClientAdmin ? ui(ADMIN_NAME_I18N_KEY) : null;
  let roleDisplay = selectedRole?.name;
  if (isClientAdmin) {
    roleDisplay = adminLabel;
  } else if (selectedRole?.effectiveRoleNames?.length) {
    roleDisplay = selectedRole.effectiveRoleNames
      .map((name) => resolveRoleDisplayName(ui, name))
      .join('-');
  }
  // The avatar badge initial follows the raw role name, except for the client admin, whose raw
  // name starts with the tenant's company name — it takes the admin label's initial instead
  // ("A"dministrator / "A"dministrador). The personal-role case deliberately keeps the raw-name
  // initial rather than the first composed role's.
  const roleInitial = (adminLabel || selectedRole?.name)?.charAt(0).toUpperCase() || '';

  const trigger = expanded ? (
    <button
      type="button"
      aria-label={username || ui('account')}
      data-testid="topbar-user-menu"
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm rounded-md text-foreground hover:bg-muted/50 transition-colors"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UserIcon className="h-4 w-4" data-testid="User__9f3744" />
      </span>
      <span className="flex-1 text-left truncate">{username || '—'}</span>
      <CaretRightIcon
        className="h-4 w-4 shrink-0 text-muted-foreground"
        data-testid="ChevronRight__9f3744" />
    </button>
  ) : (
    <button
      type="button"
      aria-label={username || ui('account')}
      data-testid="topbar-user-menu"
      className="relative h-10 w-10 flex items-center justify-center rounded-lg bg-page-bg text-muted-foreground hover:text-foreground transition-colors"
      title={username}
    >
      <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold bg-[hsl(var(--border-subtle))] text-foreground transition-colors">
        {initial}
      </div>
      {roleInitial && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-muted text-[8px] font-bold text-muted-foreground ring-1 ring-background">
          {roleInitial}
        </span>
      )}
    </button>
  );

  return (
    <DropdownMenu data-testid="DropdownMenu__9f3744">
      <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__9f3744">
        {expanded ? (
          <div className="w-full">{trigger}</div>
        ) : (
          trigger
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={12}
        className="w-56"
        data-testid="DropdownMenuContent__9f3744">
        <div className="border-b px-4 py-3">
          <p className="truncate text-sm font-semibold">{username || '—'}</p>
          {(selectedRole?.name || selectedOrg?.name) && (
            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {selectedRole?.name && (
                <p className="break-words" title={roleDisplay}>{ui('role')}: {roleDisplay}</p>
              )}
              {selectedOrg?.name && (
                <p className="truncate" title={selectedOrg.name}>{ui('organization')}: {selectedOrg.name}</p>
              )}
            </div>
          )}
        </div>

        {setLocale && (
          <>
            <LanguageMenuSection
              locale={locale}
              setLocale={setLocale}
              data-testid="LanguageMenuSection__9f3744" />
            <DropdownMenuSeparator data-testid="DropdownMenuSeparator__9f3744" />
          </>
        )}

        <div className="px-2 py-2">
          {!isSupportMode && (
            <>
              <DropdownMenuItem
                onSelect={() => navigate('/upgrade')}
                data-testid="menu-tenant-upgrade"
              >
                <RocketLaunchIcon className="h-3.5 w-3.5 mr-2" data-testid="Rocket__9f3744" />
                {ui('upgradeMenuAction')}
              </DropdownMenuItem>
              {myCompaniesEnabled && (
                <DropdownMenuItem
                  onSelect={() => navigate('/companies')}
                  data-testid="menu-my-companies"
                >
                  <BuildingsIcon className="h-3.5 w-3.5 mr-2" data-testid="Building2__menu-my-companies" />
                  {ui('myCompaniesMenuAction')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => navigate('/account')}
                data-testid="menu-account"
              >
                <UserIcon className="h-3.5 w-3.5 mr-2" data-testid="User__menu-account" />
                {ui('account')}
              </DropdownMenuItem>
            </>
          )}
          {/* ETP-6363 — reopens HubSpot's cookie banner (loaded by GTM), so the choice can be
              changed. Only where GTM is loaded: elsewhere there is no banner to reopen. */}
          {isGtmInstalled() && (
            <DropdownMenuItem
              onSelect={() => showCookieBanner()}
              data-testid="menu-cookie-settings"
            >
              <CookieIcon className="h-3.5 w-3.5 mr-2" data-testid="Cookie__menu-cookie-settings" />
              {ui('cookieSettings')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={logout}
            className="text-destructive focus:text-destructive focus:bg-destructive/10 dark:focus:bg-destructive/20"
            data-testid="user-menu-logout">
            <SignOutIcon className="h-3.5 w-3.5 mr-2" data-testid="LogOut__9f3744" />
            {ui('logout')}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
