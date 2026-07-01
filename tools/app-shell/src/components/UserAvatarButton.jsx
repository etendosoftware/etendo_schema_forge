import { useState } from 'react';
import { ChevronRight, LogOut, User, Languages, KeyRound } from 'lucide-react';
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
import { ChangePasswordDialog } from './ChangePasswordDialog.jsx';

const PLATFORM_TOKEN_KEY = 'sf_platform_token';
const PLATFORM_AUTH_METHOD_KEY = 'sf_platform_auth_method';

const LOCALES = [
  { code: 'en_US', flag: '🇺🇸', label: 'English' },
  { code: 'es_ES', flag: '🇪🇸', label: 'Español' },
];

/**
 * Button that opens a small user menu with identity details and logout.
 * - Default (compact): avatar circle with the username initial.
 * - expanded=true: full row with user icon + username + chevron (for sidebar footer).
 */
export function UserAvatarButton({ expanded = false }) {
  const { username, selectedRole, selectedOrg, logout } = useAuth();
  const ui = useUI();
  const { locale, setLocale } = useLocaleSwitch();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  // Change Password targets the platform account, so it's only offered when a
  // platform token is present (it provides the credential the endpoint rotates).
  // SSO sessions have no local password to change — the backend rejects them —
  // so the option is hidden when the session was obtained via an SSO provider.
  const canChangePassword =
    typeof window !== 'undefined' &&
    !!window.localStorage?.getItem(PLATFORM_TOKEN_KEY) &&
    window.localStorage?.getItem(PLATFORM_AUTH_METHOD_KEY) !== 'sso';

  // After a password change we log out; flag onboarding to land on Sign In
  // (not the Create panel) so the user re-authenticates with the new password.
  const handlePasswordChanged = () => {
    localStorage.setItem('sf_onboarding_initial_view', 'login');
    localStorage.setItem('sf_onboarding_notice', 'password-changed');
    logout();
  };

  const initial = username?.charAt(0).toUpperCase() || '?';
  const roleInitial = selectedRole?.name?.charAt(0).toUpperCase() || '';

  const trigger = expanded ? (
    <button
      type="button"
      aria-label={username || ui('account')}
      data-testid="topbar-user-menu"
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm rounded-md text-foreground hover:bg-muted/50 transition-colors"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <User className="h-4 w-4" data-testid="User__9f3744" />
      </span>
      <span className="flex-1 text-left truncate">{username || '—'}</span>
      <ChevronRight
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
      <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold bg-[#E8EAEF] text-foreground transition-colors">
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
    <>
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
                  <p className="truncate">{ui('role')}: {selectedRole.name}</p>
                )}
                {selectedOrg?.name && (
                  <p className="truncate">{ui('organization')}: {selectedOrg.name}</p>
                )}
              </div>
            )}
          </div>

          {setLocale && (
            <>
              <div className="px-2 pt-2 pb-1">
                <p className="flex items-center gap-1.5 px-2 pb-1 text-xs font-medium text-muted-foreground">
                  <Languages className="h-3.5 w-3.5" data-testid="Languages__9f3744" />
                  {ui('language')}
                </p>
                {LOCALES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLocale(l.code)}
                    data-testid={`user-menu-language-${l.code}`}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                      locale === l.code
                        ? 'bg-muted font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <span className="text-sm leading-none">{l.flag}</span>
                    {l.label}
                  </button>
                ))}
              </div>
              <DropdownMenuSeparator data-testid="DropdownMenuSeparator__9f3744" />
            </>
          )}

          <div className="px-2 py-2">
            {canChangePassword && (
              <DropdownMenuItem
                onSelect={() => setChangePasswordOpen(true)}
                data-testid="menu-change-password"
              >
                <KeyRound className="h-3.5 w-3.5 mr-2" data-testid="KeyRound__9f3744" />
                {ui('onboardingChangePasswordAction')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={logout}
              className="text-red-500 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20"
              data-testid="user-menu-logout">
              <LogOut className="h-3.5 w-3.5 mr-2" data-testid="LogOut__9f3744" />
              {ui('logout')}
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
        onSuccess={handlePasswordChanged}
        data-testid="ChangePasswordDialog__9f3744" />
    </>
  );
}
