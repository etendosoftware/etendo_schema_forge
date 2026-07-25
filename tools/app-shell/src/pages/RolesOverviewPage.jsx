import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Users, Pencil, RefreshCw, ShieldAlert } from 'lucide-react';
import { useUI } from '@/i18n';
import { fetchRolesOverview } from '@/lib/rolesApi.js';

/**
 * ETP-4513 — GOClient's 5 fixed roles: id -> {nameKey, descKey}. Mirrors the same 5 ids
 * hardcoded in `SFRolesOverview.java`'s `GOCLIENT_ROLE_IDS` and
 * `artifacts/user/decisions.json`'s `defaultRole.enumValues` — do not add/remove/reorder
 * entries here without updating those two in lockstep.
 *
 * The backend's `rawDescription` (raw `AD_Role.description`) is explicitly NOT display copy
 * (boilerplate "do not edit this role" text for 4 of the 5 roles today — see
 * `SFRolesOverview.java`'s class javadoc). These curated, i18n-keyed descriptions are what
 * actually renders; `rawDescription` is only used as a last-resort fallback for a role id this
 * map doesn't recognize (which should never happen for the 5 fixed GOClient roles, but keeps
 * the page from showing a blank description if the backend ever adds a 6th role before the
 * frontend catches up).
 */
const ROLE_I18N = {
  '9B8D736190724807AB256DC95F20EC5E': { nameKey: 'roleNameGoClientAdmin', descKey: 'roleDescGoClientAdmin' },
  '127AE77FE2994067B7FE6495FC21D51E': { nameKey: 'roleNameFinance', descKey: 'roleDescFinance' },
  '2A159DF4F4B944A6AA903202AD35B545': { nameKey: 'roleNameSales', descKey: 'roleDescSales' },
  'A826430F723E4C1B9A53EBB0746A98C0': { nameKey: 'roleNamePurchasing', descKey: 'roleDescPurchasing' },
  '55E05A4B43514A029D6FB6B8D94B49D4': { nameKey: 'roleNameInventory', descKey: 'roleDescInventory' },
};

/**
 * Read-only "Configuración > Roles" page (ETP-4513). Lists GOClient's 5 fixed roles with a
 * curated description, assigned-user count, and the Etendo GO windows each role can reach
 * (from `GET /webhooks/SFRolesOverview`). No create/delete actions anywhere; "Edit" only ever
 * opens a "coming soon" notice.
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
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingRole, setEditingRole] = useState(null);

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
    <div className="space-y-6 p-6" data-testid="RolesOverviewPage">
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
            <Card data-testid="RolesOverviewPage__error">
              <CardContent
                className="flex flex-col items-center justify-center gap-3 py-12 text-center"
                data-testid="CardContent__67e3bc">
                <p className="text-sm text-muted-foreground">{ui('rolesLoadError')}</p>
                <Button variant="outline" onClick={load} data-testid="RolesOverviewPage__retry">
                  {ui('retry')}
                </Button>
              </CardContent>
            </Card>
          );
        }

        if (roles.length === 0) {
          return (
            <Card data-testid="RolesOverviewPage__noAccess">
              <CardContent
                className="flex flex-col items-center justify-center gap-2 py-16 text-center"
                data-testid="CardContent__67e3bc">
                <ShieldAlert className="h-10 w-10 text-muted-foreground/40 mb-2" data-testid="ShieldAlert__rolesOverview" />
                <h3 className="text-lg font-medium text-foreground">{ui('rolesNoAccessTitle')}</h3>
                <p className="text-sm text-muted-foreground">{ui('rolesNoAccessMessage')}</p>
              </CardContent>
            </Card>
          );
        }

        return (
          <div className="space-y-4" data-testid="RolesOverviewPage__list">
            {roles.map((role) => {
              const i18nKeys = ROLE_I18N[role.id];
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
                      <Badge variant="secondary" data-testid={`RolesOverviewPage__userCount-${role.id}`}>
                        <Users className="mr-1 h-3 w-3" data-testid="Users__rolesOverview" />
                        {role.userCount}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingRole(role)}
                        data-testid={`RolesOverviewPage__edit-${role.id}`}
                      >
                        <Pencil className="h-4 w-4" data-testid="Pencil__rolesOverview" />
                      </Button>
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
                          {w.name}
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
      <Dialog
        open={!!editingRole}
        onOpenChange={(open) => {
          if (!open) setEditingRole(null);
        }}
        data-testid="Dialog__67e3bc">
        <DialogContent data-testid="RolesOverviewPage__editDialog">
          <DialogHeader data-testid="DialogHeader__67e3bc">
            <DialogTitle data-testid="DialogTitle__67e3bc">{ui('rolesEditComingSoonTitle')}</DialogTitle>
            <DialogDescription data-testid="DialogDescription__67e3bc">{ui('rolesEditComingSoonMessage')}</DialogDescription>
          </DialogHeader>
          <DialogFooter data-testid="DialogFooter__67e3bc">
            <Button onClick={() => setEditingRole(null)} data-testid="RolesOverviewPage__editDialogClose">
              {ui('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
