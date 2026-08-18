import { Fragment } from 'react';
import { useUI, useMenuLabel } from '@/i18n';
import { resolveRoleDisplayName, ADMIN_NAME_I18N_KEY } from '@/lib/roleNameI18n.js';
import AccessTierPill from '@/components/AccessTierPill.jsx';
import { buildRowKey } from './useRolesOverviewData.js';

/**
 * ETP-4907 — the full-width window x role access matrix below the summary
 * cards on "Configuración > Roles". Rows are grouped by category (`General`,
 * `Comercial`/Commercial, `Ventas`/Sales, `Inventario`/Inventory, ...),
 * translated via `useMenuLabel()` against the SAME literal English section
 * names `menu.json`'s groups already use (`Commercial`/`Sales`/`Inventory`/
 * `General`) — no new i18n keys needed for categories, they already resolve
 * correctly in both locales.
 *
 * Each row's React key AND `data-testid` use `buildRowKey(category, windowId)`
 * (`${category}::${windowId}`) — the backend's real per-window `id`, not its
 * translatable `name`. The real data has a legitimate duplicate-window-NAME
 * case ("Contactos" appears in both `Comercial` and `Inventario` with
 * different access per role), but the backend already disambiguates those as
 * two separate entries with their own `id` — keying by id sidesteps the
 * collision entirely rather than needing a name-based composite key. See
 * `useRolesOverviewData.js`'s `buildRowKey` JSDoc for the full rationale.
 * Each row's window name is translated via `useMenuLabel()`, same convention
 * as every other real-AD-window-name display in this app (e.g. the pre-
 * ETP-4907 version of this page's window chips).
 */
export default function RolesAccessMatrix({ cards, matrix, iconFor }) {
  const ui = useUI();
  const tMenu = useMenuLabel();

  return (
    <div className="overflow-x-auto" data-testid="RolesAccessMatrix">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="py-2.5 pr-4 text-left text-sm font-semibold text-foreground">
              {ui('rolesMatrixWindowColumn')}
            </th>
            {cards.map((role) => {
              const Icon = iconFor?.(role);
              const displayName = role.isClientAdmin
                ? ui(ADMIN_NAME_I18N_KEY)
                : resolveRoleDisplayName(ui, role.name);
              return (
                <th key={role.id} className="py-2.5 px-3 text-center text-sm font-semibold text-foreground">
                  <span className="inline-flex items-center justify-center gap-1.5">
                    {Icon && (
                      <Icon className="h-3.5 w-3.5" data-testid={`RolesAccessMatrix__headerIcon-${role.id}`} />
                    )}
                    {displayName}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {matrix.map((group) => (
            <Fragment key={group.category}>
              <tr className="bg-muted/30" data-testid={`RolesAccessMatrix__category-${group.category}`}>
                <th
                  colSpan={cards.length + 1}
                  className="py-1.5 pr-4 text-left text-xs font-medium text-muted-foreground"
                >
                  {tMenu(group.category)}
                </th>
              </tr>
              {group.rows.map((row) => {
                const rowKey = buildRowKey(group.category, row.windowId);
                return (
                  <tr key={rowKey} data-testid={`RolesAccessMatrix__row-${rowKey}`}>
                    <td className="py-2.5 pr-4 text-foreground">{tMenu(row.windowName)}</td>
                    {cards.map((role) => (
                      <td key={role.id} className="py-2.5 px-3 text-center">
                        <AccessTierPill
                          tier={row.access?.[role.id] ?? 'none'}
                          data-testid={`RolesAccessMatrix__cell-${rowKey}-${role.id}`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
