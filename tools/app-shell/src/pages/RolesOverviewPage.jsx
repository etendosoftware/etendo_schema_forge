import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert } from 'lucide-react';
import { useUI, useMenuLabel } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useRolesOverviewData, ROLE_ICONS, resolveRoleKind } from './roles/useRolesOverviewData.js';
import RoleSummaryCard from './roles/RoleSummaryCard.jsx';
import RolesAccessMatrix from './roles/RolesAccessMatrix.jsx';

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
 * "Configuración > Roles" overview page (ETP-4513, redesigned by ETP-4907 to match
 * a new reference layout): 5 role summary cards (icon, name, user-count badge, window
 * count) followed by a full window x role access matrix grouped by category, each cell
 * tri-state (full access / read-only / no access). Data comes from
 * `useRolesOverviewData()` (`./roles/useRolesOverviewData.js`), which calls the real
 * `GET /sws/neo/rolesoverview` (`lib/rolesApi.js`'s `fetchRolesOverview()`, unchanged
 * since ETP-4513) and adapts its response into this page's card/matrix shape. This is a
 * hand-built standalone page (no `decisions.json`/pipeline artifact), routed via
 * `runtime-routes.jsx`'s `lazyRoute('roles', RolesOverviewPage)` and gated in `menu.json`
 * by the `isAdminOrClientAdmin` capability — see `registry.js`'s `filterMenuGroupsByAccess`.
 *
 * The empty-state handling below (`cards.length === 0`) is a defense-in-depth fallback for
 * direct navigation / a stale menu, not the primary access control — `SFRolesOverview.java`
 * is the actual enforcement point and always returns an empty `roles`/`matrix` payload for a
 * non-admin/no-role caller regardless of how the request reached it.
 */
export default function RolesOverviewPage() {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { loading, error, cards, matrix, reload } = useRolesOverviewData();

  useSetPageMeta({
    title: ui('rolesPageTitle'),
    breadcrumb: `${tMenu('Settings')} / ${ui('rolesPageTitle')}`,
  });

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6" data-testid="RolesOverviewPage">
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
              <Button variant="outline" onClick={reload} data-testid="RolesOverviewPage__retry">
                {ui('retry')}
              </Button>
            </StatusCard>
          );
        }

        if (cards.length === 0) {
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
          <div className="space-y-6" data-testid="RolesOverviewPage__content">
            <div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
              data-testid="RolesOverviewPage__cards"
            >
              {cards.map((role) => (
                <RoleSummaryCard
                  key={role.id}
                  role={role}
                  Icon={ROLE_ICONS[resolveRoleKind(role)]}
                  data-testid={`RoleSummaryCard__wrapper-${role.id}`} />
              ))}
            </div>
            <RolesAccessMatrix
              cards={cards}
              matrix={matrix}
              iconFor={(role) => ROLE_ICONS[resolveRoleKind(role)]}
              data-testid="RolesAccessMatrix__67e3bc" />
          </div>
        );
      })()}
    </div>
  );
}
