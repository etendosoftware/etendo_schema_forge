import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI } from '@/i18n';
import {
  Shield,
  Building2,
  KeyRound,
  RefreshCw,
  Check,
  LogOut,
} from 'lucide-react';

/**
 * Avatar button for the top-right header area.
 * Shows user initial and toggles the context switcher popover.
 */
export function UserAvatarButton({ isOpen, onClick }) {
  const { username, selectedRole } = useAuth();
  const initial = username?.charAt(0).toUpperCase() || '?';
  const roleInitial = selectedRole?.name?.charAt(0).toUpperCase() || '';

  return (
    <button
      onClick={onClick}
      className="relative h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
      title={username}
    >
      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
        isOpen
          ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
          : 'bg-primary/10 text-foreground hover:bg-primary/20'
      }`}>
        {initial}
      </div>
      {roleInitial && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-muted text-[8px] font-bold text-muted-foreground ring-1 ring-background">
          {roleInitial}
        </span>
      )}
    </button>
  );
}

/**
 * Context switcher popover — role/org selector with password re-entry support.
 * Renders as a portal positioned below the top-right header area.
 */
export function UserContextSwitcher({ onClose, positionClassName }) {
  const { username, roleList, selectedRole, selectedOrg, switchContext, logout } = useAuth();
  const ui = useUI();

  const [pendingRoleId, setPendingRoleId] = useState(selectedRole?.id || '');
  const [pendingOrgId, setPendingOrgId] = useState(selectedOrg?.id || '');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const pendingRole = roleList.find(r => r.id === pendingRoleId);
  const orgOptions = pendingRole?.orgList || [];

  const hasChanges = pendingRoleId !== (selectedRole?.id || '') ||
                     pendingOrgId !== (selectedOrg?.id || '');

  const handleRoleChange = (e) => {
    const roleId = e.target.value;
    setPendingRoleId(roleId);
    const role = roleList.find(r => r.id === roleId);
    setPendingOrgId(role?.orgList?.[0]?.id || '');
    setSuccess(false);
    setError(null);
  };

  const handleApply = async () => {
    if (!pendingRoleId || !pendingOrgId) return;
    setSwitching(true);
    setError(null);
    setSuccess(false);
    try {
      await switchContext(pendingRoleId, pendingOrgId, needsPassword ? password : undefined);
      setSuccess(true);
      setNeedsPassword(false);
      setPassword('');
    } catch (e) {
      if (e.message === 'SESSION_EXPIRED') {
        setNeedsPassword(true);
        setError(ui('enterPasswordToSwitch'));
      } else {
        setError(e.message || ui('failedToSwitch'));
      }
    } finally {
      setSwitching(false);
    }
  };

  return createPortal(
    <>
    {/* Invisible backdrop -- closes popover on click outside */}
    <div className="fixed inset-0 z-[100]" onClick={onClose} />
    <div
      className={`fixed z-[101] w-72 rounded-lg border bg-popover text-popover-foreground shadow-xl ${positionClassName || 'top-12 right-4'}`}
    >
      {/* Header */}
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">{username}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {selectedRole?.name || selectedRole?.id || ui('noRole')} &middot; {selectedOrg?.name || selectedOrg?.id || ui('noOrg')}
        </p>
      </div>

      {/* Context switcher */}
      <div className="px-4 py-3 space-y-3">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
            <Shield className="h-3 w-3" /> {ui('role')}
          </label>
          <select
            value={pendingRoleId}
            onChange={handleRoleChange}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>{ui('selectRole')}</option>
            {roleList.map(r => (
              <option key={r.id} value={r.id}>{r.name || r.id}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
            <Building2 className="h-3 w-3" /> {ui('organization')}
          </label>
          <select
            value={pendingOrgId}
            onChange={(e) => { setPendingOrgId(e.target.value); setSuccess(false); setError(null); }}
            disabled={orgOptions.length === 0}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          >
            <option value="" disabled>{ui('selectOrg')}</option>
            {orgOptions.map(o => (
              <option key={o.id} value={o.id}>{o.name || o.id}</option>
            ))}
          </select>
        </div>

        {needsPassword && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
              <KeyRound className="h-3 w-3" /> {ui('password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              placeholder={ui('yourPassword')}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}

        {hasChanges && (
          <button
            onClick={handleApply}
            disabled={switching || !pendingRoleId || !pendingOrgId || (needsPassword && !password)}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {switching ? (
              <><RefreshCw className="h-3 w-3 animate-spin" /> {ui('switching')}</>
            ) : (
              ui('apply')
            )}
          </button>
        )}

        {success && (
          <p className="flex items-center gap-1 text-xs text-green-600">
            <Check className="h-3 w-3" /> {ui('contextUpdated')}
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {/* Logout */}
      <div className="border-t px-4 py-2">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          {ui('logout')}
        </button>
      </div>
    </div>
    </>,
    document.body
  );
}
