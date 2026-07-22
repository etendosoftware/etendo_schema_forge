import { useState, useEffect, useCallback } from 'react';
import { useUI } from '@/i18n';

function resolveId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value.id ?? value.value ?? null;
    return id == null || id === '' ? null : String(id);
  }
  return String(value);
}

/**
 * ETP-4512 — the user header's role-assignment control.
 *
 * `defaultRole` (Default_Ad_Role_ID) is the only column the Go SPA can write a single role
 * to, but its own native selector is restricted to roles the user already has (an EXISTS
 * against AD_User_Roles) — useless for assigning a NEW one. This control instead sources its
 * options from the userRoles.role selector (the AD_User_Roles child tab's own field, filtered
 * only by client) and writes through the normal defaultRole field on save, same as any other
 * header field. UserRoleAssignmentHandler (com.etendoerp.go) syncs AD_User_Roles from the saved
 * defaultRole value, enforcing at most one active role.
 */
export default function AssignRoleControl(props) {
  const { data, token, apiBaseUrl, onChange } = props;
  const ui = useUI();
  const currentRoleId = resolveId(data?.defaultRole);

  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !apiBaseUrl) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${apiBaseUrl}/userRoles/selectors/role?limit=50&offset=0`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const seen = new Set();
        const items = [];
        (d?.items ?? []).forEach((item) => {
          if (!item?.id || seen.has(item.id)) return;
          seen.add(item.id);
          items.push({ id: item.id, label: item.label || item.name || item.id });
        });
        setOptions(items);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token, apiBaseUrl]);

  const handleChange = useCallback((e) => {
    const newId = e.target.value || null;
    const selected = options.find((o) => o.id === newId);
    onChange?.('defaultRole', newId);
    onChange?.('defaultRole$_identifier', selected?.label ?? null);
  }, [options, onChange]);

  return (
    <div className="flex flex-col gap-2 max-w-[320px]">
      <label className="text-sm font-medium text-[#121217]" htmlFor="assign-role-select">
        {ui('assignedRole')}
      </label>
      <select
        id="assign-role-select"
        className="h-10 w-full rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm disabled:cursor-not-allowed"
        value={currentRoleId ?? ''}
        onChange={handleChange}
        disabled={loading}
        data-testid="AssignRoleControl__select"
      >
        <option value="">{ui('noRoleAssigned')}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
