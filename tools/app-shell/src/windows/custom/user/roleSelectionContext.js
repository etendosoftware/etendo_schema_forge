import { createContext, useContext } from 'react';

/**
 * ETP-4906 — shares the User form's LOCALLY-SELECTED template-role-id set between two
 * independent custom-component slots on the same generated page:
 *
 * - `AssignTemplateRolesControl` (the `window.headerExtra` / `formFooter` slot) — owns
 *   the chip-toggle UI, reads/writes the selection.
 * - `UserRolesTab` (the "Roles del usuario" custom tab, ETP-4906 Task F5) — reads the
 *   CURRENT (not-yet-saved) selection to render its live permission-matrix preview.
 * - `windows/custom/user/index.jsx` — the Provider, and the reader at save time
 *   (`onAfterExistingSave`'s `handleRoleAssignmentSave`).
 *
 * Only `AssignTemplateRolesControl` actually NEEDS this context. `formFooter`
 * (`buildHeaderFooter` in `DetailView.jsx`) instantiates its component with a hardcoded,
 * non-extensible prop list — `index.jsx` has no channel to hand it project-specific state
 * directly. `customTabs[].Component` (used by `UserRolesTab`, ETP-4906 Task F5) is
 * different: `DetailView`'s `renderCustomTabPanels` spreads `{...(ct.props || {})}` onto
 * the tab component (see that function), so `index.jsx` CAN thread `selectedRoleIds` to
 * `UserRolesTab` as a plain prop via its own `customTabs` override — and does, since that
 * is the interface `UserRolesTab.jsx` was already written against. This context exists
 * only to reach the one slot that has no such prop-override mechanism.
 *
 * Deliberately NOT used for the roles CATALOG (the 4 non-admin template roles from
 * `fetchRolesOverview()`) — each consumer fetches that itself. Sharing only the
 * selection (not the catalog fetch) keeps this module tiny; a duplicate
 * `fetchRolesOverview()` call is an explicitly accepted tradeoff per this ticket's plan.
 */
const RoleSelectionContext = createContext(null);

export const RoleSelectionProvider = RoleSelectionContext.Provider;

/**
 * @returns {{selectedRoleIds: string[], setSelectedRoleIds: (ids: string[]) => void}}
 *   Falls back to an inert, local-only pair when rendered without a
 *   `RoleSelectionProvider` ancestor (e.g. a unit test mounting the component in
 *   isolation) — never throws, so tests don't need to wrap every render in the provider
 *   just to exercise unrelated behavior.
 */
export function useRoleSelection() {
  const ctx = useContext(RoleSelectionContext);
  return ctx ?? { selectedRoleIds: [], setSelectedRoleIds: () => {} };
}
