import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { useUI } from '@/i18n';
import { resolveRoleDisplayName } from '@/lib/roleNameI18n.js';
import { fetchTemplateRoles, fetchRolesOverview } from '@/lib/rolesApi.js';
import { resolveDefaultRoleId } from './RoleChipsCell.jsx';
import { useRoleSelection } from './roleSelectionContext.js';

const MAX_COLLAPSED_CHIPS = 3;

/**
 * ETP-4906 — replaces `AssignRoleControl.jsx` (ETP-4512, single-role picker that wrote
 * `defaultRole` directly). This control composes 1+ system-level template roles
 * (Finance/Sales/Purchasing/Inventory) via chip toggles.
 *
 * Unlike the control it replaces, this NEVER calls `onChange('defaultRole', ...)` — role
 * composition is no longer a plain field write. Selection lives in the shared
 * `useRoleSelection()` context (see `roleSelectionContext.js` for why: `UserRolesTab`,
 * a sibling custom-tab slot, needs the same live selection for its permission-matrix
 * preview, and `windows/custom/user/index.jsx` needs to read it at save time to decide
 * whether to call `SFAssignUserRoles`). Persisting is `index.jsx`'s job
 * (`onAfterExistingSave`), fired exactly once by the normal Guardar click — this
 * component only ever mutates client-side state, matching the "zero extra network
 * calls per chip toggle" constraint.
 *
 * Existing-user only (per this ticket's Global Constraints — never attempt
 * `SFAssignUserRoles` before an `AD_User_ID` exists): renders a save-first placeholder
 * when `data?.id` is absent (a brand-new, not-yet-persisted user).
 */
