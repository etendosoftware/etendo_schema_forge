import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert } from 'lucide-react';
import { useUI, useMenuLabel } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import StatusCard from '@/components/StatusCard.jsx';
import { useRolesOverviewData, ROLE_ICONS, resolveRoleKind } from './roles/useRolesOverviewData.js';
import RoleSummaryCard from './roles/RoleSummaryCard.jsx';
import RolesAccessMatrix from './roles/RolesAccessMatrix.jsx';

/**
 * "Configuración > Roles" overview page (ETP-4513, redesigned by ETP-4907 to match
 * a new reference layout): 5 role summary cards (icon, name, user-count badge, window
 * count) followed by a full window x role access matrix grouped by category, each cell
 * tri-state (full access / read-only / no access). ETP-5402 adds an "Informes" (reports)
 * subsection nested inside each relevant category's block of `RolesAccessMatrix` — see
 * that component's own JSDoc. Data comes from
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
  const { loading, error, cards, matrix, reportsMatrix, reload } = useRolesOverviewData();

  useSetPageMeta({
    title: ui('rolesPageTitle'),
    breadcrumb: `${tMenu('Settings')} / ${ui('rolesPageTitle')}`,
  });

  return (
    <div className="h-full overflow-y-auto px-6 pb-6" data-testid="RolesOverviewPage">
      {/* ETP-5402 split-out sticky-header fix — `pt-6` moved from the scroll container
          above (was `p-6`) onto this NON-scrolling-container child instead. `position:
          sticky` computes its offset against the nearest scrolling ancestor's PADDING
          edge, but `overflow: auto` clips at that same ancestor's BORDER edge — so a
          `padding-top` living on the scroll container itself opens a gap between "where
          the browser clips" and "where sticky pins to", and that gap scrolls WITH the
          content (CSS overflow spec: a scroll container's own padding is part of its
          scrollable overflow region). The result: whatever row is mid-scroll bleeds
          through in that gap, over/under the "stuck" `<thead>`, at every scroll position
          — looking exactly like the header reordering below a body row, though the
          header's `top: 0` offset is geometrically correct the whole time (verified via
          `getBoundingClientRect()` live). `UserRolesTab.jsx`'s own scroll ancestor (a
          `DetailView.jsx` column) has zero top padding, which is why its sticky `<thead>`
          never showed this. Moving the top padding onto scrolled CONTENT instead of the
          scroll container's own box removes the gap entirely. */}
      <div className="pt-6 space-y-6">
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
              reportsMatrix={reportsMatrix}
              iconFor={(role) => ROLE_ICONS[resolveRoleKind(role)]}
              data-testid="RolesAccessMatrix__67e3bc" />
          </div>
        );
      })()}
      </div>
    </div>
  );
}
