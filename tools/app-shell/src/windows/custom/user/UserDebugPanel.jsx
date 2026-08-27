import { useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { forceAcceptInvitation, forceInvitationStatus } from '@/lib/debugInvitationBypassApi.js';

// ETP-4830 (item #4) — dev/QA-only panel, activated by typing `debuguser` anywhere in the app
// (see useUserDebugMode.js). Same fixed-panel visual convention as fiscal-monitor's own
// FiscalMonitorDebugPanel.jsx (top-right, dark, monospace) — not draggable here, since this
// panel is simpler (two actions, no per-field toggles) and dragging isn't worth the extra hook.
//
// Both actions call the `SFDebugInvitationBypass` webhook (com.etendoerp.go), which itself 404s
// when its own backend flag is off — this panel rendering behind the keystroke sequence is a
// soft discoverability gate on top of that real boundary, not a substitute for it.
const STATUS_OPTIONS = ['PENDING', 'SENT', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'DELIVERY_FAILED'];

const panelStyle = {
  position: 'fixed',
  top: 56,
  right: 16,
  zIndex: 9999,
  background: '#1a1a2e',
  color: '#e0e0ff',
  borderRadius: 10,
  padding: '10px 14px',
  minWidth: 260,
  boxShadow: '0 4px 24px rgba(0,0,0,.45)',
  fontSize: 12,
  fontFamily: 'var(--font-mono, monospace)',
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#2d2d4a',
  border: '1px solid #3d3d5c',
  borderRadius: 6,
  color: '#e0e0ff',
  padding: '4px 8px',
  fontSize: 12,
  fontFamily: 'inherit',
  marginBottom: 6,
};

const buttonStyle = {
  width: '100%',
  background: '#5423E7',
  border: '1px solid #7a55ff',
  borderRadius: 6,
  color: '#e0e0ff',
  cursor: 'pointer',
  padding: '4px 10px',
  fontSize: 12,
  fontFamily: 'inherit',
  marginBottom: 8,
};

/**
 * @param {{ users?: Array<{id?: string, email?: string}>, onDataMutated?: () => void }} props
 *   `users` seeds the email `<datalist>` (from the Users grid rows already loaded, if the
 *   caller has them) so a tester doesn't have to retype an email by hand. Reachable without
 *   already knowing a specific user's route — the caller (`UserHeaderTable.jsx`) mounts it on
 *   the `/user` list itself.
 */
export default function UserDebugPanel({ users = [], onDataMutated }) {
  const ui = useUI();
  const [collapsed, setCollapsed] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('SENT');
  const [busy, setBusy] = useState(false);

  const handleForceAccept = async () => {
    const trimmed = email.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const result = await forceAcceptInvitation({ email: trimmed });
      const detail = result.temporaryPassword
        ? ui('userDebug.acceptSuccessWithPassword', { email: trimmed, password: result.temporaryPassword })
        : ui('userDebug.acceptSuccess', { email: trimmed });
      toast.success(detail, { duration: 8000 });
      onDataMutated?.();
    } catch (err) {
      toast.error(err?.message || ui('userDebug.requestFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleForceStatus = async () => {
    const trimmed = email.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await forceInvitationStatus({ email: trimmed, status });
      toast.success(ui('userDebug.statusSuccess', { status }));
      onDataMutated?.();
    } catch (err) {
      toast.error(err?.message || ui('userDebug.requestFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={panelStyle} data-testid="UserDebugPanel">
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : 8, userSelect: 'none' }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#a0a0cc', textTransform: 'uppercase' }}>
          {ui('userDebug.title')}
        </span>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ background: 'none', border: 'none', color: '#a0a0cc', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          data-testid="UserDebugPanel__toggleCollapse"
        >
          {collapsed ? '▾' : '▴'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div style={{ fontSize: 10, color: '#a0a0cc', marginBottom: 4 }}>{ui('userDebug.emailLabel')}</div>
          <input
            style={inputStyle}
            list="user-debug-panel-emails"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={ui('userDebug.emailPlaceholder')}
            data-testid="UserDebugPanel__email"
          />
          <datalist id="user-debug-panel-emails">
            {users.filter(u => u?.email).map(u => (
              <option key={u.id ?? u.email} value={u.email} />
            ))}
          </datalist>

          <button
            style={{ ...buttonStyle, opacity: busy || !email.trim() ? 0.6 : 1 }}
            onClick={handleForceAccept}
            disabled={busy || !email.trim()}
            data-testid="UserDebugPanel__forceAccept"
          >
            {ui('userDebug.forceAccept')}
          </button>

          <div style={{ fontSize: 10, color: '#a0a0cc', marginBottom: 4 }}>{ui('userDebug.statusLabel')}</div>
          <select
            style={inputStyle}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            data-testid="UserDebugPanel__statusSelect"
          >
            {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <button
            style={{ ...buttonStyle, marginBottom: 0, opacity: busy || !email.trim() ? 0.6 : 1 }}
            onClick={handleForceStatus}
            disabled={busy || !email.trim()}
            data-testid="UserDebugPanel__forceStatus"
          >
            {ui('userDebug.forceStatus')}
          </button>
        </>
      )}
    </div>
  );
}
