import { Card, CardContent } from '@/components/ui/card';
import { useUI } from '@/i18n';
import { resolveRoleDisplayName, ADMIN_NAME_I18N_KEY } from '@/lib/roleNameI18n.js';

/**
 * ETP-4907 — one of the 5 summary cards atop the "Configuración > Roles"
 * overview: role icon + name, and a headline line below. Role name resolution
 * reuses `roleNameI18n.js` exactly like the pre-ETP-4907 version of
 * `RolesOverviewPage.jsx` did (the admin role is identified via
 * `role.isClientAdmin`, never its literal name, since that name varies per
 * tenant) — so e.g. the Finance role always reads "Finanzas" here too,
 * consistent with the rest of the app, even though the ETP-4907 reference
 * screenshot itself labels that card "Financiero".
 *
 * **ETP-4999 — window count removed entirely.** A prior pass demoted the
 * window count from headline to a small top-right badge (QA feedback that the
 * user count should be the headline). The Figma spec then dropped it from
 * this card altogether — the card now shows only role icon + name + user
 * count, nothing else; `role.windowCount` is no longer read here at all.
 */
export default function RoleSummaryCard({ role, Icon }) {
  const ui = useUI();
  const displayName = role.isClientAdmin ? ui(ADMIN_NAME_I18N_KEY) : resolveRoleDisplayName(ui, role.name);

  return (
    <Card data-testid={`RoleSummaryCard__${role.id}`}>
      <CardContent className="p-3" data-testid={`RoleSummaryCard__content-${role.id}`}>
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <Icon
              className="h-4 w-4 shrink-0 text-muted-foreground"
              data-testid={`RoleSummaryCard__icon-${role.id}`}
            />
          )}
          <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
        </div>
        <p
          className="mt-2.5 text-xl font-semibold text-foreground"
          data-testid={`RoleSummaryCard__userCount-${role.id}`}
        >
          {ui('rolesUserCount', { count: role.userCount })}
        </p>
      </CardContent>
    </Card>
  );
}