export default function AssignTemplateRolesControl(props) {
  const { data, token, apiBaseUrl } = props;
  const ui = useUI();
  const { selectedRoleIds, setSelectedRoleIds } = useRoleSelection();

  const [roles, setRoles] = useState([]);
  const [adminRoleId, setAdminRoleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const containerRef = useRef(null);

  const hasPersistedUser = !!data?.id;

  // ETP-5019 — the owner/admin already has full access by construction: composing template
  // roles for a user CURRENTLY holding the client-admin "Admin" role would fail to find a
  // reusable personal role (Admin is explicitly excluded, see
  // `UserRoleCompositionService#isReusablePersonalRole`) and silently mint a brand-new one,
  // REPLACING `Default_Ad_Role_ID` and losing the Admin role as a side effect. The backend now
  // rejects this unconditionally (`UserRoleCompositionService#enforceOwnerProtection`) — this is
  // the UI-side guard so the control never even offers the (always-doomed) interaction. Same
  // "compare the row's own defaultRole id against SFRolesOverview's isClientAdmin row" pattern
  // `RoleChipsCell.jsx`'s `useUserRoleGridData`/admin branch already established for the grid.
  const currentDefaultRoleId = resolveDefaultRoleId(data);
  const isAdminRoleHolder = !!(adminRoleId && currentDefaultRoleId && currentDefaultRoleId === adminRoleId);

  useEffect(() => {
    if (!hasPersistedUser || !token || !apiBaseUrl) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchTemplateRoles(), fetchRolesOverview()])
      .then(([templateRes, overviewRes]) => {
        if (cancelled) return;
        // No isClientAdmin filter needed — SFSystemRoleTemplates never returns a client-admin
        // row at all (there is none at system level, see its class javadoc).
        setRoles(templateRes?.roles ?? []);
        // fetchRolesOverview() is kept ONLY for its tenant-scoped client-admin row (ETP-5019),
        // mirroring RoleChipsCell.jsx's useUserRoleGridData — never used to populate the
        // selectable template list itself (see fetchTemplateRoles()'s own docstring for why).
        const overviewRoles = Array.isArray(overviewRes?.roles) ? overviewRes.roles : [];
        const adminRole = overviewRoles.find((r) => r?.isClientAdmin === true) ?? null;
        setAdminRoleId(adminRole?.id != null ? String(adminRole.id) : null);
      })
      .catch(() => {
        if (!cancelled) {
          setRoles([]);
          setAdminRoleId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPersistedUser, token, apiBaseUrl]);

  // Collapse the expanded editor on outside click — mirrors any other inline
  // popover/dropdown in this codebase (click-away to close, no explicit "Done" button).
  useEffect(() => {
    if (!isEditing) return undefined;
    function handleClickAway(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsEditing(false);
      }
    }
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [isEditing]);

  const toggleExpanded = useCallback(() => {
    if (loading) return;
    setIsEditing((v) => !v);
  }, [loading]);

  const handleToggleKeyDown = useCallback((e) => {
    // Guard against bubbled keydowns from nested focusable elements (the chip
    // "remove" buttons, and the options-panel checkboxes once expanded) — this
    // handler lives on the OUTER `role="button"` container, and React's
    // onKeyDown follows normal DOM bubbling, so without this check pressing
    // Enter/Space to activate a nested control (e.g. removing a chip) would
    // also toggle THIS control's expand state and preventDefault() the nested
    // button's own native click synthesis, silently breaking keyboard removal.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded();
    }
  }, [toggleExpanded]);

  const toggleRole = useCallback((roleId) => {
    setSelectedRoleIds((current) => (
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]
    ));
  }, [setSelectedRoleIds]);

  const removeRole = useCallback((roleId, e) => {
    e.stopPropagation();
    setSelectedRoleIds((current) => current.filter((id) => id !== roleId));
  }, [setSelectedRoleIds]);

  if (!hasPersistedUser) {
    return (
      <div className="flex flex-col gap-2 w-full" data-testid="AssignTemplateRolesControl__save-first">
        <label className="text-sm font-medium text-foreground">{ui('assignedRolesLabel')}</label>
        <p className="text-sm text-muted-foreground">{ui('saveUserFirstForRoles')}</p>
      </div>
    );
  }

  // ETP-5019 — the owner/admin cannot compose additional roles at all; render a locked
  // placeholder instead of the interactive editor (structural UI block, on top of the
  // unconditional backend rejection — see the effect above and
  // UserRoleCompositionService#enforceOwnerProtection).
  if (isAdminRoleHolder) {
    return (
      <div className="flex flex-col gap-2 w-full" data-testid="AssignTemplateRolesControl__admin-locked">
        <label className="text-sm font-medium text-foreground">{ui('assignedRolesLabel')}</label>
        <p className="text-sm text-muted-foreground">{ui('adminRoleNoCompositionMessage')}</p>
      </div>
    );
  }

  const selectedRoles = roles.filter((r) => selectedRoleIds.includes(r.id));
  const visibleChips = selectedRoles.slice(0, MAX_COLLAPSED_CHIPS);
  const overflowCount = selectedRoles.length - visibleChips.length;

  return (
    <div className="flex flex-col gap-2 w-full" ref={containerRef} data-testid="AssignTemplateRolesControl">
      <label className="text-sm font-medium text-foreground">{ui('assignedRolesLabel')}</label>
      <div
        role="button"
        tabIndex={0}
        className="flex flex-wrap items-center gap-1.5 min-h-10 w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm cursor-pointer aria-disabled:cursor-not-allowed"
        onClick={toggleExpanded}
        onKeyDown={handleToggleKeyDown}
        aria-disabled={loading}
        data-testid="AssignTemplateRolesControl__toggle-expand"
      >
        {selectedRoles.length === 0 && (
          <span className="text-muted-foreground" data-testid="AssignTemplateRolesControl__empty">
            {ui('noRolesAssigned')}
          </span>
        )}
        {visibleChips.map((role) => (
          <span
            key={role.id}
            className="inline-flex items-center gap-1 rounded-md bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-medium"
            data-testid={`AssignTemplateRolesControl__chip-${role.id}`}
          >
            {resolveRoleDisplayName(ui, role.name)}
            <button
              type="button"
              aria-label={`${resolveRoleDisplayName(ui, role.name)} — ${ui('removeRoleAria')}`}
              onClick={(e) => removeRole(role.id, e)}
              className="hover:text-destructive"
              data-testid={`AssignTemplateRolesControl__chip-remove-${role.id}`}
            >
              <X className="h-3 w-3" data-testid="X__16443b" />
            </button>
          </span>
        ))}
        {overflowCount > 0 && (
          <span
            className="inline-flex items-center rounded-md bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium"
            data-testid="AssignTemplateRolesControl__overflow"
          >
            +{overflowCount}
          </span>
        )}
        <ChevronDown
          className="h-3.5 w-3.5 ml-auto text-muted-foreground"
          data-testid="ChevronDown__16443b" />
      </div>
      {isEditing && (
        <div className="flex flex-col gap-1 rounded-lg border border-input bg-card p-2 pl-4" data-testid="AssignTemplateRolesControl__options">
          {roles.map((role) => {
            const checked = selectedRoleIds.includes(role.id);
            return (
              <label
                key={role.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                data-testid={`AssignTemplateRolesControl__toggle-${role.id}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRole(role.id)}
                  className="h-4 w-4 rounded border-input"
                />
                {resolveRoleDisplayName(ui, role.name)}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Opt into DetailView rendering this footer INSIDE the header card, aligned in the
// same horizontal grid as the native header fields (see buildHeaderFooter in
// DetailView.jsx: footerInline gates whether it lands in the principal Form's
// `trailing` slot vs. the detached below-card block). Precedent:
// TaxSifField.jsx:134. Unlike TaxSifField this component is NOT restructured to
// render as EntityForm grid-cell fragments — it stays a self-contained widget —
// so it occupies one grid cell as a whole and sizes itself with `w-full` (not a
// fixed max-width) to fill that cell like a native field does.
AssignTemplateRolesControl.inlineInHeaderCard = true;
