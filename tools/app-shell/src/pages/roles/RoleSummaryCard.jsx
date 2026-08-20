import { Card, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { useUI } from '@/i18n';
import { resolveRoleDisplayName, ADMIN_NAME_I18N_KEY } from '@/lib/roleNameI18n.js';

/**
 * ETP-4907 — one of the 5 summary cards atop the "Configuración > Roles"
 * overview: role icon + name, a small user-count badge top-right, and a large
 * "N Ventanas" line below. Role name resolution reuses `roleNameI18n.js`
 * exactly like the pre-ETP-4907 version of `RolesOverviewPage.jsx` did (the
 * admin role is identified via `role.isClientAdmin`, never its literal name,
 * since that name varies per tenant) — so e.g. the Finance role always reads
 * "Finanzas" here too, consistent with the rest of the app, even though the
 * ETP-4907 reference screenshot itself labels that card "Financiero".
 */
export default function RoleSummaryCard({ role, Icon }) {
  const ui = useUI();
  const displayName = role.isClientAdmin ? ui(ADMIN_NAME_I18N_KEY) : resolveRoleDisplayName(ui, role.name);

  return (
    <Card data-testid={`RoleSummaryCard__${role.id}`}>
      <CardContent className="p-4" data-testid={`RoleSummaryCard__content-${role.id}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && (
              <Icon
                className="h-4 w-4 shrink-0 text-muted-foreground"
                data-testid={`RoleSummaryCard__icon-${role.id}`}
              />
            )}
            <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            title={ui('rolesColUsers')}
            data-testid={`RoleSummaryCard__userCount-${role.id}`}
          >
            <Users className="h-3 w-3" data-testid={`RoleSummaryCard__usersIcon-${role.id}`} />
            {role.userCount}
          </span>
        </div>
        <p
          className="mt-3 text-2xl font-semibold text-foreground"
          data-testid={`RoleSummaryCard__windowCount-${role.id}`}
        >
          {ui('rolesWindowCount', { count: role.windowCount })}
        </p>
      </CardContent>
    </Card>
  );
}
