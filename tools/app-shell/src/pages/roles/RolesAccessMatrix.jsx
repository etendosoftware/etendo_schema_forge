import { Fragment } from 'react';
import { useUI, useMenuLabel } from '@/i18n';
import { resolveRoleDisplayName, ADMIN_NAME_I18N_KEY } from '@/lib/roleNameI18n.js';
import AccessTierPill from '@/components/AccessTierPill.jsx';
import { buildRowKey } from './useRolesOverviewData.js';

/**
 * ETP-4907 — the full-width window x role access matrix below the summary
 * cards on "Configuración > Roles". Rows are grouped by category (`Comercial`/
 * Commercial, `Ventas`/Sales, `Inventario`/Inventory, ... from
 * `matrix.categories`, ETP-5071 category/name-corrected against `menu.json` —
 * see `useRolesOverviewData.js`'s `adaptMatrix`/`buildMenuWindowIndex`),
 * translated via `useMenuLabel()` against the SAME literal English group
 * names `menu.json` already uses (`Commercial`/`Sales`/`Inventory`/...) — no
 * new i18n keys needed for the category HEADERS, they already resolve
 * correctly in both locales.
 *
 * ETP-5071 — the 3 hardcoded "General" rows (Inicio/Dashboard, Favoritos,
 * Copilot) that used to be overlaid ahead of the real matrix were removed:
 * none of the 3 is a real AD window (they're generic app-shell routes, not
 * `ETGO_SF_SPEC`-backed) and they never appeared in the backend's own
 * `matrix.categories` — the overlay was misleading extra rows, not real data.
 * The i18n keys it used (`userRolesTabDashboardRow`/`userRolesTabFavoritesRow`/
 * `userRolesTabCopilotRow`) have since been removed from the locale files too:
 * ETP-5196 removed `UserRolesTab.jsx`'s own separate `GENERAL_ROWS` overlay
 * (which shared those same keys), leaving them unused everywhere.
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
 *
 * **ETP-5402 — "Informes" subsection.** `reportsMatrix` (same `[{category, rows}]`
 * shape as `matrix`, from `useRolesOverviewData()`'s new `adaptReportsMatrix`) is
 * rendered NESTED inside each category block, right after that category's real
 * window rows, behind a small "Informes" sub-header row — the ticket's ask is a
 * per-relevant-category subsection, not a 6th standalone top-level section. A
 * category present only in `reportsMatrix` (none today, but not assumed to stay
 * that way) still gets its own full category block, Informes rows included.
 * Row keys are suffixed `--informes` (see `reportRowKey`) so a report id can
 * never collide with a real window id sharing the same category, even though in
 * practice the two id-spaces never overlap (see `SFRolesOverview.java`'s
 * `ReportRow` javadoc).
 */
function reportRowKey(category, reportId) {
  return `${buildRowKey(category, reportId)}--informes`;
}

export default function RolesAccessMatrix({ cards, matrix, reportsMatrix, iconFor }) {
  const ui = useUI();
  const tMenu = useMenuLabel();

  // Union of both matrices' categories, `matrix`'s own order first (it already
  // reflects the real sidebar order via `adaptMatrix`'s menu.json-driven sort),
  // then any category `reportsMatrix` introduces that `matrix` doesn't have.
  const windowGroupsByCategory = new Map(matrix.map((g) => [g.category, g]));
  const reportGroupsByCategory = new Map((reportsMatrix ?? []).map((g) => [g.category, g]));
  const categories = [
    ...matrix.map((g) => g.category),
    ...[...reportGroupsByCategory.keys()].filter((category) => !windowGroupsByCategory.has(category)),
  ];

  return (
    // ETP-5402 QA follow-up (round 2) — NO overflow class on this wrapper, matching
    // UserRolesTab.jsx's own table exactly. The previous `overflow-x-auto overflow-y-visible`
    // attempt was based on a misreading of the CSS overflow spec: per spec, an explicitly
    // authored `overflow-y: visible` does NOT opt out of the auto-correction that fires the
    // moment the OTHER axis is non-`visible` — the browser forces the COMPUTED value to `auto`
    // regardless of what was authored, specifically to prevent this exact "one clipped, one
    // not" state. So `overflow-x-auto overflow-y-visible` computed to the exact same thing as
    // `overflow-x-auto` alone, and the wrapper was STILL its own (content-sized, never
    // independently scrolling) sticky containing block — confirmed still broken live
    // (2026-09-22, second QA round). There is no CSS-only way to keep `overflow-x-auto` on this
    // element while making `sticky top-0` below resolve against RolesOverviewPage's outer
    // `overflow-y-auto` instead: dropping horizontal overflow handling here entirely is the
    // only fix that actually works, at the cost of the matrix overflowing the PAGE horizontally
    // on a very narrow viewport with many role columns — the same tradeoff UserRolesTab.jsx's
    // own table already accepts.
    <div data-testid="RolesAccessMatrix">
      <table className="w-full text-sm">
        {/* Sticky column headers, mirroring UserRolesTab.jsx's `<thead>` (same `sticky top-0
            z-10 bg-card` pattern) — see the wrapper's own comment above for why it has no
            overflow class of its own. */}
        <thead className="sticky top-0 z-10 bg-card">
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
          {categories.map((category) => {
            const windowRows = windowGroupsByCategory.get(category)?.rows ?? [];
            const reportRows = reportGroupsByCategory.get(category)?.rows ?? [];
            return (
              <Fragment key={category}>
                <tr className="bg-muted/30" data-testid={`RolesAccessMatrix__category-${category}`}>
                  <th
                    colSpan={cards.length + 1}
                    // scope="row" not "rowgroup": this <tbody> is shared across all categories
                    // (no per-group <tbody>), so "rowgroup" would wrongly associate this header
                    // with every later category's rows too — "row" is inert here (own <tr>) but
                    // still resolves the ARIA role to rowheader.
                    scope="row"
                    className="py-1.5 pr-4 text-left text-xs font-medium text-muted-foreground"
                  >
                    {tMenu(category)}
                  </th>
                </tr>
                {windowRows.map((row) => {
                  const rowKey = buildRowKey(category, row.windowId);
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
                {reportRows.length > 0 && (
                  <tr className="bg-muted/10" data-testid={`RolesAccessMatrix__informesHeader-${category}`}>
                    <th
                      colSpan={cards.length + 1}
                      scope="row"
                      className="py-1 pr-4 pl-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70"
                    >
                      {ui('rolesMatrixInformesHeader')}
                    </th>
                  </tr>
                )}
                {reportRows.map((row) => {
                  const rowKey = reportRowKey(category, row.windowId);
                  return (
                    <tr key={rowKey} data-testid={`RolesAccessMatrix__row-${rowKey}`}>
                      <td className="py-2.5 pr-4 pl-3 text-foreground">{tMenu(row.windowName)}</td>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
