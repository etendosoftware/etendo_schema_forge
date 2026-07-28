import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, RefreshCw, ShieldAlert } from 'lucide-react';
import { useUI, useMenuLabel } from '@/i18n';
import { fetchRolesOverview } from '@/lib/rolesApi.js';
import { ROLE_NAME_I18N_KEYS, ADMIN_NAME_I18N_KEY } from '@/lib/roleNameI18n.js';

/**
 * Shared centered "status" card wrapper for the error and no-access states below — both were
 * a near-identical `<Card><CardContent className="flex flex-col items-center justify-center
 * ... text-center">...</CardContent></Card>` shell that only differed in gap/padding and inner
 * content, which is exactly the kind of same-file duplication SonarQube's CPD flags. Callers
 * keep full control of their inner markup (icon, title, message, actions) and their own
 * `data-testid` on the outer `Card` — this only owns the repeated wrapper classes.
 */
function StatusCard({ testId, className, children }) {
  return (
    <Card data-testid={testId}>
      <CardContent
        className={`flex flex-col items-center justify-center text-center ${className}`}
        data-testid="CardContent__67e3bc">
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * ETP-4513 — the tenant's 4 fixed non-admin roles: NAME -> {nameKey, descKey}. Matched by the
 * role's own NAME (consistent across every tenant, since `OnboardingRoleProvisioningService` /
 * `R16-tenant-roles-and-webhook-access.sql` clone these 4 names verbatim onto every client), NOT
 * by a hardcoded per-client role id — a hardcoded-GOClient-id map is exactly the bug fixed
 * 2026-07-27 (see `SFRolesOverview.java`'s class javadoc for the live RolesPresa symptom: every
 * OTHER tenant's admin saw GOClient's role names with empty user counts/windows). The 5th role
 * (client-admin) is NOT in this map — its NAME varies per tenant ("RolesPresa Admin" vs
 * "GOClient Admin" vs any future tenant's own), so it's identified by the backend's
 * `isClientAdmin` flag instead and always rendered with the generic `roleNameAdmin`/
 * `roleDescAdmin` copy, never its literal AD_Role.name.
 *
 * The backend's `rawDescription` (raw `AD_Role.description`) is explicitly NOT display copy
 * (boilerplate "do not edit this role" text for 4 of the 5 roles today — see
 * `SFRolesOverview.java`'s class javadoc). These curated, i18n-keyed descriptions are what
 * actually renders; `rawDescription` is only used as a last-resort fallback for a role this map
 * doesn't recognize (a name Etendo Go doesn't know about, which should never happen for the 4
 * fixed roles, but keeps the page from showing a blank description if that ever changes).
 */
const ROLE_DESC_I18N_KEYS = {
  Finance: 'roleDescFinance',
  Sales: 'roleDescSales',
  Purchasing: 'roleDescPurchasing',
  Inventory: 'roleDescInventory',
};

const ROLE_NAME_I18N = Object.fromEntries(
  Object.entries(ROLE_NAME_I18N_KEYS).map(([name, nameKey]) => (
    [name, { nameKey, descKey: ROLE_DESC_I18N_KEYS[name] }]
  ))
);

/** Generic copy for the client-admin role, identified by `role.isClientAdmin`, never its name. */
const ADMIN_I18N = { nameKey: ADMIN_NAME_I18N_KEY, descKey: 'roleDescAdmin' };

/**
 * Read-only "Configuración > Roles" page (ETP-4513). Lists the tenant's 5 fixed roles with a
 * curated description, assigned-user count, and the Etendo GO windows each role can reach
 * (from `GET /sws/neo/rolesoverview`). No create/edit/delete actions anywhere — these 5
 * roles are product-defined and not editable by any tenant user; only future user-created
 * roles (out of scope for now) will ever be editable here.
 *
 * The menu entry that routes here is itself gated by the `isAdminOrClientAdmin` capability
 * (`SFWindowAccessMap`, see `menu.json`'s `roles` entry and `registry.js`'s
 * `filterMenuGroupsByAccess`) — a non-admin role should never reach this route through normal
 * navigation. The empty-state handling below (`roles.length === 0`) is a defense-in-depth
 * fallback for direct navigation / a stale menu, not the primary access control: the backend
 * (`SFRolesOverview.java`) is the actual enforcement point and always returns `{ roles: [] }`
 * for a non-admin/no-role caller regardless of how the request reached it.
 */
export default function RolesOverviewPage() {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchRolesOverview()
      .then((data) => setRoles(Array.isArray(data?.roles) ? data.roles : []))
      .catch((err) => setError(err?.message || String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6" data-testid="RolesOverviewPage">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{ui('rolesPageTitle')}</h2>
          <p className="text-muted-foreground">{ui('rolesPageSubtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={load}
          disabled={loading}
          data-testid="RolesOverviewPage__refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} data-testid="RefreshCw__rolesOverview" />
        </Button>
      </div>
      {(() => {
        if (loading) {
          return (
            <div className="space-y-3" data-testid="RolesOverviewPage__loading">
              <Skeleton className="h-24 w-full" data-testid="Skeleton__rolesOverview" />
              <Skeleton className="h-24 w-full" data-testid="Skeleton__rolesOverview" />
              <Skeleton className="h-24 w-full" data-testid="Skeleton__rolesOverview" />
            </div>
          );
        }

        if (error) {
          return (
            <StatusCard
              testId="RolesOverviewPage__error"
              className="gap-3 py-12"
              data-testid="StatusCard__67e3bc">
              <p className="text-sm text-muted-foreground">{ui('rolesLoadError')}</p>
              <Button variant="outline" onClick={load} data-testid="RolesOverviewPage__retry">
                {ui('retry')}
              </Button>
            </StatusCard>
          );
        }

        if (roles.length === 0) {
          return (
            <StatusCard
              testId="RolesOverviewPage__noAccess"
              className="gap-2 py-16"
              data-testid="StatusCard__67e3bc">
              <ShieldAlert className="h-10 w-10 text-muted-foreground/40 mb-2" data-testid="ShieldAlert__rolesOverview" />
              <h3 className="text-lg font-medium text-foreground">{ui('rolesNoAccessTitle')}</h3>
              <p className="text-sm text-muted-foreground">{ui('rolesNoAccessMessage')}</p>
            </StatusCard>
          );
        }

        return (
          <div className="space-y-4" data-testid="RolesOverviewPage__list">
            {roles.map((role) => {
              const i18nKeys = role.isClientAdmin ? ADMIN_I18N : ROLE_NAME_I18N[role.name];
              const displayName = i18nKeys ? ui(i18nKeys.nameKey) : role.name;
              const displayDescription = i18nKeys ? ui(i18nKeys.descKey) : role.rawDescription;
              const windows = Array.isArray(role.windows) ? role.windows : [];

              return (
                <Card key={role.id} data-testid={`RolesOverviewPage__role-${role.id}`}>
                  <CardHeader
                    className="flex flex-row items-start justify-between gap-4 space-y-0"
                    data-testid="CardHeader__67e3bc">
                    <div>
                      <CardTitle data-testid="CardTitle__67e3bc">{displayName}</CardTitle>
                      <CardDescription data-testid="CardDescription__67e3bc">{displayDescription}</CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge
                        variant="secondary"
                        title={ui('rolesColUsers')}
                        data-testid={`RolesOverviewPage__userCount-${role.id}`}>
                        <Users className="mr-1 h-3 w-3" data-testid="Users__rolesOverview" />
                        {role.userCount}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent data-testid="CardContent__67e3bc">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{ui('rolesColWindows')}</p>
                    <div className="flex flex-wrap gap-1.5" data-testid={`RolesOverviewPage__windows-${role.id}`}>
                      {windows.length === 0 && (
                        <span className="text-xs text-muted-foreground">{'—'}</span>
                      )}
                      {windows.map((w) => (
                        <Badge
                          key={w.id}
                          variant={w.tier === 'full' ? 'default' : 'outline'}
                          title={w.tier === 'full' ? ui('accessTierFull') : ui('accessTierReadOnly')}
                          data-testid={`RolesOverviewPage__window-${role.id}-${w.id}`}
                        >
                          {tMenu(w.name)}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
