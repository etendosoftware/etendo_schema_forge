import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { useUI } from '@/i18n';
import { resolveRoleDisplayName } from '@/lib/roleNameI18n.js';
import { fetchRolesOverview } from '@/lib/rolesApi.js';
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
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const containerRef = useRef(null);

  const hasPersistedUser = !!data?.id;

  useEffect(() => {
    if (!hasPersistedUser || !token || !apiBaseUrl) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    fetchRolesOverview()
      .then((res) => {
        if (cancelled) return;
        const templateRoles = (res?.roles ?? []).filter((r) => r?.isClientAdmin !== true);
        setRoles(templateRoles);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
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
      <div className="flex flex-col gap-2 max-w-[420px]" data-testid="AssignTemplateRolesControl__save-first">
        <label className="text-sm font-medium text-foreground">{ui('assignedRolesLabel')}</label>
        <p className="text-sm text-muted-foreground">{ui('saveUserFirstForRoles')}</p>
      </div>
    );
  }

  const selectedRoles = roles.filter((r) => selectedRoleIds.includes(r.id));
  const visibleChips = selectedRoles.slice(0, MAX_COLLAPSED_CHIPS);
  const overflowCount = selectedRoles.length - visibleChips.length;

  return (
    <div className="flex flex-col gap-2 max-w-[420px]" ref={containerRef} data-testid="AssignTemplateRolesControl">
      <label className="text-sm font-medium text-foreground">{ui('assignedRolesLabel')}</label>

      <button
        type="button"
        className="flex flex-wrap items-center gap-1.5 min-h-10 w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm disabled:cursor-not-allowed"
        onClick={() => setIsEditing((v) => !v)}
        disabled={loading}
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
            <span
              role="button"
              tabIndex={0}
              aria-label={`${resolveRoleDisplayName(ui, role.name)} — ${ui('removeRoleAria')}`}
              onClick={(e) => removeRole(role.id, e)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') removeRole(role.id, e); }}
              className="hover:text-destructive"
              data-testid={`AssignTemplateRolesControl__chip-remove-${role.id}`}
            >
              <X className="h-3 w-3" />
            </span>
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
        <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
      </button>

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
